import type { Queue } from 'bullmq'
import { findCompletedArtifactByTraceId, saveArtifact } from '@amarktai/artifacts'
import {
  BrandProfileProposalSchema,
  CampaignGenerationRequestSchema,
  CampaignPlanSchema,
  DEFAULT_JOB_OPTIONS,
  DocumentIngestRequestSchema,
  QDRANT_COLLECTION,
  chunkDocumentPages,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type DocumentPageText,
  type JobPayload,
} from '@amarktai/core'
import { ragCollectionForDimensions, ragPointId } from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { deletePointsByFilter, upsertPoints } from '@amarktai/providers'
import { readResearchEvidenceArtifact } from './research-evidence-executor.js'
import { parseEmbeddingOutput } from './rag-workflow-common.js'

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function grantFrom(value: unknown, appSlug: string, capability: CapabilityKey): AppCapabilityGrantContext {
  const grant = objectValue(value) as unknown as AppCapabilityGrantContext | null
  if (!grant || !grant.enabled || grant.appSlug !== appSlug || grant.capability !== capability) throw new Error(`Immutable ${capability} grant snapshot is missing or invalid`)
  return grant
}

async function findRole(parentId: string, appSlug: string, role: string) {
  return prisma.job.findFirst({ where: { parentJobId: parentId, appSlug, metadataJson: { contains: `\"workflowRole\":\"${role}\"` } }, orderBy: { createdAt: 'asc' } })
}

async function queueChild(input: {
  queue: Queue
  parent: Awaited<ReturnType<typeof prisma.job.findUnique>> & {}
  capability: CapabilityKey
  role: string
  prompt: string
  requestInput: Record<string, unknown>
  grant: AppCapabilityGrantContext
  grantSource: string
  metadata?: Record<string, unknown>
}) {
  const existing = await findRole(input.parent.id, input.parent.appSlug, input.role)
  if (existing) return existing
  const at = new Date().toISOString()
  const metadata = { durableWorkflow: true, workflowRole: input.role, parentJobId: input.parent.id, executionId: input.parent.executionId, appGrantSnapshot: input.grant, appGrantSnapshotSource: input.grantSource, appGrantSnapshotAt: at, executionProfile: 'external_app', ...input.metadata }
  const child = await prisma.job.create({ data: { appSlug: input.parent.appSlug, capability: input.capability, prompt: input.prompt, inputJson: JSON.stringify(input.requestInput), metadataJson: JSON.stringify(metadata), traceId: `${input.parent.traceId}_${input.role}`, status: 'queued', parentJobId: input.parent.id, executionId: input.parent.executionId, workflowPhase: `${input.role}_queued`, queuedAt: new Date() } })
  const payload: JobPayload = { jobId: child.id, appSlug: child.appSlug, capability: input.capability, executionProfile: 'external_app', prompt: child.prompt, input: input.requestInput, metadata, traceId: child.traceId, routingMode: input.grant.routingMode ?? 'automatic', appGrantSnapshot: input.grant }
  await input.queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
  await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id } })
  return child
}

async function failParent(parentId: string, phase: string, error: unknown) {
  await prisma.job.update({ where: { id: parentId }, data: { status: 'failed', workflowPhase: phase, progress: 0, error: error instanceof Error ? error.message : String(error), completedAt: new Date() } })
}

