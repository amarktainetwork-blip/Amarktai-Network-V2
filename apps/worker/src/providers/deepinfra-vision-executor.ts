import {
  canReadSourceArtifactForApp,
  createCanonicalProviderUsage,
  type AppCapabilityGrantContext,
  type CapabilityKey,
} from '@amarktai/core'
import { getArtifactFile, getArtifactRecord } from '@amarktai/artifacts'
import { getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { deepinfraVision, normalizeProviderError } from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'
import { sampleVideoFrames } from '../video-frame-sampler.js'

const SUPPORTED_VISION_CAPABILITIES = new Set<CapabilityKey>([
  'image_classification',
  'visual_question_answering',
  'document_qa',
  'ocr',
  'video_understanding',
])

function readGrant(payload: WorkerJobData): AppCapabilityGrantContext | null {
  const snapshot = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const grant = snapshot as AppCapabilityGrantContext
  if (grant.appSlug !== payload.appSlug || grant.capability !== payload.capability || !grant.enabled) return null
  return grant
}

function readString(input: Record<string, unknown> | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = input?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readSampleCount(input: Record<string, unknown> | undefined): number {
  const value = input?.sampleCount
  return typeof value === 'number' && Number.isInteger(value) ? Math.max(2, Math.min(value, 12)) : 6
}

function responseSchema(capability: CapabilityKey): Record<string, unknown> {
  if (capability === 'video_understanding') {
    return {
      type: 'object',
      required: ['summary', 'scores', 'issues', 'frameObservations'],
      properties: {
        summary: { type: 'string' },
        scores: {
          type: 'object',
          required: ['promptAdherence', 'brandConsistency', 'visualQuality', 'composition', 'temporalContinuity', 'safety'],
          properties: {
            promptAdherence: { type: 'number', minimum: 0, maximum: 100 },
            brandConsistency: { type: 'number', minimum: 0, maximum: 100 },
            visualQuality: { type: 'number', minimum: 0, maximum: 100 },
            composition: { type: 'number', minimum: 0, maximum: 100 },
            temporalContinuity: { type: 'number', minimum: 0, maximum: 100 },
            safety: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
        issues: { type: 'array', items: { type: 'string' } },
        frameObservations: { type: 'array', items: { type: 'string' } },
        recommended: { type: 'boolean' },
      },
    }
  }
  if (capability === 'ocr') {
    return { type: 'object', required: ['text'], properties: { text: { type: 'string' }, blocks: { type: 'array' } } }
  }
  if (capability === 'image_classification') {
    return { type: 'object', required: ['labels'], properties: { labels: { type: 'array' }, summary: { type: 'string' } } }
  }
  return { type: 'object', required: ['answer'], properties: { answer: { type: 'string' }, evidence: { type: 'array' } } }
}

function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim()
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
    trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1),
  ]
  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // Try the next bounded candidate.
    }
  }
  throw new Error('DeepInfra vision returned invalid JSON')
}

