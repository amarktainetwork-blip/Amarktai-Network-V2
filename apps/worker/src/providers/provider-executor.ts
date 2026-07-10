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
  routeBrain,
  extractRoutingMode,
  type CapabilityKey,
  type ProviderKey,
  type RoutingMode,
  type BrainRouterDecision,
  type BrainRouterProviderState,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey, prisma } from '@amarktai/db'
import { findCompletedArtifactByTraceId } from '@amarktai/artifacts'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'

function formatSupportedCandidates(capability: CapabilityKey): string {
  return routeProvider(capability).candidates
    .filter((candidate) => candidate.supported)
    .map((candidate) => `${candidate.provider}(${candidate.configured ? 'configured' : 'missing-config'})`)
    .join(', ') || 'none'
}

function redactProviderSecrets(message: string, extraKeys: string[] = []): string {
  let safe = message
  for (const key of [process.env.GROQ_API_KEY, process.env.TOGETHER_API_KEY, process.env.GENX_API_KEY, process.env.DEEPINFRA_API_KEY, process.env.MIMO_API_KEY, ...extraKeys]) {
    if (key) {
      safe = safe.split(key).join('[redacted]')
    }
  }
  return safe
}

async function isProviderDisabledInDb(provider: ProviderKey): Promise<boolean> {
  try {
    const record = await prisma.aiProvider.findUnique({ where: { providerKey: provider } })
    if (!record) return false
    return record.healthStatus === 'disabled' || !record.enabled
  } catch {
    return false
  }
}

async function isProviderRuntimeRestrictedInDb(provider: ProviderKey): Promise<boolean> {
  try {
    const record = await prisma.aiProvider.findUnique({ where: { providerKey: provider } })
    if (!record) return false
    return record.healthStatus === 'runtime_restricted'
  } catch {
    return false
  }
}

async function buildProviderStates(): Promise<Partial<Record<ProviderKey, BrainRouterProviderState>>> {
  const providers: ProviderKey[] = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
  const states: Partial<Record<ProviderKey, BrainRouterProviderState>> = {}

  for (const provider of providers) {
    const [disabled, runtimeRestricted] = await Promise.all([
      isProviderDisabledInDb(provider),
      isProviderRuntimeRestrictedInDb(provider),
    ])
    if (disabled || runtimeRestricted) {
      states[provider] = { disabled, runtimeRestricted }
    }
  }

  return states
}

function readNumber(input: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readBool(input: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseGenxDiscoveredModels(healthMessage: string): string[] {
  const match = healthMessage.match(/Models seen:\s*(.+)$/i)
  if (!match?.[1]) return []

  return match[1]
    .split(',')
    .map((model) => model.trim().replace(/\.$/, ''))
    .filter(Boolean)
}

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

async function persistJobMetadata(
  jobId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { metadataJson: true } })
  if (!job) return
  const current = safeParseJsonObject(job.metadataJson)
  const merged = { ...current, ...updates }
  await prisma.job.update({
    where: { id: jobId },
    data: { metadataJson: JSON.stringify(merged) },
  })
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

// ── Groq Text Capabilities ───────────────────────────────────────────────────

const TEXT_CAPABILITY_SYSTEM_PROMPTS: Partial<Record<CapabilityKey, (payload: WorkerJobData) => string>> = {
  reasoning: () => 'You are a reasoning engine. Think step by step. Show your reasoning process clearly before giving a final answer.',
  code: () => 'You are a code generation assistant. Write clean, well-documented code. Include comments explaining your approach.',
  summarization: () => 'You are a text summarization assistant. Provide clear, concise summaries that capture the key points.',
  translation: () => 'You are a translation assistant. Translate the provided text accurately while preserving meaning and tone.',
  classification: () => 'You are a text classification assistant. Classify the provided text into the given categories. Return the classification result clearly.',
  extraction: () => 'You are a data extraction assistant. Extract structured information from the provided text. Return JSON when possible.',
  structured_output: (payload) => {
    const schema = readString(payload.input, 'schema') || readString(payload.metadata, 'schema')
    return `You are a structured output assistant. Return valid JSON that matches this schema: ${schema || 'No schema provided - infer appropriate structure'}. Return ONLY valid JSON, no explanation.`
  },
}

async function executeGroqTextCapability(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey('groq')
    apiKey = credential.apiKey
    const { groqChat } = await import('@amarktai/providers')

    const systemPromptFn = TEXT_CAPABILITY_SYSTEM_PROMPTS[payload.capability as CapabilityKey]
    const systemPrompt = systemPromptFn ? systemPromptFn(payload) : undefined

    const result = await groqChat({
      prompt: payload.prompt,
      apiKey,
      systemPrompt,
    })

    if (!result.content || !result.content.trim()) {
      return { success: false, status: 'failed', error: 'Groq returned empty response' }
    }

    if (payload.capability === 'structured_output') {
      try { JSON.parse(result.content) } catch {
        return { success: false, status: 'failed', error: 'Structured output did not return valid JSON' }
      }
    }

    return { success: true, status: 'completed', output: result.content, provider: 'groq', model: result.model }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown Groq error'
    return { success: false, status: 'failed', error: `Groq execution failed: ${redactProviderSecrets(message, [apiKey])}` }
  }
}

