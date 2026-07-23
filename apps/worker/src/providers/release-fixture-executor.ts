import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  canReadSourceArtifactForApp,
  checksumArtifactBytes,
  createCanonicalProviderUsage,
  inspectDocumentArtifact,
  inspectImageArtifact,
  SPECIALIST_VISION_CAPABILITIES,
  validateSpecialistVisionResult,
  type CapabilityKey,
  type ProviderKey,
  type SpecialistVisionCapability,
} from '@amarktai/core'
import { findCompletedArtifactByTraceId, getArtifactFile, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'
import { inspectVideoArtifactBytes, sampleVideoFrames } from '../video-frame-sampler.js'
import {
  publicGovernedVoiceEvidence,
  resolveGovernedVoice,
  type PublicGovernedVoiceEvidence,
} from './governed-voice-resolver.js'

const runFile = promisify(execFile)
const FIXTURE_SWITCH = 'release-candidate-v1'
const FIXTURE_SAFETY_TOKEN = 'amarktai-release-fixture-local-ci-v1'
const EXISTING_VISION_CAPABILITIES = ['image_classification', 'visual_question_answering', 'document_qa', 'ocr', 'video_understanding'] as const

function hasFixtureDatabase(): boolean {
  try {
    const database = new URL(process.env.DATABASE_URL ?? '')
    return database.hostname === 'mariadb' && database.pathname === '/amarktai_fixture'
  } catch {
    return false
  }
}

export function isReleaseFixtureAdapterEnabled(): boolean {
  return process.env.NODE_ENV === 'test'
    && process.env.RELEASE_FIXTURE_MODE === 'true'
    && process.env.RELEASE_FIXTURE_SAFETY_TOKEN === FIXTURE_SAFETY_TOKEN
    && process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === FIXTURE_SWITCH
    && hasFixtureDatabase()
}

export function assertFixtureAdapterConfiguration(): void {
  const configured = [
    process.env.AMARKTAI_TEST_FIXTURE_ADAPTER,
    process.env.RELEASE_FIXTURE_MODE,
    process.env.RELEASE_FIXTURE_SAFETY_TOKEN,
  ].some((value) => Boolean(value?.trim()))
  if (configured && !isReleaseFixtureAdapterEnabled()) {
    throw new Error('Release fixture execution requires the exact test-only adapter, mode, safety token, and disposable MariaDB target')
  }
}

function fixtureRoute(capability: CapabilityKey): { provider: ProviderKey; model: string } {
  if (capability === 'image_generation') {
    return { provider: 'together', model: `fixture/${capability}` }
  }
  if (capability === 'video_generation' || capability === 'image_to_video' || capability === 'video_to_video'
    || capability === 'music_generation' || capability === 'song_generation'
    || capability === 'tts' || capability === 'stt') {
    return { provider: 'genx', model: `fixture/${capability}` }
  }
  if (capability === 'embeddings' || capability === 'feature_extraction' || capability === 'sentence_similarity' || capability === 'reranking') {
    return { provider: 'deepinfra', model: `fixture/${capability}` }
  }
  return { provider: 'deepinfra', model: `fixture/${capability}` }
}

function textResult(payload: WorkerJobData, provider: ProviderKey, model: string): ProcessorResult {
  const prompt = payload.prompt.trim()
  let output: unknown = `Fixture response for: ${prompt}`
  if (payload.capability === 'structured_output') output = { fixture: true, summary: prompt.slice(0, 80) }
  if (payload.capability === 'structured_output' && payload.metadata?.socialAdCopyCandidate === true) {
    const context = payload.metadata.copyContext && typeof payload.metadata.copyContext === 'object'
      ? payload.metadata.copyContext as Record<string, unknown>
      : {}
    const channels = Array.isArray(context.channels) ? context.channels.filter((item): item is string => typeof item === 'string') : []
    const disclaimer = Array.isArray(context.disclaimers) ? context.disclaimers.filter((item): item is string => typeof item === 'string').join(' ') : ''
    const cta = typeof context.callToAction === 'string' ? context.callToAction : 'Learn more'
    const primaryText = `A deterministic, brand-safe product story for the approved campaign. ${disclaimer}`.trim()
    output = {
      headline: 'See the approved product break through',
      primaryText,
      shortCaption: 'The approved product, presented with clarity.',
      longCaption: `${primaryText} ${cta}.`,
      callToAction: cta,
      hashtags: ['#ProductStory'],
      claimsUsed: [],
      channelVariants: Object.fromEntries(channels.map((channel) => [channel, `${primaryText} ${cta}.`])),
    }
  }
  if (payload.capability === 'structured_output' && payload.metadata?.brandSignalExtraction === true) {
    const citations = Array.isArray(payload.metadata.brandCitations) ? payload.metadata.brandCitations : []
    const first = citations[0] && typeof citations[0] === 'object' ? citations[0] as Record<string, unknown> : null
    output = {
      version: 1,
      sourceWebsite: String(payload.metadata.sourceWebsite ?? first?.url ?? 'https://fixture.invalid/brand'),
      displayName: 'Fixture Evidence Brand',
      summary: 'An evidence-backed fixture Brand Profile proposal produced from governed crawl evidence.',
      colors: [], typographySignals: [], assetCandidates: [],
      offeringCandidates: [{ name: 'Fixture Offering', description: 'A cited offering candidate requiring human approval.', evidenceCitationIds: first ? [String(first.citationId)] : [] }],
      claims: [{ text: 'Fixture evidence supports governed execution.', evidenceCitationIds: first ? [String(first.citationId)] : [], humanReviewRequired: true }],
      legalSignals: [], citations,
      approval: { required: true, status: 'pending', materialVerifiedProfileChange: false },
    }
  }
  if (payload.capability === 'structured_output' && payload.metadata?.campaignGenerationStrategy === true) {
    const context = payload.metadata.campaignContext && typeof payload.metadata.campaignContext === 'object' ? payload.metadata.campaignContext as Record<string, unknown> : {}
    const request = context.request && typeof context.request === 'object' ? context.request as Record<string, unknown> : {}
    const brand = context.brand && typeof context.brand === 'object' ? context.brand as Record<string, unknown> : {}
    const offering = brand.offering && typeof brand.offering === 'object' ? brand.offering as Record<string, unknown> : {}
    const channels = Array.isArray(request.channels) ? request.channels.filter((item): item is string => typeof item === 'string') : []
    const audiences = Array.isArray(request.audienceIds) ? request.audienceIds.filter((item): item is string => typeof item === 'string') : []
    const budget = typeof request.budgetCredits === 'number' ? request.budgetCredits : 100
    const perChannel = channels.length ? budget / channels.length : budget
    const sourceIds = Array.isArray(context.sourceArtifactIds) ? context.sourceArtifactIds.filter((item): item is string => typeof item === 'string') : []
    const citations = sourceIds.slice(0, 1).map((sourceArtifactId, index) => ({ citationId: `campaign-source-${index + 1}`, sourceArtifactId, excerptHash: checksumArtifactBytes(Buffer.from(String(brand.summary ?? 'fixture brand evidence'))), page: null }))
    const claim = Array.isArray(offering.approvedClaims) && typeof offering.approvedClaims[0] === 'string' ? offering.approvedClaims[0] : 'Use only approved Brand Profile claims.'
    output = {
      version: 1, campaignId: String(request.campaignId ?? 'fixture-campaign'), objective: String(request.objective ?? payload.prompt),
      audiences: audiences.map((audienceId) => ({ audienceId, positioning: String(brand.positioning ?? brand.summary ?? 'Evidence-backed positioning') })),
      channelPlan: channels.map((channel) => ({ channel, purpose: 'Deliver the approved campaign objective.', cadence: 'Governed schedule', budgetCredits: perChannel })),
      contentPillars: ['Evidence-backed value', 'Approved offering'], messaging: [claim], offers: [String(offering.name ?? 'Approved offering')],
      claims: [{ text: claim, approved: true, citationIds: citations.map((citation) => citation.citationId) }],
      disclaimers: Array.isArray(offering.requiredDisclaimers) ? offering.requiredDisclaimers : [],
      assetPlan: channels.map((channel) => ({ assetType: 'social_content', channel, quantity: 1 })),
      schedule: channels.map((channel) => ({ date: String(request.startDate ?? '2026-07-22'), channel, activity: 'Publish approved campaign content' })),
      kpis: [{ name: 'Approved engagement measurement', definition: 'Observed engagement after publication; no fabricated forecast.', target: null, targetBasis: null, estimated: false }],
      budgetAllocation: channels.map((channel) => ({ category: channel, credits: perChannel })),
      approvalGates: [{ gate: 'human_plan_activation', required: true, status: 'pending' }], citations,
      executionEvidence: { strategyCandidateCount: 1, claimValidation: 'verified_profile_only', researchContextUsed: Array.isArray(request.researchExecutionIds) && request.researchExecutionIds.length > 0, ragContextUsed: typeof request.ragNamespace === 'string' },
    }
  }
  if (payload.capability === 'video_understanding' && payload.metadata?.socialAdQualityAnalysis === true) {
    output = {
      summary: 'Deterministic fixture evaluator observed a technically coherent product-breakout candidate; specialist visual assertions remain human-review-required.',
      scores: {
        promptAdherence: 96,
        brandConsistency: 96,
        visualQuality: 96,
        composition: 95,
        temporalContinuity: 96,
        safety: 100,
      },
      issues: [],
      frameObservations: ['Ordered fixture frames are stable and contain no generated text or prohibited claims.'],
      recommended: true,
    }
  }
  if (payload.capability === 'classification' || payload.capability === 'zero_shot_classification') output = { label: 'fixture_label', score: 0.99 }
  if (payload.capability === 'image_classification') output = { labels: [{ label: 'fixture_image', confidence: 0.99 }], summary: 'Deterministic authorised image classification.' }
  if (payload.capability === 'visual_question_answering' || payload.capability === 'document_qa') output = { answer: 'Deterministic answer grounded in the authorised source artifact.', evidence: [{ sourceArtifactId: payload.input?.imageArtifactId ?? payload.input?.documentArtifactId ?? payload.input?.artifactId }] }
  if (payload.capability === 'video_understanding') output = { summary: 'Deterministic ordered-frame fixture evidence.', scores: { promptAdherence: 96, brandConsistency: 96, visualQuality: 96, composition: 96, temporalContinuity: 96, safety: 100 }, issues: [], frameObservations: ['Fixture frames were sampled in timeline order.'], recommended: true }
  if (payload.capability === 'token_classification') output = [{ entity: 'FIXTURE', word: prompt.split(/\s+/)[0] || 'fixture', score: 0.99 }]
  if (payload.capability === 'fill_mask') output = [{ token_str: 'fixture', score: 0.99 }]
  if (payload.capability === 'table_qa') output = { answer: 'fixture answer', coordinates: [[0, 0]] }
  if (payload.capability === 'embeddings') {
    const texts = Array.isArray(payload.input?.texts) && payload.input.texts.length > 0 ? payload.input.texts : [prompt]
    const vectors = texts.map(() => [0.1, 0.2, 0.3, 0.4])
    output = { vectors, dimensions: 4, count: vectors.length }
  }
  if (payload.capability === 'feature_extraction') {
    const texts = Array.isArray(payload.input?.text) ? payload.input.text : [payload.input?.text ?? prompt]
    output = { features: texts.map(() => [0.1, 0.2, 0.3, 0.4]), dimensions: 4 }
  }
  if (payload.capability === 'sentence_similarity') output = { scores: [0.99] }
  if (payload.capability === 'reranking') {
    const documents = Array.isArray(payload.input?.documents) ? payload.input.documents : []
    output = {
      results: documents.map((document, index) => ({
        index,
        score: Math.max(0.5, 0.99 - index * 0.01),
        text: typeof document === 'object' && document !== null && 'text' in document
          ? String((document as Record<string, unknown>).text ?? '')
          : String(document ?? ''),
      })),
    }
  }
  if (payload.capability === 'question_answering') {
    const sourceIds = Array.isArray(payload.input?.sourceIds)
      ? payload.input.sourceIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    output = {
      answer: 'AmarktAI Network owns provider routing, model selection, grants, durable execution, evidence, artifacts, quality gates, budgets, memory and RAG.',
      supportedByContext: sourceIds.length > 0,
      sourceIds: sourceIds.slice(0, 1),
    }
  }
  if (payload.capability === 'stt') output = { transcript: 'Deterministic fixture transcription.', language: 'en', duration: 2, segments: [] }
  if (payload.capability === 'ocr') output = { text: 'Deterministic fixture OCR text from the authorised source document.', blocks: [{ page: 1, text: 'Deterministic fixture OCR text from the authorised source document.' }] }

  return {
    success: true,
    status: 'completed',
    provider,
    model,
    output: typeof output === 'string' ? output : JSON.stringify(output),
    metadata: {
      evidenceSource: 'local_fixture',
      liveProviderProof: false,
      usage: createCanonicalProviderUsage({ provider, model, inputTokens: 4, outputTokens: 8, totalTokens: 12 }),
      outputValidation: { valid: true, contract: 'deterministic_release_fixture' },
    },
  }
}

async function verifySourceArtifact(payload: WorkerJobData): Promise<string | null> {
  if (!['image_to_video', 'video_to_video', 'stt', ...SPECIALIST_VISION_CAPABILITIES, ...EXISTING_VISION_CAPABILITIES].includes(payload.capability as SpecialistVisionCapability)) return null
  const sourceId = typeof payload.input?.sourceArtifactId === 'string'
      ? payload.input.sourceArtifactId
    : typeof payload.input?.imageArtifactId === 'string'
      ? payload.input.imageArtifactId
      : typeof payload.input?.videoArtifactId === 'string'
        ? payload.input.videoArtifactId
        : typeof payload.input?.documentArtifactId === 'string'
          ? payload.input.documentArtifactId
    : typeof payload.input?.sourceImageArtifactId === 'string'
      ? payload.input.sourceImageArtifactId
      : typeof payload.input?.sourceVideoArtifactId === 'string'
        ? payload.input.sourceVideoArtifactId
        : typeof payload.input?.sourceDocumentArtifactId === 'string'
          ? payload.input.sourceDocumentArtifactId
        : typeof payload.input?.audioArtifactId === 'string'
          ? payload.input.audioArtifactId
          : typeof payload.input?.artifactId === 'string'
            ? payload.input.artifactId
            : null
  if (!sourceId) throw new Error(`Fixture ${payload.capability} requires a source artifact`)
  const source = await getArtifactRecord(sourceId)
  if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) {
    throw new Error('Authorised source artifact was not found')
  }
  const expected = ['image_to_video', 'depth_estimation', 'keypoint_detection', 'mask_generation', 'zero_shot_object_detection', 'image_classification', 'visual_question_answering'].includes(payload.capability)
    ? 'image/'
    : ['video_to_video', 'video_classification', 'video_understanding'].includes(payload.capability)
      ? 'video/'
      : ['visual_document_retrieval', 'document_qa', 'ocr'].includes(payload.capability)
        ? ''
        : 'audio/'
  if (!source.mimeType.startsWith(expected)) throw new Error(`Source artifact must have MIME type ${expected}*`)
  return sourceId
}