function numberInRange(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function validateVisionOutput(capability: CapabilityKey, output: Record<string, unknown>): void {
  if (capability !== 'video_understanding') {
    if (Object.keys(output).length === 0) throw new Error(`${capability} returned an empty object`)
    return
  }
  if (typeof output.summary !== 'string' || !output.summary.trim()) throw new Error('Video understanding summary is empty')
  const scores = output.scores
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw new Error('Video understanding scores are missing')
  const scoreRecord = scores as Record<string, unknown>
  for (const key of ['promptAdherence', 'brandConsistency', 'visualQuality', 'composition', 'temporalContinuity', 'safety']) {
    if (!numberInRange(scoreRecord[key])) throw new Error(`Video understanding score is invalid: ${key}`)
  }
  if (!Array.isArray(output.issues) || !output.issues.every((item) => typeof item === 'string')) throw new Error('Video understanding issues are invalid')
  if (!Array.isArray(output.frameObservations) || !output.frameObservations.every((item) => typeof item === 'string')) throw new Error('Video frame observations are invalid')
}

export async function executeDeepInfraVisionCapability(
  payload: WorkerJobData,
  selectedModel: string,
): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey
  if (!SUPPORTED_VISION_CAPABILITIES.has(capability)) {
    return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: `Unsupported DeepInfra vision capability: ${capability}` }
  }
  const grant = readGrant(payload)
  if (!grant?.artifactRead) {
    return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: 'AppCapabilityGrant denies vision source-artifact read.' }
  }
  const sourceArtifactId = readString(payload.input, [
    'artifactId',
    'videoArtifactId',
    'imageArtifactId',
    'documentArtifactId',
    'sourceArtifactId',
  ])
  if (!sourceArtifactId) {
    return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: `${capability} requires a source artifact ID` }
  }

  try {
    const source = await getArtifactRecord(sourceArtifactId)
    if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) {
      return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: 'Authorised source artifact was not found' }
    }
    const file = await getArtifactFile(sourceArtifactId)
    if (!file?.buffer.length) {
      return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: 'Source artifact bytes are missing' }
    }

    let images: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: Buffer }>
    let sampledTimestamps: number[] = []
    let durationSeconds: number | null = null
    if (source.mimeType.startsWith('video/')) {
      const samples = await sampleVideoFrames({
        videoBuffer: file.buffer,
        mimeType: source.mimeType,
        sampleCount: readSampleCount(payload.input),
      })
      images = samples.frames.map((frame) => ({ mimeType: frame.mimeType, data: frame.data }))
      sampledTimestamps = samples.frames.map((frame) => frame.timestampSeconds)
      durationSeconds = samples.durationSeconds
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(source.mimeType)) {
      images = [{ mimeType: source.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: file.buffer }]
    } else {
      return { success: false, status: 'failed', provider: 'deepinfra', model: selectedModel, error: `Unsupported vision source MIME type: ${source.mimeType}` }
    }

    const credential = await resolveProviderApiKey('deepinfra')
    const providerStatus = await getProviderCredentialStatus('deepinfra')
    const schema = responseSchema(capability)
    const result = await deepinfraVision({
      apiKey: credential.apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      model: selectedModel,
      images,
      systemPrompt: 'You are an evidence-first media analyst. Use only visible evidence from the supplied ordered frames. Never invent unseen motion or brand facts. Return one JSON object only.',
      prompt: [
        payload.prompt,
        `Capability: ${capability}.`,
        `The images are ordered timeline samples from the same source artifact${durationSeconds ? ` lasting ${durationSeconds.toFixed(3)} seconds` : ''}.`,
        `Return JSON matching this schema: ${JSON.stringify(schema)}`,
      ].join(' '),
      responseFormat: { type: 'json_object' },
      maxTokens: 4_096,
    })
    const output = extractJsonObject(result.content)
    validateVisionOutput(capability, output)

    return {
      success: true,
      status: 'completed',
      provider: 'deepinfra',
      model: result.model,
      output: JSON.stringify(output),
      metadata: {
        sourceArtifactId,
        sourceMimeType: source.mimeType,
        frameCount: images.length,
        sampledTimestamps,
        durationSeconds,
        evidenceSource: 'live_provider_multimodal_frames',
        outputValidation: { valid: true, contract: `${capability}_deepinfra_vision_json` },
        usage: createCanonicalProviderUsage({
          provider: 'deepinfra',
          model: result.model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          imageCount: images.length,
          providerReportedCost: result.usage.providerReportedCost,
          currency: result.usage.currency,
        }),
      },
    }
  } catch (error) {
    const normalized = normalizeProviderError('deepinfra', error)
    return {
      success: false,
      status: 'failed',
      provider: 'deepinfra',
      model: selectedModel,
      error: normalized.message,
      metadata: {
        sourceArtifactId,
        errorClassification: normalized.code,
        retryable: normalized.retryable,
        httpStatus: normalized.status,
      },
    }
  }
}