async function executeDeepInfraTextCapability(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey('deepinfra')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('deepinfra')
    const { deepinfraChat } = await import('@amarktai/providers')

    const systemPromptFn = TEXT_CAPABILITY_SYSTEM_PROMPTS[payload.capability as CapabilityKey]
    const systemPrompt = systemPromptFn ? systemPromptFn(payload) : undefined

    const result = await deepinfraChat({
      prompt: payload.prompt,
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      providerDefaultModel: providerStatus.defaultModel,
      systemPrompt,
    })

    if (!result.content || !result.content.trim()) {
      return { success: false, status: 'failed', error: 'DeepInfra returned empty response' }
    }

    if (payload.capability === 'structured_output') {
      try { JSON.parse(result.content) } catch {
        return { success: false, status: 'failed', error: 'Structured output did not return valid JSON' }
      }
    }

    return { success: true, status: 'completed', output: result.content, provider: 'deepinfra', model: result.model }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown DeepInfra error'
    return { success: false, status: 'failed', error: `DeepInfra execution failed: ${redactProviderSecrets(message, [apiKey])}` }
  }
}

async function executeTextCapabilityWithFallback(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    return await executeGroqTextCapability(payload)
  } catch (err) {
    if (!(err instanceof ProviderConfigError)) throw err
  }

  if (await isProviderDisabledInDb('deepinfra')) {
    return {
      success: false,
      status: 'failed',
      error: `Provider execution not implemented or blocked for '${payload.capability}'. deepinfra is disabled. Candidates: ${formatSupportedCandidates(payload.capability as CapabilityKey)}. executionAllowed: false`,
    }
  }

  try {
    return await executeDeepInfraTextCapability(payload)
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return {
        success: false,
        status: 'failed',
        error: `Provider execution not implemented or blocked for '${payload.capability}'. ${err.message}. Candidates: ${formatSupportedCandidates(payload.capability as CapabilityKey)}. executionAllowed: false`,
      }
    }
    throw err
  }
}

async function executeChatWithFallback(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    return await executeGroqChat(payload)
  } catch (err) {
    if (!(err instanceof ProviderConfigError)) throw err
  }

  if (await isProviderDisabledInDb('deepinfra')) {
    return {
      success: false,
      status: 'failed',
      error: `Provider execution not implemented or blocked for '${payload.capability}'. deepinfra is disabled. Candidates: ${formatSupportedCandidates(payload.capability as CapabilityKey)}. executionAllowed: false`,
    }
  }

  try {
    return await executeDeepInfraTextCapability(payload)
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return {
        success: false,
        status: 'failed',
        error: `Provider execution not implemented or blocked for '${payload.capability}'. ${err.message}. Candidates: ${formatSupportedCandidates(payload.capability as CapabilityKey)}. executionAllowed: false`,
      }
    }
    throw err
  }
}

// ── Together Image Generation ────────────────────────────────────────────────

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

