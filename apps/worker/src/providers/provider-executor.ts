/**
 * Provider executor - routes execution to implemented provider clients.
 *
 * Groq chat, Together image_generation, and GenX video_generation are implemented.
 * All other capabilities return "not implemented".
 *
 * This module is the only active worker path that calls provider APIs.
 */

import {
  routeProvider,
  type CapabilityKey,
  type ProviderKey,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'

// Temporary proof gate for live-capable paths. This is not final Brain routing:
// future selection must remain internal and dynamic across health, cost,
// latency, quality, safety, budget, fallback, and subtask requirements.
const EXECUTION_SUPPORT: Partial<Record<CapabilityKey, ProviderKey>> = {
  chat: 'groq',
  image_generation: 'together',
  video_generation: 'genx',
}

function getImplementedProvider(capability: CapabilityKey): ProviderKey | null {
  return EXECUTION_SUPPORT[capability] ?? null
}

function canExecuteImplementedProvider(
  capability: CapabilityKey,
  provider: ProviderKey,
): { allowed: boolean; reason: string | null } {
  const decision = routeProvider(capability)
  const candidate = decision.candidates.find((item) => item.provider === provider)

  if (!candidate?.supported) {
    return {
      allowed: false,
      reason: `${provider} does not support capability '${capability}'`,
    }
  }

  if (candidate.gated) {
    return {
      allowed: false,
      reason: `${provider} is gated for capability '${capability}'`,
    }
  }

  return { allowed: true, reason: null }
}

function formatSupportedCandidates(capability: CapabilityKey): string {
  return routeProvider(capability).candidates
    .filter((candidate) => candidate.supported)
    .map((candidate) => `${candidate.provider}(${candidate.configured ? 'configured' : 'missing-config'})`)
    .join(', ') || 'none'
}

function redactProviderSecrets(message: string, extraKeys: string[] = []): string {
  let safe = message
  for (const key of [process.env.GROQ_API_KEY, process.env.TOGETHER_API_KEY, process.env.GENX_API_KEY, ...extraKeys]) {
    if (key) {
      safe = safe.split(key).join('[redacted]')
    }
  }
  return safe
}

function readNumber(input: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

async function executeGroqChat(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey('groq')
    apiKey = credential.apiKey
    const { groqChat } = await import('@amarktai/providers')
    const result = await groqChat({
      prompt: payload.prompt,
      apiKey,
    })

    if (!result.content || !result.content.trim()) {
      return {
        success: false,
        status: 'failed',
        error: 'Groq returned empty response',
      }
    }

    return {
      success: true,
      status: 'completed',
      output: result.content,
      provider: 'groq',
      model: result.model,
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown Groq error'
    return {
      success: false,
      status: 'failed',
      error: `Groq execution failed: ${redactProviderSecrets(message, [apiKey])}`,
    }
  }
}

async function executeTogetherImage(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey('together')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('together')
    const { togetherGenerateImage } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    const result = await togetherGenerateImage({
      prompt: payload.prompt,
      apiKey,
      providerDefaultModel: providerStatus.defaultModel,
      width: readNumber(payload.input, 'width'),
      height: readNumber(payload.input, 'height'),
      steps: readNumber(payload.input, 'steps'),
      seed: readNumber(payload.input, 'seed'),
      negativePrompt: readString(payload.input, 'negativePrompt'),
      n: 1,
    })

    const image = result.images[0]
    if (!image?.buffer || image.buffer.length === 0) {
      return {
        success: false,
        status: 'failed',
        error: 'Together returned empty image data',
      }
    }

    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'image',
        subType: 'image_generation',
        title: `image_generation output for ${payload.appSlug}`,
        description: 'Together image_generation artifact',
        provider: 'together',
        model: result.model,
        traceId: payload.traceId,
        mimeType: image.mimeType,
        metadata: {
          capability: 'image_generation',
          provider: 'together',
          model: result.model,
          width: image.width,
          height: image.height,
          usage: result.usage,
        },
      },
      data: image.buffer,
      explicitMimeType: image.mimeType,
    })

    const output = {
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      width: image.width,
      height: image.height,
    }

    return {
      success: true,
      status: 'completed',
      provider: 'together',
      model: result.model,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: output,
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown Together error'
    return {
      success: false,
      status: 'failed',
      error: `Together execution failed: ${redactProviderSecrets(message, [apiKey])}`,
    }
  }
}

