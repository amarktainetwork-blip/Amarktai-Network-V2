/**
 * Provider executor - routes execution to implemented provider clients.
 *
 * Canonical queued runtime for direct provider capabilities and media jobs.
 */

import {
  createCanonicalProviderUsage,
  evaluateOrchestra,
  normalizeDbCandidates,
  getExecutorRegistration,
  executorModelMetadataFromDbRecord,
  isExecutorModelCompatible,
  type CapabilityKey,
  type ProviderKey,
  type ExecutorId,
  type AppCapabilityGrantContext,
  type OrchestraRoutingMode,
  type OrchestraDecision,
  type OrchestraCandidate,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey, prisma } from '@amarktai/db'
import { findCompletedArtifactByTraceId } from '@amarktai/artifacts'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'
import { DIRECT_EXECUTOR_HANDLERS } from './direct-provider-executor.js'

type ProvidersModule = typeof import('@amarktai/providers')

function redactProviderSecrets(message: string, extraKeys: string[] = []): string {
  let safe = message
  for (const key of [process.env.GROQ_API_KEY, process.env.TOGETHER_API_KEY, process.env.GENX_API_KEY, process.env.DEEPINFRA_API_KEY, process.env.MIMO_API_KEY, ...extraKeys]) {
    if (key) {
      safe = safe.split(key).join('[redacted]')
    }
  }
  return safe
}

function assertMediaSignature(buffer: Buffer, mimeType: string): void {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('ascii')
  const valid = mimeType === 'image/png'
    ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === 'image/jpeg'
      ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : mimeType === 'image/webp'
        ? buffer.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
        : mimeType === 'video/mp4' || mimeType === 'video/quicktime'
          ? buffer.length >= 12 && ascii(4, 8) === 'ftyp'
          : mimeType === 'video/webm'
            ? buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
            : mimeType === 'audio/wav' || mimeType === 'audio/x-wav'
              ? buffer.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
              : mimeType === 'audio/flac'
                ? buffer.length >= 4 && ascii(0, 4) === 'fLaC'
                : mimeType === 'audio/ogg'
                  ? buffer.length >= 4 && ascii(0, 4) === 'OggS'
                  : mimeType === 'audio/mpeg'
                    ? buffer.length >= 3 && (ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0))
                    : false
  if (!valid) throw new Error(`Artifact bytes do not match declared MIME type '${mimeType}'`)
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

