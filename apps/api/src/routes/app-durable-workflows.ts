import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { randomUUID } from 'node:crypto'
import {
  BrandScrapeRequestSchema,
  CampaignGenerationRequestSchema,
  DEFAULT_JOB_OPTIONS,
  DocumentIngestRequestSchema,
  QUEUE_NAMES,
  WorkflowApprovalSchema,
  durableIdempotencyTrace,
  hasBlockedOverrides,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import { ResearchRequestSchema } from '@amarktai/core/research-platform'
import { getArtifactFile } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { getBrandProfile } from '../lib/brand-profile-store.js'
import { authenticateAppKey } from './jobs.js'

type GrantResolution = { grant: AppCapabilityGrantContext; source: string }

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} }
}

function forbiddenAuthority(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) { const found = forbiddenAuthority(item); if (found) return found }
    return null
  }
  const record = value as Record<string, unknown>
  const blocked = hasBlockedOverrides(record)
  if (blocked) return blocked
  for (const child of Object.values(record)) { const found = forbiddenAuthority(child); if (found) return found }
  return null
}

async function resolveGrant(appSlug: string, capability: CapabilityKey, legacy: readonly string[]): Promise<GrantResolution | null> {
  const resolution = await resolveAppCapabilityGrantSnapshot(appSlug, capability, [...legacy])
  return resolution?.grant.enabled ? resolution as GrantResolution : null
}

function enforceWorkflowBudget(grant: AppCapabilityGrantContext, requested: number): string | null {
  return grant.maxCostPerWorkflow > 0 && requested > grant.maxCostPerWorkflow
    ? `Requested maximum credits ${requested} exceed the workflow grant ceiling ${grant.maxCostPerWorkflow}.`
    : null
}

function executionResponse(parent: Awaited<ReturnType<typeof prisma.job.findFirst>>, children: Awaited<ReturnType<typeof prisma.job.findMany>>) {
  if (!parent) return null
  const metadata = safeJson(parent.metadataJson)
  return {
    executionId: parent.executionId,
    parentJobId: parent.id,
    capability: parent.capability,
    status: parent.status,
    phase: parent.workflowPhase,
    progress: parent.progress,
    artifactId: parent.artifactId,
    result: parent.output ? safeJson(parent.output) : null,
    error: parent.error,
    approval: metadata.approval ?? null,
    evidence: children.map((child) => {
      const childMetadata = safeJson(child.metadataJson)
      return { jobId: child.id, role: childMetadata.workflowRole ?? null, capability: child.capability, status: child.status, phase: child.workflowPhase, provider: child.provider, model: child.model, artifactId: child.artifactId, error: child.error }
    }),
  }
}

async function createChild(input: {
  queue: Queue
  parent: { id: string; appSlug: string; executionId: string; traceId: string }
  capability: CapabilityKey
  prompt: string
  requestInput: Record<string, unknown>
  role: string
  grant: GrantResolution
  metadata?: Record<string, unknown>
}) {
  const existing = await prisma.job.findFirst({
    where: { parentJobId: input.parent.id, appSlug: input.parent.appSlug, metadataJson: { contains: `\"workflowRole\":\"${input.role}\"` } },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  const createdAt = new Date().toISOString()
  const metadata = {
    durableWorkflow: true,
    workflowRole: input.role,
    parentJobId: input.parent.id,
    executionId: input.parent.executionId,
    appGrantSnapshot: input.grant.grant,
    appGrantSnapshotSource: input.grant.source,
    appGrantSnapshotAt: createdAt,
    executionProfile: 'external_app',
    ...input.metadata,
  }
  const child = await prisma.job.create({
    data: {
      appSlug: input.parent.appSlug, capability: input.capability, prompt: input.prompt,
      inputJson: JSON.stringify(input.requestInput), metadataJson: JSON.stringify(metadata),
      traceId: `${input.parent.traceId}_${input.role}`, status: 'queued', parentJobId: input.parent.id,
      executionId: input.parent.executionId, workflowPhase: `${input.role}_queued`, queuedAt: new Date(),
    },
  })
  const payload: JobPayload = {
    jobId: child.id, appSlug: child.appSlug, capability: input.capability, executionProfile: 'external_app',
    prompt: input.prompt, input: input.requestInput, metadata, traceId: child.traceId,
    routingMode: input.grant.grant.routingMode ?? 'automatic', appGrantSnapshot: input.grant.grant,
  }
  await input.queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
  await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id } })
  return child
}