async function advanceBrandScrape(parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>, queue: Queue): Promise<void> {
  const metadata = safeJson(parent.metadataJson)
  const evidence = await findRole(parent.id, parent.appSlug, 'brand_evidence_collection')
  if (!evidence) return
  if (['failed', 'cancelled'].includes(evidence.status)) return failParent(parent.id, 'page_retrieval_failed', evidence.error ?? 'Brand evidence collection failed')
  if (evidence.status !== 'completed' || !evidence.artifactId) return

  let signal = await findRole(parent.id, parent.appSlug, 'brand_signal_extraction')
  if (!signal) {
    const research = await readResearchEvidenceArtifact(evidence.artifactId)
    const citations = research.sources.map((source) => ({ citationId: source.citationId, sourceId: source.sourceId, url: source.canonicalUrl, title: source.title, contentHash: source.contentHash, capturedAt: source.retrievedAt }))
    const grant = grantFrom(metadata.structuredGrant, parent.appSlug, 'structured_output')
    signal = await queueChild({ queue, parent, capability: 'structured_output', role: 'brand_signal_extraction', prompt: 'Extract only evidence-backed brand signals and produce a review-required Brand Profile proposal.', requestInput: { schema: { type: 'object', required: ['version', 'sourceWebsite', 'displayName', 'summary', 'colors', 'typographySignals', 'assetCandidates', 'offeringCandidates', 'claims', 'legalSignals', 'citations', 'approval'], additionalProperties: true }, context: JSON.stringify({ request: safeJson(parent.inputJson), citations, sources: research.sources.map((source) => ({ citationId: source.citationId, url: source.canonicalUrl, title: source.title, extractedText: source.extractedText.slice(0, 50_000) })) }) }, grant, grantSource: String(metadata.structuredGrantSource ?? 'resolved'), metadata: { brandSignalExtraction: true, brandCitations: citations, sourceWebsite: String(safeJson(parent.inputJson).url ?? '') } })
    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'brand_signal_extraction', progress: 60 } })
    return
  }
  if (['failed', 'cancelled'].includes(signal.status)) return failParent(parent.id, 'brand_signal_extraction_failed', signal.error ?? 'Brand signal extraction failed')
  if (signal.status !== 'completed' || !signal.output) return
  try {
    const proposal = BrandProfileProposalSchema.parse(JSON.parse(signal.output))
    const existing = await findCompletedArtifactByTraceId(parent.traceId, 'brand_profile_proposal')
    const artifact = existing ?? await saveArtifact({ input: { appSlug: parent.appSlug, type: 'document', subType: 'brand_profile_proposal', title: `${proposal.displayName} Brand Profile proposal`, description: 'Evidence-backed Brand Profile proposal awaiting human approval.', provider: signal.provider ?? 'amarktai-network', model: signal.model ?? 'brand-signal-extraction-v1', traceId: parent.traceId, mimeType: 'application/json', metadata: { brandScrape: true, executionId: parent.executionId, parentJobId: parent.id, sourceWebsite: proposal.sourceWebsite, citationCount: proposal.citations.length, approvalRequired: true, outputValidated: true } }, data: Buffer.from(JSON.stringify(proposal, null, 2)), explicitMimeType: 'application/json' })
    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'human_approval_pending', progress: 95, artifactId: artifact.id, output: JSON.stringify({ proposal, proposalArtifactId: artifact.id, verifiedProfileOverwritten: false }), metadataJson: JSON.stringify({ ...metadata, approval: { required: true, status: 'pending' }, proposalArtifactId: artifact.id, evidenceArtifactId: evidence.artifactId, signalJobId: signal.id }) } })
  } catch (error) { await failParent(parent.id, 'proposal_validation_failed', error) }
}

function pagesFromExtraction(extraction: Record<string, unknown>, ocr: Record<string, unknown> | null): DocumentPageText[] {
  if (ocr) {
    const text = typeof ocr.text === 'string' ? ocr.text.trim() : ''
    if (!text) throw new Error('OCR returned no text')
    return [{ page: 1, section: null, text, coordinates: null, parserEvidence: 'source_inspection_before_ocr', ocrEvidence: 'orchestra_ocr_output' }]
  }
  if (!Array.isArray(extraction.pages)) throw new Error('Document extraction pages are missing')
  return extraction.pages.map((page) => page as DocumentPageText)
}

