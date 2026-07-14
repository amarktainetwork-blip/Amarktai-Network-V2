/**
 * Provider executor - routes execution to implemented provider clients.
 *
 * Groq chat, Together image_generation, and GenX video_generation are implemented.
 * All other capabilities return "not implemented".
 *
 * This module is the only active worker path that calls provider APIs.
 */

import {
  routeBrain,
  evaluateOrchestra,
  normalizeDbCandidates,
  extractRoutingMode,
  type CapabilityKey,
  type ProviderKey,
  type RoutingMode,
  type BrainRouterDecision,
  type BrainRouterProviderState,
  type OrchestraDecision,
  type OrchestraCandidate,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey, prisma } from '@amarktai/db'
import { findCompletedArtifactByTraceId } from '@amarktai/artifacts'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'

type ProvidersModule = typeof import('@amarktai/providers')

function formatSupportedCandidates(capability: CapabilityKey): string {
  const decision = routeBrain({ capability, routingMode: 'balanced' })
  const executable = decision.executableCandidates.map((candidate) => `${candidate.provider}/${candidate.modelId}(executable)`)
  const catalogueOnly = decision.catalogueOnlyCandidates.map((candidate) => `${candidate.provider}/${candidate.modelId}(catalogue-only)`)
  return [...executable, ...catalogueOnly].join(', ') || 'none'
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
    let credentialStatus: Awaited<ReturnType<typeof getProviderCredentialStatus>> | null = null
    try {
      credentialStatus = await getProviderCredentialStatus(provider)
    } catch {
      credentialStatus = null
    }
    if (disabled || runtimeRestricted || provider === 'genx') {
      states[provider] = {
        disabled,
        runtimeRestricted,
        configured: credentialStatus?.configured === true && credentialStatus.runtimeEnabled !== false,
        infrastructureReady: true,
        policyAllowed: provider !== 'mimo',
      }
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

function normalizeSelectedModel(model: string | null | undefined): string | undefined {
  return typeof model === 'string' && model.trim() ? model.trim() : undefined
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

function readProviderJobIdFromMetadata(metadata: Record<string, unknown>): string | undefined {
  const value = metadata.genxProviderJobId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function extractGenxProviderJobIdFromError(err: unknown): string | undefined {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/providerJobId=([^;\s]+)/)
  return match?.[1]?.trim()
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

const STALE_CLAIM_MS = 10 * 60 * 1000 // 10 minutes

async function claimMusicExecution(
  jobId: string,
): Promise<{ claimed: boolean; alreadySubmitted: boolean; error?: string }> {
  const now = new Date()

  // Atomic claim: set providerClaimAt only if it is currently NULL.
  // updateMany with WHERE on the column itself is atomic in MySQL/InnoDB.
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      providerClaimAt: null,
    },
    data: {
      providerClaimAt: now,
    },
  })

  if (result.count === 1) {
    return { claimed: true, alreadySubmitted: false }
  }

  // Claim was not NULL — check if existing claim is stale or if remote ID exists
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { providerClaimAt: true, metadataJson: true },
  })

  if (!job) {
    return { claimed: false, alreadySubmitted: false, error: 'Job not found' }
  }

  const meta = safeParseJsonObject(job.metadataJson)
  if (typeof meta.genxProviderJobId === 'string' && meta.genxProviderJobId) {
    return { claimed: false, alreadySubmitted: true }
  }

  // Stale claim recovery: if claim is older than threshold, reclaim
  if (job.providerClaimAt) {
    const claimAge = now.getTime() - job.providerClaimAt.getTime()
    if (claimAge > STALE_CLAIM_MS) {
      const reclaim = await prisma.job.updateMany({
        where: {
          id: jobId,
          providerClaimAt: job.providerClaimAt,
        },
        data: {
          providerClaimAt: now,
        },
      })
      if (reclaim.count === 1) {
        return { claimed: true, alreadySubmitted: false }
      }
    }
  }

  return { claimed: false, alreadySubmitted: false, error: 'Execution already claimed by another worker' }
}