// ── Groq Text Capabilities ───────────────────────────────────────────────────

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
    assertMediaSignature(image.buffer, image.mimeType)

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
      metadata: {
        ...output,
        usage: createCanonicalProviderUsage({
          provider: 'together', model: result.model,
          inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens, imageCount: 1,
        }),
        outputValidation: { valid: true, contract: 'validated_image_artifact_signature' },
      },
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
  let model = selectedModel?.trim() ?? ''

  try {
    if (!model) throw new Error('Orchestra route did not include an exact GenX music model')
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const {
      genxSubmitMusic,
    } = await import('@amarktai/providers')
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
      const existingMetadata = safeParseJsonObject(existingArtifact.metadata)
      const duration = readPositiveNumber(existingMetadata.duration)
      if (duration) {
        const output = {
          artifactId: existingArtifact.id,
          artifactUrl: existingArtifact.storageUrl,
          mimeType: existingArtifact.mimeType,
          fileSizeBytes: existingArtifact.fileSizeBytes,
          duration,
          reused: true,
        }
        return {
          success: true,
          status: 'completed',
          provider: 'genx',
          model,
          artifactId: existingArtifact.id,
          output: JSON.stringify(output),
          metadata: {
            ...output,
            usage: createCanonicalProviderUsage({ provider: 'genx', model, audioSeconds: duration }),
            outputValidation: { valid: true, contract: 'reused_music_artifact' },
          },
        }
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
        const resumeModel = readString(resumeMeta, 'genxProviderModel')
        if (resumeModel && resumeModel !== model) throw new Error(`Persisted GenX music model '${resumeModel}' does not match Orchestra-selected model '${model}'`)
        return await pollAndDownloadMusic(resumeRemoteId, apiKey, providerStatus, model, payload)
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
    const remoteModel = readString(jobMeta, 'genxProviderModel')
    if (remoteJobId && remoteModel && remoteModel !== model) throw new Error(`Persisted GenX music model '${remoteModel}' does not match Orchestra-selected model '${model}'`)

    // ── 4. Submit once if no remote job exists ─────────────────────────────
    if (!remoteJobId) {
      // Only send proven fields to GenX: prompt + model.
      // Unproven fields (duration, instrumental, genre, mood, tempo, negativePrompt)
      // are kept in internal job input but NOT sent to the provider.
      const submitResult = await genxSubmitMusic({
        prompt: payload.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model,
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

    return await pollAndDownloadMusic(remoteJobId, apiKey, providerStatus, model, payload)
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
          assertMediaSignature(musicResult.audioBuffer, musicResult.mimeType)

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
            metadata: {
              ...output,
              usage: createCanonicalProviderUsage({ provider: 'genx', model: musicResult.model || model, audioSeconds: musicResult.duration }),
              outputValidation: { valid: true, contract: 'validated_music_artifact_signature' },
            },
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
  let model = selectedModel?.trim() ?? ''

  try {
    if (!model) throw new Error('Orchestra route did not include an exact GenX video model')
    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const providers = await import('@amarktai/providers')
    const { genxGenerateVideo } = providers
    const { saveArtifact } = await import('@amarktai/artifacts')
    const job = await prisma.job.findUnique({
      where: { id: payload.jobId },
      select: { metadataJson: true },
    }).catch(() => null)
    const jobMetadata = safeParseJsonObject(job?.metadataJson)
    const existingRemoteJobId = readProviderJobIdFromMetadata(jobMetadata)
    const existingRemoteModel = readString(jobMetadata, 'genxProviderModel')
    if (existingRemoteJobId && existingRemoteModel && existingRemoteModel !== model) {
      throw new Error(`Persisted GenX video model '${existingRemoteModel}' does not match Orchestra-selected model '${model}'`)
    }

    const existingArtifact = await findCompletedArtifactByTraceId(payload.traceId, 'video_generation')
    if (existingArtifact) {
      const existingMetadata = safeParseJsonObject(existingArtifact.metadata)
      const duration = readPositiveNumber(existingMetadata.duration)
      const width = readPositiveNumber(existingMetadata.width)
      const height = readPositiveNumber(existingMetadata.height)
      if (duration && width && height) {
        const output = {
          artifactId: existingArtifact.id,
          artifactUrl: existingArtifact.storageUrl,
          mimeType: existingArtifact.mimeType,
          fileSizeBytes: existingArtifact.fileSizeBytes,
          duration,
          width,
          height,
          reused: true,
        }
        return {
          success: true,
          status: 'completed',
          provider: 'genx',
          model,
          artifactId: existingArtifact.id,
          output: JSON.stringify(output),
          metadata: {
            ...output,
            usage: createCanonicalProviderUsage({ provider: 'genx', model, videoSeconds: duration }),
            outputValidation: { valid: true, contract: 'reused_video_artifact' },
          },
        }
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
        providers,
      })
      : await genxGenerateVideo({
        prompt: payload.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model,
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
    assertMediaSignature(result.videoBuffer, result.mimeType)

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
      metadata: {
        ...output,
        usage: createCanonicalProviderUsage({ provider: 'genx', model: result.model || model, videoSeconds: result.duration }),
        outputValidation: { valid: true, contract: 'validated_video_artifact_signature' },
      },
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

function normalizeRoutingMode(payload: WorkerJobData): OrchestraRoutingMode {
  const raw = payload.routingMode ?? payload.metadata?.routingMode
  if (raw === 'quality' || raw === 'premium') return 'quality'
  if (raw === 'economy' || raw === 'budget') return 'economy'
  if (raw === 'fast') return 'fast'
  return 'balanced'
}

async function executeTogetherVideo(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  const model = selectedModel?.trim() ?? ''
  let apiKey = ''
  try {
    if (!model) throw new Error('Orchestra route did not include an exact Together video model')
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactWrite) return { success: false, status: 'failed', provider: 'together', model, error: 'AppCapabilityGrant denies video artifact write.' }
    const validation = validateMediaInput(payload)
    if (!validation.success) return { success: false, status: 'failed', provider: 'together', model, error: validation.error }

    const existing = await findCompletedArtifactByTraceId(payload.traceId, payload.capability)
    if (existing) {
      const meta = safeParseJsonObject(existing.metadata)
      const duration = readPositiveNumber(meta.duration)
      const width = readPositiveNumber(meta.width)
      const height = readPositiveNumber(meta.height)
      if (duration && width && height) return mediaArtifactResult(existing, 'together', model, duration, width, height, true)
    }

    let sourceArtifactId: string | null = null
    let sourceImageDataUrl: string | undefined
    let referenceVideoUrl: string | undefined
    if (payload.capability === 'image_to_video' || payload.capability === 'video_to_video') {
      if (!grant.artifactRead) return { success: false, status: 'failed', provider: 'together', model, error: 'AppCapabilityGrant denies source-artifact read.' }
      sourceArtifactId = readSourceArtifactId(payload)
      if (!sourceArtifactId) return { success: false, status: 'failed', provider: 'together', model, error: 'Source-aware video request omitted its source artifact.' }
      const { getArtifactRecord, getArtifactFile, createProviderMediaUrl } = await import('@amarktai/artifacts')
      const source = await getArtifactRecord(sourceArtifactId)
      if (!source || source.appSlug !== payload.appSlug || source.status !== 'completed') return artifactFailure('together', model, 'Authorised source artifact was not found')
      const expectedPrefix = payload.capability === 'image_to_video' ? 'image/' : 'video/'
      if (!source.mimeType.startsWith(expectedPrefix)) return artifactFailure('together', model, `Source artifact must have MIME type ${expectedPrefix}*`)
      const file = await getArtifactFile(sourceArtifactId)
      if (!file?.buffer.length) return artifactFailure('together', model, 'Source artifact bytes are missing')
      if (payload.capability === 'image_to_video') {
        sourceImageDataUrl = `data:${file.mimeType};base64,${file.buffer.toString('base64')}`
      } else {
        const publicApiUrl = process.env.PUBLIC_API_URL?.trim() ?? ''
        const secret = process.env.JWT_SECRET?.trim() ?? ''
        if (!publicApiUrl || !secret) return artifactFailure('together', model, 'PUBLIC_API_URL and JWT_SECRET are required for provider-readable source video')
        referenceVideoUrl = createProviderMediaUrl({ artifactId: sourceArtifactId, publicApiUrl, secret })
      }
    }

    const persisted = safeParseJsonObject((await prisma.job.findUnique({ where: { id: payload.jobId }, select: { metadataJson: true } }))?.metadataJson)
    const persistedProviderJobId = readString(persisted, 'togetherProviderJobId')
    const persistedProviderModel = readString(persisted, 'togetherProviderModel')
    if (persistedProviderJobId && persistedProviderModel && persistedProviderModel !== model) {
      throw new Error(`Persisted Together video model '${persistedProviderModel}' does not match Orchestra-selected model '${model}'`)
    }
    if (!persistedProviderJobId) {
      const claim = await claimProviderExecution(payload.jobId)
      if (!claim.claimed) return { success: false, status: 'failed', provider: 'together', model, error: claim.error }
    }
    const credential = await resolveProviderApiKey('together')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('together')
    const { togetherGenerateVideo } = await import('@amarktai/providers')
    const result = await togetherGenerateVideo({
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      model,
      prompt: payload.prompt,
      width: readNumber(payload.input, 'width'),
      height: readNumber(payload.input, 'height'),
      seconds: readNumber(payload.input, 'duration'),
      fps: readNumber(payload.input, 'fps'),
      steps: readNumber(payload.input, 'steps'),
      seed: readNumber(payload.input, 'seed'),
      guidanceScale: readNumber(payload.input, 'guidanceScale'),
      negativePrompt: readString(payload.input, 'negativePrompt'),
      generateAudio: readBool(payload.input, 'generateAudio'),
      sourceImageDataUrl,
      referenceVideoUrl,
      providerJobId: persistedProviderJobId,
      onSubmitted: async (providerJobId) => persistJobMetadata(payload.jobId, {
        togetherProviderJobId: providerJobId,
        togetherProviderModel: model,
        togetherSubmittedAt: new Date().toISOString(),
      }),
    })
    const { saveArtifact } = await import('@amarktai/artifacts')
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug, type: 'video', subType: payload.capability,
        title: `${payload.capability} output for ${payload.appSlug}`,
        description: 'Together managed video API output', provider: 'together', model, traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability: payload.capability, provider: 'together', model, duration: result.duration,
          width: result.width, height: result.height, providerJobId: result.providerJobId,
          sourceArtifactId, sourceArtifactIncluded: sourceArtifactId !== null,
          longFormVideo: payload.metadata?.longFormVideo === true,
          parentJobId: payload.metadata?.parentJobId, sceneNumber: payload.metadata?.sceneNumber,
        },
      },
      data: result.videoBuffer,
      explicitMimeType: result.mimeType,
    })
    await persistJobMetadata(payload.jobId, { togetherArtifactId: artifact.id, togetherCompletedAt: new Date().toISOString() })
    return mediaArtifactResult(artifact, 'together', model, result.duration, result.width, result.height, false, {
      providerJobId: result.providerJobId,
      sourceArtifactId,
      providerReportedCost: result.cost,
    })
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    return providerMediaFailure('together', model, err, apiKey)
  }
}

async function executeDeepInfraVideo(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  const model = selectedModel?.trim() ?? ''
  let apiKey = ''
  try {
    if (!model) throw new Error('Orchestra route did not include an exact DeepInfra video model')
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactWrite) return { success: false, status: 'failed', provider: 'deepinfra', model, error: 'AppCapabilityGrant denies video artifact write.' }
    const existing = await findCompletedArtifactByTraceId(payload.traceId, 'video_generation')
    if (existing) {
      const meta = safeParseJsonObject(existing.metadata)
      const duration = readPositiveNumber(meta.duration); const width = readPositiveNumber(meta.width); const height = readPositiveNumber(meta.height)
      if (duration && width && height) return mediaArtifactResult(existing, 'deepinfra', model, duration, width, height, true)
    }
    const claim = await claimProviderExecution(payload.jobId)
    if (!claim.claimed) return { success: false, status: 'failed', provider: 'deepinfra', model, error: claim.error }
    const credential = await resolveProviderApiKey('deepinfra')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('deepinfra')
    const { deepinfraGenerateVideo } = await import('@amarktai/providers')
    const result = await deepinfraGenerateVideo({ apiKey, baseUrl: providerStatus.baseUrl || undefined, model, prompt: payload.prompt })
    const { saveArtifact } = await import('@amarktai/artifacts')
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug, type: 'video', subType: 'video_generation', title: `video_generation output for ${payload.appSlug}`,
        description: 'DeepInfra video inference output', provider: 'deepinfra', model, traceId: payload.traceId, mimeType: result.mimeType,
        metadata: { capability: 'video_generation', provider: 'deepinfra', model, duration: result.duration, width: result.width, height: result.height,
          longFormVideo: payload.metadata?.longFormVideo === true, parentJobId: payload.metadata?.parentJobId, sceneNumber: payload.metadata?.sceneNumber },
      }, data: result.videoBuffer, explicitMimeType: result.mimeType,
    })
    return mediaArtifactResult(artifact, 'deepinfra', model, result.duration, result.width, result.height, false)
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    return providerMediaFailure('deepinfra', model, err, apiKey)
  }
}

