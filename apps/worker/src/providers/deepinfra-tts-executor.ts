import { createCanonicalProviderUsage, type AppCapabilityGrantContext } from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { findCompletedArtifactByTraceId, saveArtifact } from '@amarktai/artifacts'
import { CanonicalProviderError, deepinfraTextToSpeech } from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const OUTPUT_FORMATS = new Set(['mp3', 'opus', 'flac', 'wav', 'pcm'])

export async function executeDeepInfraTts(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  if (payload.capability !== 'tts') return failure(`Unsupported DeepInfra audio capability '${payload.capability}'`, selectedModel)
  const grant = readGrant(payload)
  if (!grant?.enabled) return policyFailure('AppCapabilityGrant denies TTS execution.', selectedModel)
  if (!grant.artifactWrite) return policyFailure('AppCapabilityGrant denies TTS artifact write.', selectedModel)

  const input = readInput(payload)
  if (!input.ok) return policyFailure(input.error, selectedModel)

  try {
    const existing = await findCompletedArtifactByTraceId(payload.traceId, 'tts')
    if (existing) {
      return {
        success: true,
        status: 'completed',
        provider: 'deepinfra',
        model: selectedModel,
        artifactId: existing.id,
        output: JSON.stringify({ artifactId: existing.id, artifactUrl: existing.storageUrl, mimeType: existing.mimeType, fileSizeBytes: existing.fileSizeBytes, reused: true }),
        metadata: { reused: true, evidenceSource: 'live_provider', liveProviderProof: true, outputValidation: { valid: true, contract: 'reused_tts_artifact' } },
      }
    }

    const credential = await resolveProviderApiKey('deepinfra')
    const status = await getProviderCredentialStatus('deepinfra')
    const result = await deepinfraTextToSpeech({
      apiKey: credential.apiKey,
      baseUrl: status.baseUrl || undefined,
      model: selectedModel,
      text: input.data.text,
      voice: input.data.voice,
      responseFormat: input.data.responseFormat,
      speed: input.data.speed,
    })

    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'audio',
        subType: 'tts',
        title: `TTS audio for ${payload.appSlug}`,
        description: 'DeepInfra speech synthesis output',
        provider: 'deepinfra',
        model: selectedModel,
        traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability: 'tts',
          provider: 'deepinfra',
          model: selectedModel,
          duration: result.duration,
          voice: result.voice,
          evidenceSource: 'live_provider',
          liveProviderProof: true,
          providerEndpointFamily: 'deepinfra_v1/audio_speech',
        },
      },
      data: result.audioBuffer,
      explicitMimeType: result.mimeType,
    })

    const output = {
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      duration: result.duration,
      voice: result.voice,
    }
    return {
      success: true,
      status: 'completed',
      provider: 'deepinfra',
      model: selectedModel,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: {
        ...output,
        evidenceSource: 'live_provider',
        liveProviderProof: true,
        usage: createCanonicalProviderUsage({ provider: 'deepinfra', model: selectedModel, audioSeconds: result.duration }),
        outputValidation: { valid: true, contract: 'validated_audio_artifact_signature' },
      },
    }
  } catch (error) {
    if (error instanceof ProviderConfigError) throw error
    const canonical = error instanceof CanonicalProviderError
      ? error
      : new CanonicalProviderError({ code: 'provider_unavailable', provider: 'deepinfra', message: error instanceof Error ? error.message : 'DeepInfra TTS failed', cause: error })
    return failure(`deepinfra ${canonical.code}: ${canonical.message}`, selectedModel, {
      errorClassification: canonical.code,
      retryable: canonical.retryable,
      httpStatus: canonical.status,
      evidenceSource: 'live_provider',
      liveProviderProof: false,
    })
  }
}

function readInput(payload: WorkerJobData): { ok: true; data: { text: string; voice?: string; responseFormat: 'mp3' | 'opus' | 'flac' | 'wav' | 'pcm'; speed?: number } } | { ok: false; error: string } {
  const input = isRecord(payload.input) ? payload.input : {}
  const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim() : payload.prompt.trim()
  if (!text) return { ok: false, error: 'TTS text must be nonempty.' }
  if (text.length > 100_000) return { ok: false, error: 'TTS text exceeds the 100,000 character request limit.' }
  const voice = typeof input.voice === 'string' && input.voice.trim() ? input.voice.trim() : undefined
  const rawFormat = typeof input.outputFormat === 'string' && input.outputFormat.trim() ? input.outputFormat.trim().toLowerCase() : 'wav'
  if (!OUTPUT_FORMATS.has(rawFormat)) return { ok: false, error: 'TTS outputFormat must be mp3, opus, flac, wav, or pcm.' }
  const speed = typeof input.speed === 'number' ? input.speed : undefined
  if (speed !== undefined && (!Number.isFinite(speed) || speed < 0.25 || speed > 4)) return { ok: false, error: 'TTS speed must be between 0.25 and 4.' }
  return { ok: true, data: { text, voice, responseFormat: rawFormat as 'mp3' | 'opus' | 'flac' | 'wav' | 'pcm', speed } }
}

function readGrant(payload: WorkerJobData): Readonly<AppCapabilityGrantContext> | null {
  const candidate = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  if (!isRecord(candidate)) return null
  const grant = candidate as unknown as AppCapabilityGrantContext
  if (grant.appSlug !== payload.appSlug || grant.capability !== 'tts') return null
  if (typeof grant.enabled !== 'boolean' || typeof grant.artifactWrite !== 'boolean') return null
  return Object.freeze({ ...grant })
}

function policyFailure(error: string, model: string): ProcessorResult {
  return failure(error, model, { evidenceSource: 'platform_policy', liveProviderProof: false })
}

function failure(error: string, model: string, metadata: Record<string, unknown> = {}): ProcessorResult {
  return { success: false, status: 'failed', provider: 'deepinfra', model, error, metadata }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