async function advanceDocumentIngest(parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>, queue: Queue): Promise<void> {
  const metadata = safeJson(parent.metadataJson)
  const request = DocumentIngestRequestSchema.parse(safeJson(parent.inputJson))
  const extractionJob = await findRole(parent.id, parent.appSlug, 'document_extraction')
  if (!extractionJob) return
  if (['failed', 'cancelled'].includes(extractionJob.status)) return failParent(parent.id, 'document_extraction_failed', extractionJob.error ?? 'Document extraction failed')
  if (extractionJob.status !== 'completed' || !extractionJob.output) return
  const extraction = safeJson(extractionJob.output)
  let ocrJob = await findRole(parent.id, parent.appSlug, 'document_ocr')
  if (extraction.ocrRequired === true && !ocrJob) {
    const grant = grantFrom(metadata.ocrGrant, parent.appSlug, 'ocr')
    ocrJob = await queueChild({ queue, parent, capability: 'ocr', role: 'document_ocr', prompt: 'Extract text from the authorised document without inventing content.', requestInput: { documentArtifactId: request.sourceArtifactId }, grant, grantSource: String(metadata.ocrGrantSource ?? 'resolved'), metadata: { documentIngestOcr: true, sourceArtifactId: request.sourceArtifactId } })
    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'ocr', progress: 30 } })
    return
  }
  if (ocrJob && ['failed', 'cancelled'].includes(ocrJob.status)) return failParent(parent.id, 'ocr_failed', ocrJob.error ?? 'Document OCR failed')
  if (ocrJob && ocrJob.status !== 'completed') return
  try {
    const ocrOutput = ocrJob?.output ? safeJson(ocrJob.output) : null
    const pages = pagesFromExtraction(extraction, ocrOutput)
    const inspection = objectValue(extraction.inspection)
    const checksum = String(inspection?.checksum ?? metadata.sourceChecksum ?? '')
    const chunks = chunkDocumentPages({ appSlug: parent.appSlug, documentId: request.documentId, artifactId: request.sourceArtifactId, checksum, pages, chunkSize: request.chunkSize, chunkOverlap: request.chunkOverlap })
    let embeddingJob = await findRole(parent.id, parent.appSlug, 'document_embeddings')
    if (!embeddingJob) {
      const grant = grantFrom(metadata.embeddingGrant, parent.appSlug, 'embeddings')
      embeddingJob = await queueChild({ queue, parent, capability: 'embeddings', role: 'document_embeddings', prompt: 'Embed deterministic authorised document chunks.', requestInput: { texts: chunks.map((chunk) => chunk.text), normalize: true }, grant, grantSource: String(metadata.embeddingGrantSource ?? 'resolved'), metadata: { documentIngestEmbeddings: true, chunkCount: chunks.length } })
      await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'embedding_generation', progress: 55, metadataJson: JSON.stringify({ ...metadata, extractedPageCount: pages.length, chunkCount: chunks.length, ocrJobId: ocrJob?.id ?? null }) } })
      return
    }
    if (['failed', 'cancelled'].includes(embeddingJob.status)) return failParent(parent.id, 'embedding_failed', embeddingJob.error ?? 'Document embedding failed')
    if (embeddingJob.status !== 'completed') return
    const { vectors, dimensions } = parseEmbeddingOutput(embeddingJob.output)
    if (vectors.length !== chunks.length) throw new Error(`Embedding count ${vectors.length} does not match document chunk count ${chunks.length}`)
    const collection = ragCollectionForDimensions(QDRANT_COLLECTION, dimensions)
    const ingestedAt = new Date().toISOString()
    const points = chunks.map((chunk, index) => ({ id: ragPointId({ appSlug: parent.appSlug, namespace: request.namespace, sourceId: request.documentId, chunkHash: chunk.chunkHash }), vector: vectors[index]!, payload: { appSlug: parent.appSlug, namespace: request.namespace, documentId: request.documentId, sourceId: request.documentId, sourceArtifactId: request.sourceArtifactId, checksum, page: chunk.page, section: chunk.section, text: chunk.text, coordinates: chunk.coordinates, chunkIndex: chunk.chunkIndex, citationId: chunk.citationId, chunkHash: chunk.chunkHash, parserEvidence: chunk.parserEvidence, ocrEvidence: chunk.ocrEvidence, parentJobId: parent.id, executionId: parent.executionId, ingestedAt } }))
    const cleanup = await deletePointsByFilter({ must: [{ key: 'appSlug', match: { value: parent.appSlug } }, { key: 'documentId', match: { value: request.documentId } }] }, collection)
    const qdrant = await upsertPoints(points, collection)
    await prisma.$transaction(async (tx) => {
      await tx.documentIngestChunk.deleteMany({ where: { appSlug: parent.appSlug, documentId: request.documentId } })
      await tx.documentIngestChunk.createMany({ data: chunks.map((chunk, index) => ({ appSlug: chunk.appSlug, documentId: chunk.documentId, artifactId: chunk.artifactId, checksum: chunk.checksum, page: chunk.page, section: chunk.section, text: chunk.text, coordinatesJson: JSON.stringify(chunk.coordinates ?? null), chunkIndex: chunk.chunkIndex, chunkHash: chunk.chunkHash, citationId: chunk.citationId, embeddingReference: `${collection}:${points[index]!.id}`, parserEvidence: chunk.parserEvidence, ocrEvidence: chunk.ocrEvidence })) })
    })
    const manifest = { version: 1, executionId: parent.executionId, parentJobId: parent.id, appSlug: parent.appSlug, documentId: request.documentId, sourceArtifactId: request.sourceArtifactId, checksum, namespace: request.namespace, collection, dimensions, pageCount: pages.length, chunkCount: chunks.length, chunks: chunks.map((chunk, index) => ({ ...chunk, embeddingReference: `${collection}:${points[index]!.id}`, timestamp: ingestedAt })), extractionEvidence: { jobId: extractionJob.id, artifactId: extractionJob.artifactId }, ocrEvidence: ocrJob ? { jobId: ocrJob.id, provider: ocrJob.provider, model: ocrJob.model } : null, embeddingEvidence: { jobId: embeddingJob.id, provider: embeddingJob.provider, model: embeddingJob.model }, qdrant: { cleanup, upsert: qdrant }, partialPageFailures: extraction.partialPageFailures ?? [], ingestedAt }
    const artifact = await saveArtifact({ input: { appSlug: parent.appSlug, type: 'document', subType: 'document_ingest_manifest', title: `${request.title ?? request.documentId} ingestion manifest`, description: 'Page-preserving MariaDB and Qdrant document ingestion evidence.', provider: 'amarktai-network', model: 'document-ingest-v1', traceId: parent.traceId, mimeType: 'application/json', metadata: { documentIngest: true, executionId: parent.executionId, parentJobId: parent.id, documentId: request.documentId, checksum, collection, dimensions, pageCount: pages.length, chunkCount: chunks.length, outputValidated: true } }, data: Buffer.from(JSON.stringify(manifest, null, 2)), explicitMimeType: 'application/json' })
    await prisma.job.update({ where: { id: parent.id }, data: { status: 'completed', workflowPhase: 'completed', progress: 100, artifactId: artifact.id, output: JSON.stringify({ manifestArtifactId: artifact.id, documentId: request.documentId, sourceArtifactId: request.sourceArtifactId, checksum, namespace: request.namespace, collection, dimensions, pageCount: pages.length, chunkCount: chunks.length, ocrUsed: Boolean(ocrJob), qdrant }), metadataJson: JSON.stringify({ ...metadata, manifestArtifactId: artifact.id, collection, dimensions, pointIds: points.map((point) => point.id), completedAt: ingestedAt }), completedAt: new Date(), error: null } })
  } catch (error) { await failParent(parent.id, 'vector_persistence_failed', error) }
}