function validateMediaInput(payload: WorkerJobData): { success: true } | { success: false; error: string } {
  if (!payload.prompt.trim()) return { success: false, error: 'Video prompt is required.' }
  return { success: true }
}

function readSourceArtifactId(payload: WorkerJobData): string | null {
  const keys = payload.capability === 'image_to_video' ? ['sourceImageArtifactId', 'sourceImage'] : ['sourceVideoArtifactId', 'sourceVideo']
  for (const key of keys) { const value = payload.input?.[key]; if (typeof value === 'string' && value.trim()) return value.trim() }
  return null
}

function artifactFailure(provider: ProviderKey, model: string, error: string): ProcessorResult {
  return { success: false, status: 'failed', provider, model, error, metadata: { errorClassification: 'artifact_validation', retryable: false } }
}

function mediaArtifactResult(
  artifact: { id: string; storageUrl: string; mimeType: string; fileSizeBytes: number },
  provider: ProviderKey,
  model: string,
  duration: number,
  width: number,
  height: number,
  reused: boolean,
  extra: Record<string, unknown> = {},
): ProcessorResult {
  const output = { artifactId: artifact.id, artifactUrl: artifact.storageUrl, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, duration, width, height, reused, ...extra }
  return { success: true, status: 'completed', provider, model, artifactId: artifact.id, output: JSON.stringify(output), metadata: {
    ...output,
    usage: createCanonicalProviderUsage({ provider, model, videoSeconds: duration, providerReportedCost: typeof extra.providerReportedCost === 'number' ? extra.providerReportedCost : null }),
    outputValidation: { valid: true, contract: reused ? 'reused_video_artifact' : 'validated_video_artifact_signature' },
  } }
}