async function executeGenxMusic(payload: WorkerJobData): Promise<ProcessorResult> {
  let apiKey = ''
  let model = 'lyria-3-clip-preview'

  try {
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const {
      genxSubmitMusic,
      genxPollMusic,
      genxDownloadMusic,
      resolveGenxMusicModel,
      GENX_MUSIC_POLL_INTERVAL_MS,
      GENX_MUSIC_POLL_MAX_ATTEMPTS,
    } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    const { isValidMimeForType } = await import('@amarktai/core')
    const providerAvailableModels = parseGenxDiscoveredModels(providerStatus.healthMessage)
    model = resolveGenxMusicModel({
      providerDefaultModel: providerStatus.defaultModel || undefined,
      providerFallbackModel: providerStatus.fallbackModel || undefined,
      providerAvailableModels,
    })

    const requestParams = {
      prompt: payload.prompt,
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      providerDefaultModel: providerStatus.defaultModel || undefined,
      providerFallbackModel: providerStatus.fallbackModel || undefined,
      providerAvailableModels,
      duration: readNumber(payload.input, 'duration'),
      instrumental: readBool(payload.input, 'instrumental'),
      genre: readString(payload.input, 'genre'),
      mood: readString(payload.input, 'mood'),
      tempo: readString(payload.input, 'tempo'),
      negativePrompt: readString(payload.input, 'negativePrompt'),
    }

    // ── 1. Check for existing completed artifact (idempotency) ────────────
    const existingArtifact = await findCompletedArtifactByTraceId(payload.traceId, 'music_generation')
    if (existingArtifact) {
      const output = {
        artifactId: existingArtifact.id,
        artifactUrl: existingArtifact.storageUrl,
        mimeType: existingArtifact.mimeType,
        fileSizeBytes: existingArtifact.fileSizeBytes,
        reused: true,
      }
      return {
        success: true,
        status: 'completed',
        provider: 'genx',
        model,
        artifactId: existingArtifact.id,
        output: JSON.stringify(output),
        metadata: output,
      }
    }

    // ── 2. Check for persisted remote provider job ID (resume) ─────────────
    const jobMeta = safeParseJsonObject(
      (await prisma.job.findUnique({ where: { id: payload.jobId }, select: { metadataJson: true } }))?.metadataJson,
    )
    let remoteJobId = typeof jobMeta.genxProviderJobId === 'string' ? jobMeta.genxProviderJobId : ''

    // ── 3. Submit once if no remote job exists ─────────────────────────────
    if (!remoteJobId) {
      const submitResult = await genxSubmitMusic(requestParams)
      if (!submitResult.jobId) {
        return {
          success: false,
          status: 'failed',
          error: 'GenX did not return a music job ID',
          provider: 'genx',
          model,
        }
      }
      remoteJobId = submitResult.jobId

      // Persist remote job ID immediately so retry can resume
      try {
        await persistJobMetadata(payload.jobId, {
          genxProviderJobId: remoteJobId,
          genxProviderModel: model,
          genxSubmittedAt: new Date().toISOString(),
        })
      } catch {
        // If persistence fails, log and fail safely — do not resubmit
        console.error('[worker] Failed to persist GenX music provider job ID', {
          jobId: payload.jobId,
          remoteJobId,
        })
        return {
          success: false,
          status: 'failed',
          error: `GenX music job submitted (remoteId=${remoteJobId}) but local state persistence failed. Manual recovery required.`,
          provider: 'genx',
          model,
        }
      }
    }

    // ── 4. Poll until terminal state ───────────────────────────────────────
    let attempts = 0
    let transientPollFailures = 0
    const MAX_TRANSIENT_RETRIES = 5

    while (attempts < GENX_MUSIC_POLL_MAX_ATTEMPTS) {
      await sleep(GENX_MUSIC_POLL_INTERVAL_MS)
      attempts++

      let pollResult
      try {
        pollResult = await genxPollMusic(remoteJobId, { apiKey, baseUrl: providerStatus.baseUrl || undefined, pollAttempt: attempts })
        transientPollFailures = 0
      } catch (err) {
        const isTransient = err instanceof Error && /httpStatus=(500|502|503|504)/.test(err.message)
        if (isTransient) {
          transientPollFailures++
          if (transientPollFailures <= MAX_TRANSIENT_RETRIES) continue
        }
        throw err
      }

      if (pollResult.status === 'failed') {
        return {
          success: false,
          status: 'failed',
          error: `GenX music generation failed: providerStatus=failed; providerJobId=${remoteJobId}; model=${model}; pollAttempt=${attempts}; ${pollResult.error ?? 'unknown error'}`,
          provider: 'genx',
          model,
        }
      }

      if (pollResult.status === 'completed') {
        // ── 5. Download result ───────────────────────────────────────────
        const downloadUrls = [
          pollResult.resultUrl,
          `${providerStatus.baseUrl || ''}/api/v1/jobs/${remoteJobId}/result`,
          `${providerStatus.baseUrl || ''}/api/v1/jobs/${remoteJobId}/file`,
        ].filter((u): u is string => !!u)

        let lastDownloadError: unknown
        for (const downloadUrl of downloadUrls) {
          try {
            const musicResult = await genxDownloadMusic(downloadUrl, {
              apiKey,
              baseUrl: providerStatus.baseUrl || undefined,
              model,
              providerAvailableModels,
            })

            if (!musicResult.audioBuffer || musicResult.audioBuffer.length === 0) {
              return {
                success: false,
                status: 'failed',
                error: 'GenX returned empty audio data',
                provider: 'genx',
                model,
              }
            }

            if (!isValidMimeForType('music', musicResult.mimeType)) {
              return {
                success: false,
                status: 'failed',
                error: `GenX returned unsupported MIME type '${musicResult.mimeType}' for music artifact`,
                provider: 'genx',
                model,
              }
            }

            // ── 6. Save artifact ─────────────────────────────────────────
            const artifact = await saveArtifact({
              input: {
                appSlug: payload.appSlug,
                type: 'music',
                subType: 'music_generation',
                title: `music_generation output for ${payload.appSlug}`,
                description: 'GenX music_generation artifact',
                provider: 'genx',
                model: musicResult.model || model,
                traceId: payload.traceId,
                mimeType: musicResult.mimeType,
                metadata: {
                  capability: 'music_generation',
                  provider: 'genx',
                  model: musicResult.model || model,
                  duration: musicResult.duration,
                  providerJobId: remoteJobId,
                },
              },
              data: musicResult.audioBuffer,
              explicitMimeType: musicResult.mimeType,
            })

            // ── 7. Persist completion metadata ───────────────────────────
            await persistJobMetadata(payload.jobId, {
              genxArtifactId: artifact.id,
              genxCompletedAt: new Date().toISOString(),
            })

            const output = {
              artifactId: artifact.id,
              artifactUrl: artifact.storageUrl,
              mimeType: artifact.mimeType,
              fileSizeBytes: artifact.fileSizeBytes,
              duration: musicResult.duration,
              providerJobId: remoteJobId,
              selectedModel: musicResult.model || model,
            }

            return {
              success: true,
              status: 'completed',
              provider: 'genx',
              model: musicResult.model || model,
              artifactId: artifact.id,
              output: JSON.stringify(output),
              metadata: output,
            }
          } catch (err) {
            lastDownloadError = err
          }
        }

        if (lastDownloadError instanceof Error) {
          return {
            success: false,
            status: 'failed',
            error: `GenX music download failed for providerJobId=${remoteJobId}; model=${model}; ${lastDownloadError.message}`,
            provider: 'genx',
            model,
          }
        }

        return {
          success: false,
          status: 'failed',
          error: `GenX music download failed for providerJobId=${remoteJobId}; model=${model}`,
          provider: 'genx',
          model,
        }
      }
    }

    return {
      success: false,
      status: 'failed',
      error: `GenX music generation timed out after ${GENX_MUSIC_POLL_MAX_ATTEMPTS} poll attempts; providerJobId=${remoteJobId}; model=${model}`,
      provider: 'genx',
      model,
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    const message = err instanceof Error ? err.message : 'Unknown GenX music error'
    return {
      success: false,
      status: 'failed',
      error: `GenX music execution failed: provider=genx; selectedModel=${model}; ${redactProviderSecrets(message, [apiKey])}`,
      provider: 'genx',
      model,
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
    const { genxGenerateVideo, resolveGenxVideoModel } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    const providerAvailableModels = parseGenxDiscoveredModels(providerStatus.healthMessage)
    model = resolveGenxVideoModel({
      providerDefaultModel: providerStatus.defaultModel,
      providerFallbackModel: providerStatus.fallbackModel,
      providerAvailableModels,
    })

    const result = await genxGenerateVideo({
      prompt: payload.prompt,
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      providerDefaultModel: providerStatus.defaultModel || undefined,
      providerFallbackModel: providerStatus.fallbackModel || undefined,
      providerAvailableModels,
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
          providerJobId: result.providerJobId,
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
      providerJobId: result.providerJobId,
      selectedModel: result.model || model,
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
      error: `GenX execution failed: provider=genx; selectedModel=${model}; ${redactProviderSecrets(message, [apiKey])}`,
      provider: 'genx',
      model,
    }
  }
}

async function resolveBrainRouterDecision(payload: WorkerJobData): Promise<{
  decision: BrainRouterDecision
  routingMode: RoutingMode
}> {
  const routingMode = extractRoutingMode(payload.metadata) as RoutingMode
  const providerStates = await buildProviderStates()

  const decision = routeBrain({
    capability: payload.capability as CapabilityKey,
    routingMode,
    providerStates,
    appSlug: payload.appSlug,
  })

  return { decision, routingMode }
}

function canExecuteProviderForCapability(
  capability: CapabilityKey,
  provider: ProviderKey,
): boolean {
  if (provider === 'groq') {
    const textCaps: CapabilityKey[] = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output']
    return textCaps.includes(capability)
  }
  if (provider === 'deepinfra') {
    const textCaps: CapabilityKey[] = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output']
    return textCaps.includes(capability)
  }
  if (provider === 'together') {
    return capability === 'image_generation'
  }
  if (provider === 'genx') {
    return capability === 'video_generation' || capability === 'music_generation'
  }
  return false
}

function attachBrainRouterMetadata(result: ProcessorResult, decision: BrainRouterDecision, routingMode: RoutingMode): ProcessorResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      brainRouter: {
        routingMode,
        selectedProvider: decision.selectedProvider,
        selectedModel: decision.selectedModel,
        executionAllowed: decision.executionAllowed,
        truth: decision.truth,
        fallbackChain: decision.fallbackChain,
      },
    },
  }
}