async function findParent(appSlug: string, capability: CapabilityKey, id: string) {
  return prisma.job.findFirst({ where: { appSlug, capability, parentJobId: null, OR: [{ id }, { executionId: id }] } })
}

export async function appDurableWorkflowRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for durable workflows')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/brand-scrape/executions', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const blocked = forbiddenAuthority(request.body)
    if (blocked) return reply.status(400).send({ error: true, code: 'EXECUTION_AUTHORITY_FORBIDDEN', message: `Field '${blocked}' is Network-owned.` })
    let parsed
    try { parsed = BrandScrapeRequestSchema.safeParse(request.body) } catch (error) { return reply.status(400).send({ error: true, code: 'INVALID_BRAND_SCRAPE_REQUEST', message: error instanceof Error ? error.message : 'Brand scrape request validation failed.' }) }
    if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_BRAND_SCRAPE_REQUEST', message: 'Brand scrape request validation failed.', issues: parsed.error.issues })
    const legacy = auth.allowedCapabilities ?? []
    const [workflowGrant, researchGrant, structuredGrant] = await Promise.all([
      resolveGrant(auth.app!.slug, 'brand_scrape', legacy), resolveGrant(auth.app!.slug, 'research', legacy), resolveGrant(auth.app!.slug, 'structured_output', legacy),
    ])
    if (!workflowGrant || !researchGrant || !structuredGrant) return reply.status(403).send({ error: true, code: 'BRAND_SCRAPE_GRANT_REQUIRED', message: 'brand_scrape, research, and structured_output grants are required.' })
    if (!workflowGrant.grant.artifactWrite) return reply.status(403).send({ error: true, code: 'BRAND_SCRAPE_ARTIFACT_WRITE_REQUIRED', message: 'Brand scrape must allow artifact writes.' })
    const budgetError = enforceWorkflowBudget(workflowGrant.grant, parsed.data.maxCredits)
    if (budgetError) return reply.status(402).send({ error: true, code: 'WORKFLOW_BUDGET_EXCEEDED', message: budgetError })
    const traceId = durableIdempotencyTrace(auth.app!.slug, 'brand_scrape', parsed.data.idempotencyKey)
    const duplicate = await prisma.job.findFirst({ where: { appSlug: auth.app!.slug, capability: 'brand_scrape', parentJobId: null, traceId } })
    if (duplicate) return reply.status(202).send({ executionId: duplicate.executionId, parentJobId: duplicate.id, status: duplicate.status, phase: duplicate.workflowPhase, deduplicated: true })
    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const metadata = { durableWorkflow: true, workflowKind: 'brand_scrape', workflowGrantSnapshot: workflowGrant.grant, workflowGrantSnapshotSource: workflowGrant.source, workflowGrantSnapshotAt: createdAt, structuredGrant: structuredGrant.grant, structuredGrantSource: structuredGrant.source, approval: { required: true, status: 'not_ready' } }
    const parent = await prisma.job.create({ data: { appSlug: auth.app!.slug, capability: 'brand_scrape', prompt: `Extract a governed Brand Profile proposal from ${parsed.data.url}`, inputJson: JSON.stringify(parsed.data), metadataJson: JSON.stringify(metadata), traceId, status: 'processing', progress: 3, executionId, workflowPhase: 'url_validation' } })
    const research = ResearchRequestSchema.parse({ query: `Extract brand, offering, asset, claim and legal evidence from ${parsed.data.url}`, mode: 'browse', seedUrls: [parsed.data.url], maxPages: parsed.data.maxPages, maxDepth: parsed.data.crawlDepth, includeSnapshots: true, answer: false })
    try {
      const child = await createChild({ queue: getQueue(), parent, capability: 'research', prompt: research.query, requestInput: research, role: 'brand_evidence_collection', grant: researchGrant, metadata: { researchEvidence: true, internalLocalExecution: true, brandScrapeEvidence: true } })
      await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'page_retrieval', progress: 8, metadataJson: JSON.stringify({ ...metadata, evidenceJobId: child.id }) } })
      return reply.status(202).send({ executionId, parentJobId: parent.id, evidenceJobId: child.id, status: 'processing', phase: 'page_retrieval' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Brand scrape queue submission failed'
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', workflowPhase: 'queue_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, code: 'BRAND_SCRAPE_QUEUE_FAILED', message })
    }
  })

  app.post('/api/v1/document-ingest/executions', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const blocked = forbiddenAuthority(request.body)
    if (blocked) return reply.status(400).send({ error: true, code: 'EXECUTION_AUTHORITY_FORBIDDEN', message: `Field '${blocked}' is Network-owned.` })
    const parsed = DocumentIngestRequestSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_DOCUMENT_INGEST_REQUEST', message: 'Document ingest request validation failed.', issues: parsed.error.issues })
    const source = await prisma.artifact.findFirst({ where: { id: parsed.data.sourceArtifactId, appSlug: auth.app!.slug, status: 'completed' } })
    if (!source) return reply.status(404).send({ error: true, code: 'SOURCE_ARTIFACT_NOT_FOUND', message: 'Authorised source document was not found.' })
    const file = await getArtifactFile(source.id)
    if (!file?.buffer.length) return reply.status(409).send({ error: true, code: 'SOURCE_ARTIFACT_BYTES_MISSING', message: 'Source document bytes are missing.' })
    const legacy = auth.allowedCapabilities ?? []
    const [workflowGrant, embeddingGrant, ocrGrant] = await Promise.all([
      resolveGrant(auth.app!.slug, 'document_ingest', legacy), resolveGrant(auth.app!.slug, 'embeddings', legacy), resolveGrant(auth.app!.slug, 'ocr', legacy),
    ])
    if (!workflowGrant || !embeddingGrant || (parsed.data.ocrMode !== 'never' && !ocrGrant)) return reply.status(403).send({ error: true, code: 'DOCUMENT_INGEST_GRANT_REQUIRED', message: 'document_ingest, embeddings, and OCR-when-enabled grants are required.' })
    if (!workflowGrant.grant.artifactRead || !workflowGrant.grant.artifactWrite) return reply.status(403).send({ error: true, code: 'DOCUMENT_INGEST_ARTIFACT_GRANT_REQUIRED', message: 'Document ingest requires artifact read and write grants.' })
    const budgetError = enforceWorkflowBudget(workflowGrant.grant, parsed.data.maxCredits)
    if (budgetError) return reply.status(402).send({ error: true, code: 'WORKFLOW_BUDGET_EXCEEDED', message: budgetError })
    const checksum = safeJson(source.metadata).inspection && typeof (safeJson(source.metadata).inspection as Record<string, unknown>).checksum === 'string'
      ? String((safeJson(source.metadata).inspection as Record<string, unknown>).checksum)
      : (await import('node:crypto')).createHash('sha256').update(file.buffer).digest('hex')
    const traceId = durableIdempotencyTrace(auth.app!.slug, 'document_ingest', `${parsed.data.documentId}:${checksum}`)
    const duplicate = await prisma.job.findFirst({ where: { appSlug: auth.app!.slug, capability: 'document_ingest', parentJobId: null, traceId } })
    if (duplicate) return reply.status(202).send({ executionId: duplicate.executionId, parentJobId: duplicate.id, status: duplicate.status, phase: duplicate.workflowPhase, deduplicated: true })
    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const metadata = { durableWorkflow: true, workflowKind: 'document_ingest', sourceChecksum: checksum, workflowGrantSnapshot: workflowGrant.grant, workflowGrantSnapshotSource: workflowGrant.source, workflowGrantSnapshotAt: createdAt, embeddingGrant: embeddingGrant.grant, embeddingGrantSource: embeddingGrant.source, ocrGrant: ocrGrant?.grant ?? null, ocrGrantSource: ocrGrant?.source ?? null }
    const parent = await prisma.job.create({ data: { appSlug: auth.app!.slug, capability: 'document_ingest', prompt: `Ingest authorised document ${parsed.data.documentId}`, inputJson: JSON.stringify(parsed.data), metadataJson: JSON.stringify(metadata), traceId, status: 'processing', progress: 3, executionId, workflowPhase: 'source_authorization' } })
    try {
      const child = await createChild({ queue: getQueue(), parent, capability: 'document_ingest', prompt: 'Inspect and extract the authorised source document.', requestInput: parsed.data, role: 'document_extraction', grant: workflowGrant, metadata: { documentExtraction: true, internalLocalExecution: true, sourceChecksum: checksum } })
      await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'document_extraction', progress: 8, metadataJson: JSON.stringify({ ...metadata, extractionJobId: child.id }) } })
      return reply.status(202).send({ executionId, parentJobId: parent.id, extractionJobId: child.id, status: 'processing', phase: 'document_extraction', checksum })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document ingest queue submission failed'
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', workflowPhase: 'queue_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, code: 'DOCUMENT_INGEST_QUEUE_FAILED', message })
    }
  })

  app.post('/api/v1/campaign-generation/executions', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const blocked = forbiddenAuthority(request.body)
    if (blocked) return reply.status(400).send({ error: true, code: 'EXECUTION_AUTHORITY_FORBIDDEN', message: `Field '${blocked}' is Network-owned.` })
    const parsed = CampaignGenerationRequestSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_CAMPAIGN_GENERATION_REQUEST', message: 'Campaign generation request validation failed.', issues: parsed.error.issues })
    const profile = await getBrandProfile(auth.app!.slug, parsed.data.brandProfileId)
    if (!profile || profile.status !== 'verified') return reply.status(409).send({ error: true, code: 'VERIFIED_BRAND_PROFILE_REQUIRED', message: 'Campaign generation requires an app-owned verified Brand Profile.' })
    const offering = profile.offerings.find((item) => item.offeringId === parsed.data.offeringId)
    if (!offering) return reply.status(409).send({ error: true, code: 'APPROVED_OFFERING_REQUIRED', message: 'Campaign generation requires an offering from the verified Brand Profile.' })
    if (!parsed.data.audienceIds.every((id) => profile.audiences.some((audience) => audience.audienceId === id))) return reply.status(409).send({ error: true, code: 'APPROVED_AUDIENCE_REQUIRED', message: 'Campaign audiences must belong to the verified Brand Profile.' })
    const legacy = auth.allowedCapabilities ?? []
    const [workflowGrant, structuredGrant] = await Promise.all([resolveGrant(auth.app!.slug, 'campaign_generation', legacy), resolveGrant(auth.app!.slug, 'structured_output', legacy)])
    if (!workflowGrant || !structuredGrant) return reply.status(403).send({ error: true, code: 'CAMPAIGN_GENERATION_GRANT_REQUIRED', message: 'campaign_generation and structured_output grants are required.' })
    if (!workflowGrant.grant.artifactWrite) return reply.status(403).send({ error: true, code: 'CAMPAIGN_ARTIFACT_WRITE_REQUIRED', message: 'Campaign generation must allow artifact writes.' })
    const budgetError = enforceWorkflowBudget(workflowGrant.grant, parsed.data.budgetCredits)
    if (budgetError) return reply.status(402).send({ error: true, code: 'WORKFLOW_BUDGET_EXCEEDED', message: budgetError })
    const traceId = durableIdempotencyTrace(auth.app!.slug, 'campaign_generation', parsed.data.idempotencyKey)
    const duplicate = await prisma.job.findFirst({ where: { appSlug: auth.app!.slug, capability: 'campaign_generation', parentJobId: null, traceId } })
    if (duplicate) return reply.status(202).send({ executionId: duplicate.executionId, parentJobId: duplicate.id, status: duplicate.status, phase: duplicate.workflowPhase, deduplicated: true })
    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const context = { request: parsed.data, brand: { brandProfileId: profile.brandProfileId, displayName: profile.displayName, summary: profile.summary, positioning: profile.positioning, approvedClaims: profile.approvedClaims, prohibitedClaims: profile.prohibitedClaims, audiences: profile.audiences.filter((item) => parsed.data.audienceIds.includes(item.audienceId)), offering }, sourceArtifactIds: profile.visual.assets.filter((asset) => asset.approved && asset.rightsVerified).map((asset) => asset.artifactId) }
    const metadata = { durableWorkflow: true, workflowKind: 'campaign_generation', workflowGrantSnapshot: workflowGrant.grant, workflowGrantSnapshotSource: workflowGrant.source, workflowGrantSnapshotAt: createdAt, approval: { required: true, status: 'not_ready' } }
    const parent = await prisma.job.create({ data: { appSlug: auth.app!.slug, capability: 'campaign_generation', prompt: `Create a governed campaign plan for ${profile.displayName}: ${parsed.data.objective}`, inputJson: JSON.stringify(parsed.data), metadataJson: JSON.stringify(metadata), traceId, status: 'processing', progress: 5, executionId, workflowPhase: 'ownership_validation' } })
    try {
      const child = await createChild({ queue: getQueue(), parent, capability: 'structured_output', prompt: parent.prompt, requestInput: { schema: { type: 'object', required: ['version', 'campaignId', 'objective', 'audiences', 'channelPlan', 'contentPillars', 'messaging', 'offers', 'claims', 'disclaimers', 'assetPlan', 'schedule', 'kpis', 'budgetAllocation', 'approvalGates', 'citations', 'executionEvidence'], additionalProperties: true }, context: JSON.stringify(context) }, role: 'campaign_strategy', grant: structuredGrant, metadata: { campaignGenerationStrategy: true, campaignContext: context } })
      await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'strategy_generation', progress: 15, metadataJson: JSON.stringify({ ...metadata, strategyJobId: child.id }) } })
      return reply.status(202).send({ executionId, parentJobId: parent.id, strategyJobId: child.id, status: 'processing', phase: 'strategy_generation' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Campaign generation queue submission failed'
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', workflowPhase: 'queue_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, code: 'CAMPAIGN_GENERATION_QUEUE_FAILED', message })
    }
  })

  for (const capability of ['brand_scrape', 'document_ingest', 'campaign_generation'] as const) {
    const path = capability.replaceAll('_', '-')
    app.get(`/api/v1/${path}/executions/:id`, async (request, reply) => {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
      const parent = await findParent(auth.app!.slug, capability, (request.params as { id: string }).id)
      if (!parent) return reply.status(404).send({ error: true, code: 'WORKFLOW_EXECUTION_NOT_FOUND', message: 'Workflow execution was not found for the authenticated app.' })
      const children = await prisma.job.findMany({ where: { parentJobId: parent.id, appSlug: auth.app!.slug }, orderBy: { createdAt: 'asc' } })
      return reply.send(executionResponse(parent, children))
    })

    app.post(`/api/v1/${path}/executions/:id/approval`, async (request, reply) => {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
      const parsed = WorkflowApprovalSchema.safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_WORKFLOW_APPROVAL', message: 'Approval request validation failed.', issues: parsed.error.issues })
      const parent = await findParent(auth.app!.slug, capability, (request.params as { id: string }).id)
      if (!parent) return reply.status(404).send({ error: true, code: 'WORKFLOW_EXECUTION_NOT_FOUND', message: 'Workflow execution was not found for the authenticated app.' })
      if (parent.status === 'completed') return reply.send({ executionId: parent.executionId, status: 'completed', phase: parent.workflowPhase, deduplicated: true })
      if (parent.workflowPhase !== 'human_approval_pending') return reply.status(409).send({ error: true, code: 'WORKFLOW_APPROVAL_NOT_READY', message: 'Workflow is not waiting for human approval.' })
      const metadata = safeJson(parent.metadataJson)
      const decidedAt = new Date().toISOString()
      if (parsed.data.decision !== 'approved') {
        const phase = parsed.data.decision === 'rejected' ? 'rejected' : 'revision_required'
        await prisma.job.update({ where: { id: parent.id }, data: { status: parsed.data.decision === 'rejected' ? 'failed' : 'processing', workflowPhase: phase, error: parsed.data.decision === 'rejected' ? parsed.data.notes : null, metadataJson: JSON.stringify({ ...metadata, approval: { ...parsed.data, status: phase, decidedAt } }), ...(parsed.data.decision === 'rejected' ? { completedAt: new Date() } : {}) } })
        return reply.send({ executionId: parent.executionId, status: parsed.data.decision === 'rejected' ? 'failed' : 'processing', phase })
      }
      if (capability === 'campaign_generation') {
        const input = CampaignGenerationRequestSchema.parse(safeJson(parent.inputJson))
        const plan = parent.output ? safeJson(parent.output).plan : null
        const result = await prisma.$transaction(async (tx) => {
          const claimed = await tx.job.updateMany({
            where: { id: parent.id, appSlug: parent.appSlug, status: 'processing', workflowPhase: 'human_approval_pending' },
            data: { workflowPhase: 'approval_activating' },
          })
          if (claimed.count !== 1) return null
          await tx.campaign.upsert({ where: { id: input.campaignId }, create: { id: input.campaignId, appSlug: parent.appSlug, brandId: input.brandProfileId, name: `Campaign ${input.campaignId}`, goal: input.objective, targetAudience: input.audienceIds.join(', '), platforms: JSON.stringify(input.channels), qualityTier: input.qualityProfile, approvalMode: 'manual_review', status: 'active', durationDays: Math.max(1, Math.ceil((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000) + 1), workflowId: parent.executionId, metadata: JSON.stringify({ request: input, plan, approval: { ...parsed.data, decidedAt } }) }, update: { status: 'active', workflowId: parent.executionId, metadata: JSON.stringify({ request: input, plan, approval: { ...parsed.data, decidedAt } }) } })
          const childRequestIds: string[] = []
          if (input.createChildSocialWorkflows) {
            const existing = await tx.campaignItem.findMany({ where: { campaignId: input.campaignId, metadata: { contains: `\"campaignGenerationExecutionId\":\"${parent.executionId}\"` } } })
            childRequestIds.push(...existing.map((item) => item.id))
            if (existing.length === 0) {
              const socialAdChannels = new Set(['instagram', 'tiktok', 'youtube', 'youtube_shorts', 'facebook', 'linkedin', 'x'])
              const requests = input.channels.flatMap((channel) => [
                { channel, workflowKind: 'social_content', contentType: 'social_post' },
                ...(socialAdChannels.has(channel) ? [{ channel, workflowKind: 'social_ad_video', contentType: 'short_video' }] : []),
              ])
              for (const requestItem of requests) {
                const item = await tx.campaignItem.create({ data: {
                  campaignId: input.campaignId,
                  platform: requestItem.channel,
                  contentType: requestItem.contentType,
                  title: `${requestItem.channel} ${requestItem.workflowKind.replaceAll('_', ' ')} request`,
                  promptSummary: input.objective,
                  status: 'draft',
                  approvalStatus: 'approved_plan',
                  metadata: JSON.stringify({ campaignGenerationExecutionId: parent.executionId, workflowKind: requestItem.workflowKind, workflowCapability: 'social_content_generation', dispatchStatus: 'approved_request_not_dispatched', createdAfterApproval: true }),
                } })
                childRequestIds.push(item.id)
              }
            }
          }
          const output = { ...safeJson(parent.output), childRequests: childRequestIds.map((id) => ({ id, status: 'approved_request_not_dispatched' })) }
          await tx.job.update({ where: { id: parent.id }, data: { status: 'completed', workflowPhase: 'completed', progress: 100, completedAt: new Date(), output: JSON.stringify(output), metadataJson: JSON.stringify({ ...metadata, approval: { ...parsed.data, status: 'approved', decidedAt }, childRequestIds }) } })
          return childRequestIds
        })
        if (!result) return reply.send({ executionId: parent.executionId, status: 'completed', phase: 'completed', deduplicated: true })
        return reply.send({ executionId: parent.executionId, status: 'completed', phase: 'completed', artifactId: parent.artifactId, approval: { status: 'approved', decidedAt }, childRequestIds: result })
      }
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'completed', workflowPhase: 'completed', progress: 100, completedAt: new Date(), metadataJson: JSON.stringify({ ...metadata, approval: { ...parsed.data, status: 'approved', decidedAt } }) } })
      return reply.send({ executionId: parent.executionId, status: 'completed', phase: 'completed', artifactId: parent.artifactId, approval: { status: 'approved', decidedAt } })
    })

    app.post(`/api/v1/${path}/executions/:id/cancel`, async (request, reply) => {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
      const parent = await findParent(auth.app!.slug, capability, (request.params as { id: string }).id)
      if (!parent) return reply.status(404).send({ error: true, code: 'WORKFLOW_EXECUTION_NOT_FOUND', message: 'Workflow execution was not found for the authenticated app.' })
      if (parent.status === 'cancelled') return reply.send({ executionId: parent.executionId, status: 'cancelled', deduplicated: true })
      if (parent.status === 'completed') return reply.status(409).send({ error: true, code: 'WORKFLOW_NOT_CANCELLABLE', message: 'Completed workflow cannot be cancelled.' })
      const cancelledAt = new Date()
      await prisma.$transaction([
        prisma.job.updateMany({ where: { id: parent.id, appSlug: auth.app!.slug, status: { in: ['queued', 'processing'] } }, data: { status: 'cancelled', workflowPhase: 'cancelled', error: 'Cancelled by authorised app request', completedAt: cancelledAt } }),
        prisma.job.updateMany({ where: { parentJobId: parent.id, appSlug: auth.app!.slug, status: { in: ['queued', 'processing'] } }, data: { status: 'cancelled', workflowPhase: 'cancelled', error: 'Parent workflow cancelled by authorised app request', completedAt: cancelledAt } }),
      ])
      return reply.send({ executionId: parent.executionId, status: 'cancelled', cancelledAt: cancelledAt.toISOString() })
    })
  }
}