function providerMediaFailure(provider: ProviderKey, model: string, err: unknown, apiKey: string): ProcessorResult {
  const canonical = err instanceof Error ? err : new Error('Unknown provider media failure')
  const code = 'code' in canonical && typeof canonical.code === 'string' ? canonical.code : 'provider_unavailable'
  return { success: false, status: 'failed', provider, model, error: `${provider} ${code}: ${redactProviderSecrets(canonical.message, [apiKey])}`, metadata: { errorClassification: code } }
}

function readAppGrantSnapshot(payload: WorkerJobData): AppCapabilityGrantContext | null {
  const snapshot = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const grant = snapshot as unknown as AppCapabilityGrantContext
  if (grant.appSlug !== payload.appSlug || grant.capability !== payload.capability) return null
  if (typeof grant.enabled !== 'boolean' || typeof grant.adultPermission !== 'boolean') return null
  if (!Array.isArray(grant.ragNamespaces) || !Array.isArray(grant.providerResidencyConstraints)) return null
  return Object.freeze({ ...grant })
}

async function resolveOrchestraDecision(
  payload: WorkerJobData,
  appGrant: AppCapabilityGrantContext,
): Promise<OrchestraDecision> {
  const capability = payload.capability as CapabilityKey
  const routingMode = normalizeRoutingMode(payload)
  let orchestraCandidates: OrchestraCandidate[] = []
  try {
    const [models, providers] = await Promise.all([
      prisma.modelRegistryEntry.findMany({ where: { enabled: true } }),
      prisma.aiProvider.findMany(),
    ])
    // Reaching this point proves the worker has both its DB connection and its
    // BullMQ delivery. Provider readiness is still derived per provider by the
    // core normalizer from credential, enabled, health, endpoint, registry, and
    // exact model compatibility facts.
    orchestraCandidates = normalizeDbCandidates(models, providers, capability, {
      databaseReady: true,
      queueReady: true,
    })
  } catch {
    // DB unavailable — Orchestra will evaluate with empty candidates and block
  }

  return evaluateOrchestra({
    capability,
    routingMode,
    executionId: payload.jobId,
    appSlug: payload.appSlug,
    appGrant,
  }, orchestraCandidates)
}