async function executeWithSelectedProvider(
  payload: WorkerJobData,
  capability: CapabilityKey,
  provider: ProviderKey,
  decision: BrainRouterDecision,
  routingMode: RoutingMode,
): Promise<ProcessorResult> {
  try {
    if (provider === 'groq' && capability === 'chat') {
      const result = await executeChatWithFallback(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'groq' && TEXT_CAPABILITY_SYSTEM_PROMPTS[capability]) {
      const result = await executeTextCapabilityWithFallback(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'deepinfra' && TEXT_CAPABILITY_SYSTEM_PROMPTS[capability]) {
      if (await isProviderDisabledInDb('deepinfra')) {
        return {
          success: false,
          status: 'failed',
          error: `DeepInfra is disabled. Cannot use as fallback for '${capability}'. Truth: ${decision.truth}`,
          metadata: { brainRouter: { routingMode, selectedProvider: 'deepinfra', executionAllowed: false, truth: decision.truth } },
        }
      }
      const result = await executeDeepInfraTextCapability(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'together' && capability === 'image_generation') {
      const result = await executeTogetherImage(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'genx' && capability === 'video_generation') {
      const result = await executeGenxVideo(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'genx' && capability === 'music_generation') {
      const result = await executeGenxMusic(payload)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return {
        success: false,
        status: 'failed',
        error: `Provider execution blocked for '${capability}'. ${err.message}. Truth: ${decision.truth}`,
        metadata: { brainRouter: { routingMode, selectedProvider: provider, executionAllowed: false, truth: decision.truth } },
      }
    }
    throw err
  }

  return {
    success: false,
    status: 'failed',
    error: `Provider execution not implemented for '${capability}' with provider '${provider}'. Truth: ${decision.truth}`,
    metadata: { brainRouter: { routingMode, selectedProvider: provider, executionAllowed: false, truth: decision.truth } },
  }
}

export async function executeWithProvider(payload: WorkerJobData): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey

  const { decision, routingMode } = await resolveBrainRouterDecision(payload)

  if (!decision.executionAllowed) {
    return {
      success: false,
      status: 'failed',
      error: `Brain Router blocked execution for '${capability}' in '${routingMode}' mode. ${decision.blockReason ?? ''}. Truth: ${decision.truth}`,
      metadata: {
        brainRouter: {
          routingMode,
          executionAllowed: false,
          blockReason: decision.blockReason,
          truth: decision.truth,
        },
      },
    }
  }

  const selectedProvider = decision.selectedProvider!

  if (!canExecuteProviderForCapability(capability, selectedProvider)) {
    const fallback = decision.fallbackChain.find((f) => canExecuteProviderForCapability(capability, f.provider as ProviderKey))
    if (fallback) {
      return await executeWithSelectedProvider(payload, capability, fallback.provider as ProviderKey, decision, routingMode)
    }

    return {
      success: false,
      status: 'failed',
      error: `Brain Router selected ${selectedProvider}/${decision.selectedModel} but no executor is implemented for '${capability}'. Truth: ${decision.truth}`,
      metadata: {
        brainRouter: {
          routingMode,
          selectedProvider,
          selectedModel: decision.selectedModel,
          executionAllowed: true,
          executorImplemented: false,
          truth: decision.truth,
        },
      },
    }
  }

  return await executeWithSelectedProvider(payload, capability, selectedProvider, decision, routingMode)
}