async function claimProviderExecution(
  jobId: string,
): Promise<{ claimed: boolean; error?: string }> {
  const now = new Date()
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      status: 'processing',
      providerClaimAt: null,
    },
    data: {
      providerClaimAt: now,
    },
  })

  if (result.count === 1) return { claimed: true }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { providerClaimAt: true, status: true },
  })
  if (!job) return { claimed: false, error: 'Job not found' }
  if (job.status !== 'processing') return { claimed: false, error: `Job is not execution-eligible: ${job.status}` }

  if (job.providerClaimAt) {
    const claimAge = now.getTime() - job.providerClaimAt.getTime()
    if (claimAge > STALE_CLAIM_MS) {
      const reclaim = await prisma.job.updateMany({
        where: {
          id: jobId,
          status: 'processing',
          providerClaimAt: job.providerClaimAt,
        },
        data: {
          providerClaimAt: now,
        },
      })
      if (reclaim.count === 1) return { claimed: true }
    }
  }

  return { claimed: false, error: 'Execution already claimed by another worker' }
}

async function resumeGenxVideoProviderJob(input: {
  remoteJobId: string
  apiKey: string
  baseUrl?: string
  model: string
  providerAvailableModels: string[]
  providers: Pick<ProvidersModule, 'genxPollVideo' | 'genxDownloadVideo' | 'GENX_POLL_INTERVAL_MS' | 'GENX_POLL_MAX_ATTEMPTS'>
}): Promise<{
  videoBuffer: Buffer
  mimeType: string
  duration?: number
  width?: number
  height?: number
  model?: string
  providerJobId?: string
  metadata?: Record<string, unknown>
}> {
  let attempts = 0
  while (attempts < input.providers.GENX_POLL_MAX_ATTEMPTS) {
    await sleep(input.providers.GENX_POLL_INTERVAL_MS)
    attempts++

    const pollResult = await input.providers.genxPollVideo(input.remoteJobId, {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      pollAttempt: attempts,
    })

    if (pollResult.status === 'failed') {
      throw new Error(`GenX video generation failed for providerJobId=${input.remoteJobId}; model=${input.model}; pollAttempt=${attempts}; providerStatus=failed; ${pollResult.error ?? 'unknown error'}`)
    }

    if (pollResult.status !== 'completed') {
      continue
    }

    const downloadUrls = [
      pollResult.resultUrl,
      `/api/v1/jobs/${input.remoteJobId}/result`,
      `/api/v1/jobs/${input.remoteJobId}/file`,
    ].filter((candidate): candidate is string => !!candidate)

    let lastDownloadError: unknown
    for (const downloadUrl of downloadUrls) {
      try {
        const video = await input.providers.genxDownloadVideo(downloadUrl, {
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model: input.model,
          providerAvailableModels: input.providerAvailableModels,
        })
        return {
          ...video,
          model: input.model,
          providerJobId: input.remoteJobId,
          metadata: {
            ...video.metadata,
            providerJobId: input.remoteJobId,
            selectedModel: input.model,
            pollAttempt: attempts,
            resumed: true,
          },
        }
      } catch (err) {
        lastDownloadError = err
      }
    }

    if (lastDownloadError instanceof Error) {
      throw new Error(`GenX video download failed for providerJobId=${input.remoteJobId}; model=${input.model}; ${lastDownloadError.message}`)
    }
    throw new Error(`GenX video download failed for providerJobId=${input.remoteJobId}; model=${input.model}`)
  }

  throw new Error(`GenX video generation timed out after ${input.providers.GENX_POLL_MAX_ATTEMPTS} poll attempts; providerJobId=${input.remoteJobId}; model=${input.model}`)
}

async function recordMusicUsage(appSlug: string, model: string): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.usageMeter.upsert({
    where: {
      usage_meter_unique: {
        appSlug,
        date: today,
        capability: 'music_generation',
        provider: 'genx',
        model,
      },
    },
    update: {
      requestCount: { increment: 1 },
      successCount: { increment: 1 },
      artifactCount: { increment: 1 },
    },
    create: {
      appSlug,
      date: today,
      capability: 'music_generation',
      provider: 'genx',
      model,
      requestCount: 1,
      successCount: 1,
      artifactCount: 1,
    },
  })
}