async function executeGenxVideo(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''
  let model = 'seedance-v1-fast'

  try {
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const { DEFAULT_GENX_VIDEO_MODEL, genxGenerateVideo } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    model = providerStatus.defaultModel?.trim() || DEFAULT_GENX_VIDEO_MODEL

    const result = await genxGenerateVideo({
      prompt: payload.prompt,
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      providerDefaultModel: providerStatus.defaultModel || undefined,
      duration: readNumber(payload.input, 'duration'),
      aspectRatio: readString(payload.input, 'aspectRatio'),
      style: readString(payload.input, 'style'),
    })

    if (!result.videoBuffer || result.videoBuffer.length === 0) {
      return {
        success: false,
        status: 'failed',
        error: 'GenX returned empty video data',
      }
    }

    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'video',
        subType: 'video_generation',
        title: `video_generation output for ${payload.appSlug}`,
        description: 'GenX video_generation artifact',
        provider: 'genx',
        model: result.model || model,
        traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability: 'video_generation',
          provider: 'genx',
          model: result.model || model,
          width: result.width,
          height: result.height,
          duration: result.duration,
        },
      },
      data: result.videoBuffer,
      explicitMimeType: result.mimeType,
    })

    const output = {
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      width: result.width,
      height: result.height,
      duration: result.duration,
    }

    return {
      success: true,
      status: 'completed',
      provider: 'genx',
      model: result.model || model,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: output,
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown GenX error'
    return {
      success: false,
      status: 'failed',
      error: `GenX execution failed: ${redactProviderSecrets(message, [apiKey])}`,
      provider: 'genx',
      model,
    }
  }
}

export async function executeWithProvider(payload: WorkerJobData): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey
  const implementedProvider = getImplementedProvider(capability)

  if (!implementedProvider) {
    const decision = routeProvider(capability)
    const providerInfo = decision.selectedProvider
      ? `Selected provider: ${decision.selectedProvider}`
      : `No provider selected: ${decision.blockReason ?? 'unknown'}`
    const candidates = decision.candidates
      .filter((c) => c.supported)
      .map((c) => `${c.provider}(${c.configured ? 'configured' : 'missing-config'})`)
      .join(', ')

    return {
      success: false,
      status: 'failed',
      error: `Provider execution not implemented for '${payload.capability}'. ${providerInfo}. Candidates: ${candidates || 'none'}. executionAllowed: false`,
    }
  }

  const gate = canExecuteImplementedProvider(capability, implementedProvider)
  if (!gate.allowed) {
    return {
      success: false,
      status: 'failed',
      error: `Provider execution not implemented or blocked for '${payload.capability}'. ${gate.reason}. Candidates: ${formatSupportedCandidates(capability)}. executionAllowed: false`,
    }
  }

  try {
    if (implementedProvider === 'groq' && capability === 'chat') {
      return await executeGroqChat(payload)
    }

    if (implementedProvider === 'together' && capability === 'image_generation') {
      return await executeTogetherImage(payload)
    }

    if (implementedProvider === 'genx' && capability === 'video_generation') {
      return await executeGenxVideo(payload)
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return {
        success: false,
        status: 'failed',
        error: `Provider execution not implemented or blocked for '${payload.capability}'. ${err.message}. Candidates: ${formatSupportedCandidates(capability)}. executionAllowed: false`,
      }
    }
    throw err
  }

  return {
    success: false,
    status: 'failed',
    error: `Provider execution not implemented for '${payload.capability}'. executionAllowed: false`,
  }
}