async function saveFixtureJson(payload: WorkerJobData, subType: string, title: string, value: unknown) {
  const artifact = await saveArtifact({
    input: {
      appSlug: payload.appSlug,
      type: 'document',
      subType,
      title,
      description: 'Deterministic local release fixture evidence; never live provider proof.',
      provider: 'deepinfra',
      model: `fixture/${payload.capability}`,
      traceId: `${payload.traceId}_${subType}`,
      mimeType: 'application/json',
      metadata: { capability: payload.capability, evidenceSource: 'local_fixture', liveProviderProof: false },
    },
    data: Buffer.from(JSON.stringify(value, null, 2)),
    explicitMimeType: 'application/json',
  })
  return { artifactId: artifact.id, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes }
}

async function saveFixturePng(payload: WorkerJobData, subType: string, title: string, filter: string) {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const dir = await mkdtemp(join(tmpdir(), 'amarktai-specialist-fixture-'))
  try {
    const path = join(dir, `${subType}.png`)
    await runFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=0.1', '-vf', filter, '-frames:v', '1', '-threads', '1', '-y', path])
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug, type: 'image', subType, title,
        description: 'Deterministic structurally valid specialist-vision fixture artifact.',
        provider: 'deepinfra', model: `fixture/${payload.capability}`, traceId: `${payload.traceId}_${subType}`,
        mimeType: 'image/png', metadata: { capability: payload.capability, width: 320, height: 180, evidenceSource: 'local_fixture', liveProviderProof: false },
      },
      data: await readFile(path), explicitMimeType: 'image/png',
    })
    return { artifactId: artifact.id, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function executeSpecialistFixture(payload: WorkerJobData, sourceArtifactId: string): Promise<ProcessorResult> {
  const capability = payload.capability as SpecialistVisionCapability
  const provider: ProviderKey = 'deepinfra'
  const model = `fixture/${capability}`
  const source = await getArtifactRecord(sourceArtifactId)
  const file = await getArtifactFile(sourceArtifactId)
  if (!source || !file?.buffer.length) throw new Error('Authorised specialist source artifact bytes are missing')
  const checksum = checksumArtifactBytes(file.buffer)
  const provenance = { sourceArtifactId, sourceChecksum: checksum, evidenceSource: 'local_fixture' as const, liveProviderProof: false }
  let output: Record<string, unknown>

  if (capability === 'depth_estimation') {
    const inspected = inspectImageArtifact(file.buffer)
    const depthMap = await saveFixturePng(payload, 'depth_map', 'Relative depth map', 'geq=lum=255*X/W:cb=128:cr=128,format=gray')
    const visualization = payload.input?.visualization === false ? null : await saveFixturePng(payload, 'depth_visualization', 'Relative depth visualization', 'geq=r=255*X/W:g=80:b=255*(1-X/W)')
    output = { depthType: 'relative', unit: 'normalized', dimensions: { width: inspected.width, height: inspected.height }, range: { min: 0, max: 1 }, depthMap, visualization, provenance }
  } else if (capability === 'keypoint_detection') {
    const inspected = inspectImageArtifact(file.buffer)
    const entities = [{ entityId: 'fixture-entity-1', entityType: String(payload.input?.domain ?? 'generic'), confidence: 0.98, keypoints: [{ name: 'centre', x: 160, y: 90, confidence: 0.98 }] }]
    const structuredArtifact = await saveFixtureJson(payload, 'keypoints_json', 'Keypoint detections', { dimensions: { width: inspected.width, height: inspected.height }, entities })
    const overlay = payload.input?.overlay === false ? null : await saveFixturePng(payload, 'keypoints_overlay', 'Keypoint overlay', 'drawbox=x=156:y=86:w=8:h=8:color=lime:t=fill')
    output = { dimensions: { width: inspected.width, height: inspected.height }, entities, structuredArtifact, overlay, provenance }
  } else if (capability === 'mask_generation') {
    const inspected = inspectImageArtifact(file.buffer)
    const maskArtifact = await saveFixturePng(payload, 'binary_mask', 'Binary mask', 'drawbox=x=80:y=45:w=160:h=90:color=white:t=fill,format=gray')
    const masks = [{ maskId: 'fixture-mask-1', semanticLabel: payload.input?.guidance && typeof payload.input.guidance === 'object' && 'className' in payload.input.guidance ? String(payload.input.guidance.className) : null, confidence: null, artifact: maskArtifact }]
    const structuredArtifact = await saveFixtureJson(payload, 'masks_json', 'Mask metadata', { dimensions: { width: inspected.width, height: inspected.height }, masks })
    const overlay = payload.input?.overlay === false ? null : await saveFixturePng(payload, 'mask_overlay', 'Mask overlay', 'drawbox=x=80:y=45:w=160:h=90:color=green@0.6:t=fill')
    output = { dimensions: { width: inspected.width, height: inspected.height }, masks, structuredArtifact, overlay, provenance }
  } else if (capability === 'zero_shot_object_detection') {
    const inspected = inspectImageArtifact(file.buffer)
    const labels = Array.isArray(payload.input?.candidateLabels) ? payload.input.candidateLabels.filter((item): item is string => typeof item === 'string') : []
    const detections = labels.length ? [{ detectionId: 'fixture-detection-1', label: labels[0], confidence: 0.97, box: { x: 80, y: 45, width: 160, height: 90 } }] : []
    const structuredArtifact = await saveFixtureJson(payload, 'detections_json', 'Zero-shot detections', { dimensions: { width: inspected.width, height: inspected.height }, detections })
    const overlay = payload.input?.overlay === false ? null : await saveFixturePng(payload, 'detections_overlay', 'Detection overlay', 'drawbox=x=80:y=45:w=160:h=90:color=yellow:t=3')
    output = { dimensions: { width: inspected.width, height: inspected.height }, detections, structuredArtifact, overlay, provenance }
  } else if (capability === 'visual_document_retrieval') {
    const inspected = inspectDocumentArtifact(file.buffer)
    const text = inspected.detectedMimeType === 'text/plain' ? file.buffer.toString('utf8').trim() : 'Fixture visual document page evidence.'
    const excerpt = text.slice(0, 500) || 'Fixture visual document page evidence.'
    const results = [{ rank: 1, page: 1, section: null, region: null, extractedText: excerpt, score: 0.99, citation: { citationId: `${sourceArtifactId}:page-1`, sourceArtifactId, page: 1, excerptHash: checksumArtifactBytes(Buffer.from(excerpt)) } }]
    const retrievalEvidenceArtifact = await saveFixtureJson(payload, 'visual_document_retrieval_evidence', 'Visual document retrieval evidence', { documentId: String(payload.input?.ingestedDocumentId ?? sourceArtifactId), results })
    output = { documentId: String(payload.input?.ingestedDocumentId ?? sourceArtifactId), sourceArtifactId, results, retrievalEvidenceArtifact, provenance }
  } else {
    const inspection = await inspectVideoArtifactBytes(file.buffer, source.mimeType)
    const samples = await sampleVideoFrames({ videoBuffer: file.buffer, mimeType: source.mimeType, sampleCount: 3 })
    const duration = inspection.durationSeconds
    const labels = Array.isArray(payload.input?.candidateLabels) ? payload.input.candidateLabels.filter((item): item is string => typeof item === 'string') : [String(payload.input?.governedTaxonomy ?? 'fixture_video')]
    const selected = labels[0] ?? 'fixture_video'
    const labelResults = [{ label: selected, confidence: 0.97 }]
    const segments = payload.input?.temporalSegmentation === true ? [{ startSeconds: 0, endSeconds: duration, labels: labelResults }] : []
    const samplingEvidence = { profile: String(payload.input?.samplingProfile ?? 'balanced'), sampledTimestampsSeconds: samples.frames.map((frame) => frame.timestampSeconds), frameCount: samples.frames.length }
    const structuredArtifact = await saveFixtureJson(payload, 'video_classification_json', 'Video classification evidence', { sourceDurationSeconds: duration, labels: labelResults, segments, samplingEvidence })
    output = { sourceDurationSeconds: duration, labels: labelResults, segments, samplingEvidence, structuredArtifact, provenance }
  }

  validateSpecialistVisionResult(capability, output, payload.input ?? {})
  const primary = capability === 'depth_estimation'
    ? (output.depthMap as { artifactId: string })
    : capability === 'mask_generation'
      ? ((output.masks as Array<{ artifact: { artifactId: string } }>)[0]!.artifact)
      : (output.structuredArtifact ?? output.retrievalEvidenceArtifact) as { artifactId: string }
  return {
    success: true, status: 'completed', provider, model, artifactId: primary.artifactId, output: JSON.stringify(output),
    metadata: { evidenceSource: 'local_fixture', liveProviderProof: false, sourceArtifactId, usage: createCanonicalProviderUsage({ provider, model, imageCount: capability === 'video_classification' ? 3 : 1 }), outputValidation: { valid: true, contract: `${capability}_fixture_v1` } },
  }
}

async function generateFixtureMedia(capability: CapabilityKey, payload: WorkerJobData): Promise<{ data: Buffer; mimeType: string; type: 'image' | 'video' | 'audio' | 'music'; duration?: number; width?: number; height?: number }> {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const dir = await mkdtemp(join(tmpdir(), 'amarktai-release-fixture-'))
  try {
    if (capability === 'image_generation') {
      const output = join(dir, 'fixture.png')
      await runFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x14532d:s=320x180:d=0.1', '-frames:v', '1', '-threads', '1', '-y', output])
      return { data: await readFile(output), mimeType: 'image/png', type: 'image', width: 320, height: 180 }
    }
    if (capability === 'tts' || capability === 'music_generation' || capability === 'song_generation') {
      const output = join(dir, 'fixture.wav')
      const frequency = capability === 'tts' ? '660' : '330'
      await runFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=2`, '-ac', '1', '-c:a', 'pcm_s16le', '-y', output])
      return { data: await readFile(output), mimeType: 'audio/wav', type: capability === 'tts' ? 'audio' : 'music', duration: 2 }
    }
    if (capability === 'stt') {
      const transcriptData = JSON.stringify({ text: 'Deterministic fixture transcription.', language: 'en', duration: 2, segments: [] })
      return { data: Buffer.from(transcriptData), mimeType: 'application/json', type: 'audio', duration: 2 }
    }
    const output = join(dir, 'fixture.mp4')
    const requestedDuration = typeof payload.input?.duration === 'number' && Number.isFinite(payload.input.duration)
      ? Math.max(2, Math.min(10, payload.input.duration))
      : 2
    await runFile(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=0x172554:s=320x180:r=24:d=${requestedDuration}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${requestedDuration}`,
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-movflags', '+faststart', '-y', output,
    ])
    return { data: await readFile(output), mimeType: 'video/mp4', type: 'video', duration: requestedDuration, width: 320, height: 180 }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function executeReleaseFixture(payload: WorkerJobData): Promise<ProcessorResult> {
  if (!isReleaseFixtureAdapterEnabled()) throw new Error('Release fixture adapter is not enabled')
  const capability = payload.capability as CapabilityKey
  const { provider, model } = fixtureRoute(capability)
  let governedTtsVoice: PublicGovernedVoiceEvidence | null = null
  if (capability === 'tts') {
    const resolvedVoice = await resolveGovernedVoice({ payload, provider: 'genx', selectedModel: model })
    governedTtsVoice = publicGovernedVoiceEvidence(resolvedVoice.resolution)
  }
  const grant = payload.appGrantSnapshot
  if (['image_to_video', 'video_to_video', 'stt', ...SPECIALIST_VISION_CAPABILITIES, ...EXISTING_VISION_CAPABILITIES].includes(capability as SpecialistVisionCapability) && !grant?.artifactRead) {
    return { success: false, status: 'failed', provider, model, error: `AppCapabilityGrant denies source-artifact read for '${capability}'.` }
  }
  if (['image_generation', 'video_generation', 'image_to_video', 'video_to_video', 'music_generation', 'song_generation', 'tts', 'stt', ...SPECIALIST_VISION_CAPABILITIES].includes(capability as SpecialistVisionCapability) && !grant?.artifactWrite) {
    return { success: false, status: 'failed', provider, model, error: `AppCapabilityGrant denies artifact write for '${capability}'.` }
  }
  const sourceArtifactId = await verifySourceArtifact(payload)

  if ((SPECIALIST_VISION_CAPABILITIES as readonly string[]).includes(capability)) {
    if (!sourceArtifactId) throw new Error(`${capability} requires an authorised source artifact`)
    return executeSpecialistFixture(payload, sourceArtifactId)
  }

  if (!['image_generation', 'video_generation', 'image_to_video', 'video_to_video', 'music_generation', 'song_generation', 'tts', 'stt'].includes(capability)) {
    return textResult(payload, provider, model)
  }

  const existing = await findCompletedArtifactByTraceId(payload.traceId, capability)
  if (existing) {
    return {
      success: true,
      status: 'completed',
      provider,
      model,
      artifactId: existing.id,
      output: JSON.stringify({ artifactId: existing.id, artifactUrl: existing.storageUrl, mimeType: existing.mimeType, fileSizeBytes: existing.fileSizeBytes, reused: true }),
      metadata: { evidenceSource: 'local_fixture', liveProviderProof: false, outputValidation: { valid: true, contract: 'reused_release_fixture_artifact' } },
    }
  }

  const media = await generateFixtureMedia(capability, payload)
  const artifact = await saveArtifact({
    input: {
      appSlug: payload.appSlug,
      type: media.type,
      subType: capability,
      title: `${capability} deterministic fixture`,
      description: 'Local release-candidate fixture evidence; never live provider proof.',
      provider,
      model,
      traceId: payload.traceId,
      mimeType: media.mimeType,
      metadata: {
        capability,
        provider,
        model,
        source: 'deterministic local fixture',
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        governedTtsVoice,
        sourceArtifactId,
        duration: media.duration,
        width: media.width,
        height: media.height,
        longFormVideo: payload.metadata?.longFormVideo === true,
        parentJobId: payload.metadata?.parentJobId,
        executionId: payload.metadata?.executionId,
        sceneNumber: payload.metadata?.sceneNumber,
      },
    },
    data: media.data,
    explicitMimeType: media.mimeType,
  })
  const output: Record<string, unknown> = {
    artifactId: artifact.id,
    artifactUrl: artifact.storageUrl,
    mimeType: artifact.mimeType,
    fileSizeBytes: artifact.fileSizeBytes,
    duration: media.duration,
    width: media.width,
    height: media.height,
    sourceArtifactId,
  }
  if (capability === 'stt') {
    const transcriptData = JSON.parse(media.data.toString('utf8'))
    output.transcript = transcriptData.text
    output.language = transcriptData.language
    output.segments = transcriptData.segments
  }
  return {
    success: true,
    status: 'completed',
    provider,
    model,
    artifactId: artifact.id,
    output: JSON.stringify(output),
    metadata: {
      ...output,
      evidenceSource: 'local_fixture',
      liveProviderProof: false,
      governedTtsVoice,
      usage: createCanonicalProviderUsage({ provider, model, audioSeconds: media.type === 'audio' || media.type === 'music' ? media.duration : undefined, videoSeconds: media.type === 'video' ? media.duration : undefined, imageCount: media.type === 'image' ? 1 : undefined }),
      outputValidation: { valid: true, contract: 'ffmpeg_generated_release_fixture' },
    },
  }
}