async function executeGroqChat(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey('groq')
    apiKey = credential.apiKey
    const { groqChat } = await import('@amarktai/providers')
    const result = await groqChat({
      prompt: payload.prompt,
      apiKey,
      model: selectedModel,
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
  question_answering: () => 'You are a question answering assistant. Answer the question based on the provided context. If the context does not contain the answer, say so clearly.',
  zero_shot_classification: (payload) => {
    const labels = readString(payload.input, 'labels') || readString(payload.metadata, 'labels')
    return `You are a zero-shot classification assistant. Classify the text into one of these categories: ${labels || 'No labels provided'}. Return only the category name.`
  },
  token_classification: () => 'You are a token classification assistant. Identify and classify named entities, parts of speech, or other token-level annotations in the text. Return structured results.',
  fill_mask: () => 'You are a fill-mask assistant. Predict the most likely word or phrase that fills the [MASK] token in the provided text. Return the prediction.',
  feature_extraction: () => 'You are a feature extraction assistant. Extract key features, attributes, or characteristics from the provided text. Return structured results.',
  sentence_similarity: (payload) => {
    const sentences = readString(payload.input, 'sentences') || readString(payload.metadata, 'sentences')
    return `You are a sentence similarity assistant. Compare the sentences and return a similarity score between 0 and 1. Sentences: ${sentences || 'No sentences provided'}`
  },
  table_qa: () => 'You are a table question answering assistant. Answer questions about the provided table data. Return clear, concise answers based on the table content.',
  tool_use: (payload) => {
    const tools = readString(payload.input, 'tools') || readString(payload.metadata, 'tools')
    return `You are a tool-use assistant. You have access to these tools: ${tools || 'No tools provided'}. Use the appropriate tool to answer the question. Return the tool call in the correct format.`
  },
  streaming_chat: () => 'You are a helpful assistant. Provide clear, helpful responses.',
}

async function executeGroqTextCapability(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
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
      model: selectedModel,
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

async function executeDeepInfraTextCapability(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
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
      providerDefaultModel: selectedModel || providerStatus.defaultModel,
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

async function executeTextCapabilityWithFallback(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  try {
    return await executeGroqTextCapability(payload, selectedModel)
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

async function executeChatWithFallback(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  try {
    return await executeGroqChat(payload, selectedModel)
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

async function executeTogetherImage(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
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
      model: selectedModel,
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

async function executeGenxMusic(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  let apiKey = ''
  let model = 'lyria-3-clip-preview'

  try {
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const {
      genxSubmitMusic,
      resolveGenxMusicModel,
    } = await import('@amarktai/providers')
    const providerAvailableModels = parseGenxDiscoveredModels(providerStatus.healthMessage)
    model = resolveGenxMusicModel({
      model: selectedModel,
      providerDefaultModel: providerStatus.defaultModel || undefined,
      providerFallbackModel: providerStatus.fallbackModel || undefined,
      providerAvailableModels,
    })

    const vocalsRequested = readBool(payload.input, 'vocalsRequested') === true
      || readBool(payload.input, 'instrumentalOnly') === false
      || typeof payload.input?.lyrics === 'string'
    if (vocalsRequested) {
      return {
        success: false,
        status: 'failed',
        error: 'Music generation blocked: vocals_not_proven, lyrics_not_proven.',
        provider: 'genx',
        model,
      }
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

    // ── 2. Atomic execution claim ─────────────────────────────────────────
    const claim = await claimMusicExecution(payload.jobId)
    if (!claim.claimed) {
      // Whether already submitted or just claimed by another worker,
      // check metadata for a persisted remote job ID to resume from.
      const resumeMeta = safeParseJsonObject(
        (await prisma.job.findUnique({ where: { id: payload.jobId }, select: { metadataJson: true } }))?.metadataJson,
      )
      const resumeRemoteId = typeof resumeMeta.genxProviderJobId === 'string' ? resumeMeta.genxProviderJobId : ''
      if (resumeRemoteId) {
        return await pollAndDownloadMusic(resumeRemoteId, apiKey, providerStatus, model, payload, providerAvailableModels)
      }
      return {
        success: false,
        status: 'failed',
        error: claim.error || 'Execution already claimed by another worker',
        provider: 'genx',
        model,
      }
    }

    // ── 3. Check for persisted remote provider job ID (resume) ─────────────
    const jobMeta = safeParseJsonObject(
      (await prisma.job.findUnique({ where: { id: payload.jobId }, select: { metadataJson: true } }))?.metadataJson,
    )
    let remoteJobId = typeof jobMeta.genxProviderJobId === 'string' ? jobMeta.genxProviderJobId : ''

    // ── 4. Submit once if no remote job exists ─────────────────────────────
    if (!remoteJobId) {
      // Only send proven fields to GenX: prompt + model.
      // Unproven fields (duration, instrumental, genre, mood, tempo, negativePrompt)
      // are kept in internal job input but NOT sent to the provider.
      const submitResult = await genxSubmitMusic({
        prompt: payload.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model: selectedModel,
        providerDefaultModel: providerStatus.defaultModel || undefined,
        providerFallbackModel: providerStatus.fallbackModel || undefined,
        providerAvailableModels,
      })
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

    return await pollAndDownloadMusic(remoteJobId, apiKey, providerStatus, model, payload, providerAvailableModels)
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

async function pollAndDownloadMusic(
  remoteJobId: string,
  apiKey: string,
  providerStatus: { baseUrl: string; defaultModel: string; fallbackModel: string; healthMessage: string },
  model: string,
  payload: WorkerJobData,
  providerAvailableModels: string[],
): Promise<ProcessorResult> {
  const {
    genxPollMusic,
    genxDownloadMusic,
    GENX_MUSIC_POLL_INTERVAL_MS,
    GENX_MUSIC_POLL_MAX_ATTEMPTS,
  } = await import('@amarktai/providers')
  const { saveArtifact } = await import('@amarktai/artifacts')
  const { isValidMimeForType } = await import('@amarktai/core')

  // ── Poll until terminal state ─────────────────────────────────────────
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
      // ── Download result ─────────────────────────────────────────────
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

          // ── Save artifact ───────────────────────────────────────────
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
                referenceAudioArtifactId: typeof payload.input?.referenceAudioArtifactId === 'string' ? payload.input.referenceAudioArtifactId : null,
                referenceAudioConditioningReady: false,
                nativeProviderFields: ['model', 'params.prompt'],
              },
            },
            data: musicResult.audioBuffer,
            explicitMimeType: musicResult.mimeType,
          })

          // ── Persist completion metadata ─────────────────────────────
          await persistJobMetadata(payload.jobId, {
            genxArtifactId: artifact.id,
            genxCompletedAt: new Date().toISOString(),
          })

          // ── Record usage ────────────────────────────────────────────
          await recordMusicUsage(payload.appSlug, musicResult.model || model).catch(() => {})

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
}

async function executeGenxVideo(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  let apiKey = ''
  let model = 'seedance-v1-fast'

  try {
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const providers = await import('@amarktai/providers')
    const { genxGenerateVideo, resolveGenxVideoModel } = providers
    const { saveArtifact } = await import('@amarktai/artifacts')
    const providerAvailableModels = parseGenxDiscoveredModels(providerStatus.healthMessage)
    model = resolveGenxVideoModel({
      model: selectedModel,
      providerDefaultModel: providerStatus.defaultModel,
      providerFallbackModel: providerStatus.fallbackModel,
      providerAvailableModels,
    })
    const job = await prisma.job.findUnique({
      where: { id: payload.jobId },
      select: { metadataJson: true },
    }).catch(() => null)
    const jobMetadata = safeParseJsonObject(job?.metadataJson)
    const existingRemoteJobId = readProviderJobIdFromMetadata(jobMetadata)
    const existingRemoteModel = readString(jobMetadata, 'genxProviderModel')
    if (existingRemoteModel) model = existingRemoteModel

    const existingArtifact = await findCompletedArtifactByTraceId(payload.traceId, 'video_generation')
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

    const claim = await claimProviderExecution(payload.jobId)
    if (!claim.claimed) {
      return {
        success: false,
        status: 'failed',
        error: claim.error || 'Execution already claimed by another worker',
        provider: 'genx',
        model,
      }
    }

    const result = existingRemoteJobId
      ? await resumeGenxVideoProviderJob({
        remoteJobId: existingRemoteJobId,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model,
        providerAvailableModels,
        providers,
      })
      : await genxGenerateVideo({
        prompt: payload.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model: selectedModel,
        providerDefaultModel: providerStatus.defaultModel || undefined,
        providerFallbackModel: providerStatus.fallbackModel || undefined,
        providerAvailableModels,
        duration: readNumber(payload.input, 'duration'),
        aspectRatio: readString(payload.input, 'aspectRatio'),
        style: readString(payload.input, 'style'),
      }).catch(async (err) => {
        const remoteJobId = extractGenxProviderJobIdFromError(err)
        if (remoteJobId) {
          await persistJobMetadata(payload.jobId, {
            genxProviderJobId: remoteJobId,
            genxProviderModel: model,
          }).catch(() => {})
        }
        throw err
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
          longFormVideo: payload.metadata?.longFormVideo === true,
          parentJobId: typeof payload.metadata?.parentJobId === 'string' ? payload.metadata.parentJobId : undefined,
          executionId: typeof payload.metadata?.executionId === 'string' ? payload.metadata.executionId : undefined,
          sceneNumber: typeof payload.metadata?.sceneNumber === 'number' ? payload.metadata.sceneNumber : undefined,
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

    if (result.providerJobId) {
      await persistJobMetadata(payload.jobId, {
        genxProviderJobId: result.providerJobId,
        genxProviderModel: result.model || model,
      }).catch(() => {})
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
  orchestraDecision: OrchestraDecision
}> {
  const routingMode = extractRoutingMode(payload.metadata) as RoutingMode
  const providerStates = await buildProviderStates()

  const decision = routeBrain({
    capability: payload.capability as CapabilityKey,
    routingMode,
    providerStates,
    appSlug: payload.appSlug,
  })

  // Use shared normalizer for Orchestra candidates
  let orchestraCandidates: OrchestraCandidate[] = []
  const cap = payload.capability as CapabilityKey
  try {
    const [models, providers] = await Promise.all([
      prisma.modelRegistryEntry.findMany({ where: { enabled: true } }),
      prisma.aiProvider.findMany(),
    ])
    orchestraCandidates = normalizeDbCandidates(models, providers, cap)
  } catch {
    // DB unavailable — Orchestra will evaluate with empty candidates and block
  }

  const orchestraDecision = evaluateOrchestra(
    { capability: cap, routingMode: routingMode as 'balanced' | 'quality' | 'economy' | 'fast', executionId: payload.jobId },
    orchestraCandidates,
  )

  return { decision, routingMode, orchestraDecision }
}

function canExecuteProviderForCapability(
  capability: CapabilityKey,
  provider: ProviderKey,
): boolean {
  if (provider === 'groq') {
    const textCaps: CapabilityKey[] = [
      'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
      'question_answering', 'classification', 'zero_shot_classification', 'extraction',
      'token_classification', 'fill_mask', 'feature_extraction', 'sentence_similarity',
      'table_qa', 'structured_output', 'tool_use',
    ]
    const audioCaps: CapabilityKey[] = ['tts', 'stt', 'text_to_audio', 'audio_to_audio']
    return textCaps.includes(capability) || audioCaps.includes(capability)
  }
  if (provider === 'deepinfra') {
    const textCaps: CapabilityKey[] = [
      'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
      'question_answering', 'classification', 'zero_shot_classification', 'extraction',
      'token_classification', 'fill_mask', 'feature_extraction', 'sentence_similarity',
      'table_qa', 'structured_output', 'tool_use',
    ]
    return textCaps.includes(capability)
  }
  if (provider === 'together') {
    const imageCaps: CapabilityKey[] = ['image_generation', 'image_edit', 'image_to_image', 'image_upscale']
    const audioCaps: CapabilityKey[] = ['tts', 'stt', 'voice_clone', 'voice_conversion', 'text_to_audio', 'audio_to_audio']
    return imageCaps.includes(capability) || audioCaps.includes(capability)
  }
  if (provider === 'genx') {
    const videoCaps: CapabilityKey[] = ['video_generation', 'image_to_video', 'video_to_video', 'long_form_video', 'music_generation', 'song_generation']
    return videoCaps.includes(capability)
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
  const selectedModel = normalizeSelectedModel(decision.selectedModel)

  try {
    if (provider === 'groq' && capability === 'chat') {
      const result = await executeChatWithFallback(payload, selectedModel)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'groq' && TEXT_CAPABILITY_SYSTEM_PROMPTS[capability]) {
      const result = await executeTextCapabilityWithFallback(payload, selectedModel)
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
      const result = await executeDeepInfraTextCapability(payload, selectedModel)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'together' && ['image_generation', 'image_edit', 'image_to_image', 'image_upscale'].includes(capability)) {
      const result = await executeTogetherImage(payload, selectedModel)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'genx' && ['video_generation', 'image_to_video', 'video_to_video', 'long_form_video'].includes(capability)) {
      const result = await executeGenxVideo(payload, selectedModel)
      return attachBrainRouterMetadata(result, decision, routingMode)
    }

    if (provider === 'genx' && capability === 'music_generation') {
      const result = await executeGenxMusic(payload, selectedModel)
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

  const { decision, routingMode, orchestraDecision } = await resolveBrainRouterDecision(payload)

  // Persist routing decision metadata
  await persistJobMetadata(payload.jobId, {
    orchestraExecutionId: orchestraDecision.executionId,
    orchestraSelectedProvider: orchestraDecision.selectedProvider,
    orchestraSelectedModel: orchestraDecision.selectedModel,
    orchestraScore: orchestraDecision.score,
    orchestraRoutingMode: orchestraDecision.routingMode,
    orchestraSnapshotTimestamp: orchestraDecision.snapshotTimestamp,
    orchestraFallbackCount: orchestraDecision.fallbackRoutes.length,
  }).catch(() => {})

  if (!orchestraDecision.executionAllowed) {
    return {
      success: false,
      status: 'failed',
      error: `Orchestra blocked execution for '${capability}' in '${orchestraDecision.routingMode}' mode. ${orchestraDecision.blockReason ?? ''}.`,
      metadata: {
        orchestra: {
          routingMode: orchestraDecision.routingMode,
          executionAllowed: false,
          blockReason: orchestraDecision.blockReason,
          snapshotTimestamp: orchestraDecision.snapshotTimestamp,
        },
      },
    }
  }

  const selectedProvider = orchestraDecision.selectedProvider!

  // Try primary route
  if (canExecuteProviderForCapability(capability, selectedProvider)) {
    const result = await executeWithSelectedProvider(payload, capability, selectedProvider, decision, routingMode)
    // Persist actual execution route
    await persistJobMetadata(payload.jobId, {
      orchestraActualProvider: result.provider ?? selectedProvider,
      orchestraActualModel: result.model ?? orchestraDecision.selectedModel,
      orchestraActualOutcome: result.success ? 'completed' : 'failed',
    }).catch(() => {})
    return result
  }

  // Try Orchestra fallback routes (each has its own provider/model)
  for (const fallback of orchestraDecision.fallbackRoutes) {
    if (canExecuteProviderForCapability(capability, fallback.provider as ProviderKey)) {
      await persistJobMetadata(payload.jobId, {
        orchestraFallbackProvider: fallback.provider,
        orchestraFallbackModel: fallback.model,
        orchestraFallbackReason: 'primary_executor_not_implemented',
      }).catch(() => {})
      const result = await executeWithSelectedProvider(payload, capability, fallback.provider as ProviderKey, decision, routingMode)
      await persistJobMetadata(payload.jobId, {
        orchestraActualProvider: result.provider ?? fallback.provider,
        orchestraActualModel: result.model ?? fallback.model,
        orchestraActualOutcome: result.success ? 'completed' : 'failed',
      }).catch(() => {})
      return result
    }
  }

  return {
    success: false,
    status: 'failed',
    error: `Orchestra selected ${selectedProvider}/${orchestraDecision.selectedModel} but no executor is implemented for '${capability}'.`,
    metadata: {
      orchestra: {
        routingMode: orchestraDecision.routingMode,
        selectedProvider,
        selectedModel: orchestraDecision.selectedModel,
        executionAllowed: true,
        executorImplemented: false,
      },
    },
  }
}