export interface ProviderExecutionRoute {
  provider: ProviderKey
  model: string
  executorId: ExecutorId
  routeKind: 'primary' | 'fallback'
}

function attachOrchestraRouteMetadata(result: ProcessorResult, route: ProviderExecutionRoute): ProcessorResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      orchestraRoute: route,
    },
  }
}

async function recordCanonicalUsage(
  payload: WorkerJobData,
  route: ProviderExecutionRoute,
  result: ProcessorResult,
): Promise<void> {
  const usage = result.metadata?.usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return
  const record = usage as Record<string, unknown>
  const inputTokens = readFiniteNonNegative(record.inputTokens)
  const outputTokens = readFiniteNonNegative(record.outputTokens)
  const reportedCost = typeof record.providerReportedCost === 'number' && Number.isFinite(record.providerReportedCost)
    ? record.providerReportedCost
    : null
  const currency = typeof record.currency === 'string' ? record.currency.toUpperCase() : null
  const hasReportedUsdCost = reportedCost !== null && (currency === null || currency === 'USD')
  const costUsdCents = hasReportedUsdCost ? Math.max(0, Math.round(reportedCost * 100)) : null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.usageMeter.upsert({
    where: { usage_meter_unique: { appSlug: payload.appSlug, date: today, capability: payload.capability, provider: route.provider, model: route.model } },
    update: {
      requestCount: { increment: 1 },
      ...(result.success ? { successCount: { increment: 1 } } : { errorCount: { increment: 1 } }),
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      ...(costUsdCents !== null ? { costUsdCents: { increment: costUsdCents } } : {}),
      ...(result.artifactId ? { artifactCount: { increment: 1 } } : {}),
    },
    create: {
      appSlug: payload.appSlug,
      date: today,
      capability: payload.capability,
      provider: route.provider,
      model: route.model,
      requestCount: 1,
      successCount: result.success ? 1 : 0,
      errorCount: result.success ? 0 : 1,
      inputTokens,
      outputTokens,
      ...(costUsdCents !== null ? { costUsdCents } : {}),
      artifactCount: result.artifactId ? 1 : 0,
    },
  })
}

function readFiniteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

type ExecutorHandler = (payload: WorkerJobData, selectedModel: string) => Promise<ProcessorResult>

export const EXECUTOR_HANDLERS: Partial<Record<ExecutorId, ExecutorHandler>> = {
  ...DIRECT_EXECUTOR_HANDLERS,
  'together.image-generation': executeTogetherImage,
  'genx.video-generation': executeGenxVideo,
  'genx.music-generation': executeGenxMusic,
  'together.video-generation': executeTogetherVideo,
  'together.image-to-video': executeTogetherVideo,
  'together.video-to-video': executeTogetherVideo,
  'deepinfra.video-generation': executeDeepInfraVideo,
}

export async function executeRegisteredRoute(
  payload: WorkerJobData,
  route: ProviderExecutionRoute,
): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey
  const registration = getExecutorRegistration(capability, route.provider)
  if (!registration || registration.id !== route.executorId) {
    return {
      success: false,
      status: 'failed',
      provider: route.provider,
      model: route.model,
      error: `No callable executor registration '${route.executorId}' for ${route.provider}/${capability}.`,
    }
  }

  if (registration.executionMode === 'stream') {
    return {
      success: false,
      status: 'failed',
      provider: route.provider,
      model: route.model,
      error: `Streaming executor '${registration.id}' must run through the authenticated SSE route.`,
    }
  }

  let modelCompatible = registration.modelCompatibility === 'exact_model_allowlist'
    ? registration.compatibleModels.includes(route.model)
    : false
  if (registration.modelCompatibility === 'metadata_profile') {
    const findUnique = (prisma.modelRegistryEntry as typeof prisma.modelRegistryEntry & { findUnique?: typeof prisma.modelRegistryEntry.findUnique }).findUnique
    const modelRecord = typeof findUnique === 'function'
      ? await findUnique.call(prisma.modelRegistryEntry, { where: { provider_modelId: { provider: route.provider, modelId: route.model } } }).catch(() => null)
      : null
    const compatibility = executorModelMetadataFromDbRecord(modelRecord ?? { provider: route.provider, modelId: route.model })
    modelCompatible = (modelRecord ? modelRecord.enabled === true : true)
      && isExecutorModelCompatible(registration, route.model, compatibility)
  }
  if (!modelCompatible) {
    return {
      success: false,
      status: 'failed',
      provider: route.provider,
      model: route.model,
      error: `Executor '${registration.id}' is not compatible with model '${route.model}'.`,
    }
  }

  const grant = readAppGrantSnapshot(payload)
  if (registration.sourceArtifactRequired && !grant?.artifactRead) {
    return { success: false, status: 'failed', provider: route.provider, model: route.model, error: `AppCapabilityGrant denies source-artifact read for '${payload.capability}'.` }
  }
  if (registration.artifactOutput && !grant?.artifactWrite) {
    return { success: false, status: 'failed', provider: route.provider, model: route.model, error: `AppCapabilityGrant denies artifact write for '${payload.capability}'.` }
  }

  const handler = EXECUTOR_HANDLERS[registration.id]
  if (typeof handler !== 'function') {
    return {
      success: false,
      status: 'failed',
      provider: route.provider,
      model: route.model,
      error: `Executor registration '${registration.id}' has no callable worker handler.`,
    }
  }

  try {
    const result = await handler(payload, route.model)
    if (result.provider && result.provider !== route.provider) {
      return {
        success: false,
        status: 'failed',
        provider: route.provider,
        model: route.model,
        error: `Executor '${registration.id}' attempted to change provider from '${route.provider}' to '${result.provider}'.`,
      }
    }
    if (result.model && result.model !== route.model) {
      return {
        success: false,
        status: 'failed',
        provider: route.provider,
        model: route.model,
        error: `Executor '${registration.id}' attempted to change model from '${route.model}' to '${result.model}'.`,
      }
    }
    return attachOrchestraRouteMetadata({ ...result, provider: route.provider, model: route.model }, route)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown provider execution error'
    return attachOrchestraRouteMetadata({
      success: false,
      status: 'failed',
      provider: route.provider,
      model: route.model,
      error: `Executor '${registration.id}' failed: ${redactProviderSecrets(message)}.`,
    }, route)
  }
}