async function advanceCampaign(parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>): Promise<void> {
  const strategy = await findRole(parent.id, parent.appSlug, 'campaign_strategy')
  if (!strategy) return
  if (['failed', 'cancelled'].includes(strategy.status)) return failParent(parent.id, 'strategy_generation_failed', strategy.error ?? 'Campaign strategy generation failed')
  if (strategy.status !== 'completed' || !strategy.output) return
  try {
    const plan = CampaignPlanSchema.parse(JSON.parse(strategy.output))
    const request = CampaignGenerationRequestSchema.parse(safeJson(parent.inputJson))
    if (plan.campaignId !== request.campaignId) throw new Error('Campaign plan ID does not match the authorised request')
    const existing = await findCompletedArtifactByTraceId(parent.traceId, 'campaign_plan')
    const artifact = existing ?? await saveArtifact({ input: { appSlug: parent.appSlug, type: 'document', subType: 'campaign_plan', title: `Campaign plan ${request.campaignId}`, description: 'Structured, claim-validated campaign production plan awaiting human activation approval.', provider: strategy.provider ?? 'amarktai-network', model: strategy.model ?? 'campaign-plan-v1', traceId: parent.traceId, mimeType: 'application/json', metadata: { campaignGeneration: true, executionId: parent.executionId, parentJobId: parent.id, campaignId: request.campaignId, brandProfileId: request.brandProfileId, offeringId: request.offeringId, approvalRequired: true, outputValidated: true, forecastPolicy: 'estimates_must_be_labelled_with_basis' } }, data: Buffer.from(JSON.stringify(plan, null, 2)), explicitMimeType: 'application/json' })
    const metadata = safeJson(parent.metadataJson)
    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'human_approval_pending', progress: 95, artifactId: artifact.id, output: JSON.stringify({ plan, planArtifactId: artifact.id, childWorkflowCount: 0 }), metadataJson: JSON.stringify({ ...metadata, planArtifactId: artifact.id, strategyJobId: strategy.id, approval: { required: true, status: 'pending' }, childWorkflowKeys: [] }) } })
  } catch (error) { await failParent(parent.id, 'campaign_plan_validation_failed', error) }
}

export function isDurableClosureWorkflow(parent: { capability: string; metadataJson: unknown }): boolean {
  const metadata = safeJson(parent.metadataJson)
  return metadata.durableWorkflow === true && ['brand_scrape', 'document_ingest', 'campaign_generation'].includes(parent.capability)
}

export async function advanceDurableClosureWorkflow(parentId: string, queue: Queue): Promise<void> {
  const parent = await prisma.job.findUnique({ where: { id: parentId } })
  if (!parent || !isDurableClosureWorkflow(parent) || ['completed', 'failed', 'cancelled'].includes(parent.status)) return
  if (parent.capability === 'brand_scrape') return advanceBrandScrape(parent, queue)
  if (parent.capability === 'document_ingest') return advanceDocumentIngest(parent, queue)
  if (parent.capability === 'campaign_generation') return advanceCampaign(parent)
}