export async function executeWithProvider(payload: WorkerJobData): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey
  const appGrant = readAppGrantSnapshot(payload)
  if (!appGrant) {
    return {
      success: false,
      status: 'failed',
      error: `Execution denied for '${capability}': immutable AppCapabilityGrant snapshot is missing or invalid.`,
    }
  }

  const orchestraDecision = await resolveOrchestraDecision(payload, appGrant)

  await persistJobMetadata(payload.jobId, {
    orchestraExecutionId: orchestraDecision.executionId,
    orchestraSelectedProvider: orchestraDecision.selectedProvider,
    orchestraSelectedModel: orchestraDecision.selectedModel,
    orchestraSelectedExecutorId: orchestraDecision.selectedExecutorId,
    orchestraScore: orchestraDecision.score,
    orchestraRoutingMode: orchestraDecision.routingMode,
    orchestraSnapshotTimestamp: orchestraDecision.snapshotTimestamp,
    orchestraFallbackCount: orchestraDecision.fallbackRoutes.length,
  }).catch(() => {})

  if (!orchestraDecision.executionAllowed
      || !orchestraDecision.selectedProvider
      || !orchestraDecision.selectedModel
      || !orchestraDecision.selectedExecutorId) {
    return {
      success: false,
      status: 'failed',
      error: `Orchestra blocked execution for '${capability}' in '${orchestraDecision.routingMode}' mode. ${orchestraDecision.blockReason ?? ''}.`,
      metadata: { orchestra: orchestraDecision },
    }
  }

  const routes: ProviderExecutionRoute[] = [
    {
      provider: orchestraDecision.selectedProvider,
      model: orchestraDecision.selectedModel,
      executorId: orchestraDecision.selectedExecutorId,
      routeKind: 'primary',
    },
    ...orchestraDecision.fallbackRoutes.map((fallback) => ({
      provider: fallback.provider,
      model: fallback.model,
      executorId: fallback.executorId,
      routeKind: 'fallback' as const,
    })),
  ]
  const attempts: Array<{ provider: ProviderKey; model: string; executorId: ExecutorId; success: boolean; error?: string }> = []
  let lastResult: ProcessorResult | null = null

  for (const route of routes) {
    const result = await executeRegisteredRoute(payload, route)
    attempts.push({ provider: route.provider, model: route.model, executorId: route.executorId, success: result.success, error: result.error })
    lastResult = result

    await persistJobMetadata(payload.jobId, {
      orchestraActualProvider: route.provider,
      orchestraActualModel: route.model,
      orchestraActualExecutorId: route.executorId,
      orchestraActualOutcome: result.success ? 'completed' : 'failed',
      orchestraRouteAttempts: attempts,
      directProviderExecutorId: route.executorId,
      directProviderRouteType: route.routeKind,
      directProviderUsage: result.metadata?.usage ?? null,
      directProviderCostEvidence: result.metadata?.usage && typeof result.metadata.usage === 'object'
        ? {
          providerReportedCost: (result.metadata.usage as Record<string, unknown>).providerReportedCost ?? null,
          estimatedCost: (result.metadata.usage as Record<string, unknown>).estimatedCost ?? null,
          estimated: (result.metadata.usage as Record<string, unknown>).estimated ?? false,
          currency: (result.metadata.usage as Record<string, unknown>).currency ?? null,
        }
        : null,
      directProviderOutputValidation: result.metadata?.outputValidation ?? null,
      directProviderErrorClassification: result.metadata?.errorClassification ?? null,
    }).catch(() => {})
    await recordCanonicalUsage(payload, route, result).catch(() => {})

    if (result.success) {
      return {
        ...result,
        metadata: { ...result.metadata, orchestra: orchestraDecision, routeAttempts: attempts },
      }
    }
  }

  return {
    ...(lastResult ?? { success: false, status: 'failed' as const }),
    success: false,
    status: 'failed',
    error: lastResult?.error ?? `No registered executor route was available for '${capability}'.`,
    metadata: { ...lastResult?.metadata, orchestra: orchestraDecision, routeAttempts: attempts },
  }
}
