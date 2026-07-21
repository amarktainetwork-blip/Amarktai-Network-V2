/**
 * Provider executor - routes execution to implemented provider clients.
 *
 * Canonical queued runtime for direct provider capabilities and media jobs.
 */

import {
  createCanonicalProviderUsage,
  canReadSourceArtifactForApp,
  evaluateOrchestra,
  normalizeDbCandidates,
  getExecutorRegistration,
  getExecutorRegistrations,
  getProviderDefaultBaseUrl,
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
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey, recordModelAccessibilityFailure, recordModelAccessibilitySuccess, prisma } from '@amarktai/db'
import { findCompletedArtifactByTraceId, getArtifactFile, getArtifactRecord } from '@amarktai/artifacts'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'
import { DIRECT_EXECUTOR_HANDLERS } from './direct-provider-executor.js'
import { executeReleaseFixture, isReleaseFixtureAdapterEnabled } from './release-fixture-executor.js'

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

// ── Runtime Text Capabilities ────────────────────────────────────────────────

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
    // Vocals and lyrics are model-dependent, not globally blocked.
    // Orchestra routes music_generation to instrumental models and
    // song_generation to lyrics/vocals-capable models.
    // If a song_generation request reaches this handler, pass lyrics through.

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
      const lyrics = typeof payload.input?.lyrics === 'string' ? payload.input.lyrics : undefined
      const submitResult = await genxSubmitMusic({
        prompt: payload.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model,
        lyrics,
        vocals: vocalsRequested || undefined,
        instrumental: vocalsRequested ? false : undefined,
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

    const existingArtifact = await findCompletedArtifactByTraceId(payload.traceId, payload.capability)
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

    // ── Load source artifact for i2v/v2v ──────────────────────────────────
    let sourceImageDataUrl: string | undefined
    let referenceVideoUrl: string | undefined
    let sourceArtifactId: string | null = null
    if (payload.capability === 'image_to_video' || payload.capability === 'video_to_video') {
      const grant = readAppGrantSnapshot(payload)
      if (!grant?.artifactRead) {
        return { success: false, status: 'failed', provider: 'genx', model, error: 'AppCapabilityGrant denies source-artifact read.' }
      }
      const sourceId = payload.capability === 'image_to_video'
        ? (typeof payload.input?.sourceImageArtifactId === 'string' ? payload.input.sourceImageArtifactId : null)
        : (typeof payload.input?.sourceVideoArtifactId === 'string' ? payload.input.sourceVideoArtifactId : null)
      if (!sourceId) {
        return { success: false, status: 'failed', provider: 'genx', model, error: `${payload.capability} requires a source artifact` }
      }
      sourceArtifactId = sourceId
      const source = await getArtifactRecord(sourceId)
      if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) {
        return { success: false, status: 'failed', provider: 'genx', model, error: 'Authorised source artifact was not found' }
      }
      const expectedPrefix = payload.capability === 'image_to_video' ? 'image/' : 'video/'
      if (!source.mimeType.startsWith(expectedPrefix)) {
        return { success: false, status: 'failed', provider: 'genx', model, error: `Source artifact must have MIME type ${expectedPrefix}*` }
      }
      const file = await getArtifactFile(sourceId)
      if (!file?.buffer.length) {
        return { success: false, status: 'failed', provider: 'genx', model, error: 'Source artifact bytes are missing' }
      }
      assertMediaSignature(file.buffer, file.mimeType)
      if (payload.capability === 'image_to_video') {
        sourceImageDataUrl = `data:${file.mimeType};base64,${file.buffer.toString('base64')}`
      } else {
        // For video-to-video, construct a provider-readable URL
        const publicApiUrl = process.env.PUBLIC_API_URL?.trim() ?? ''
        const secret = process.env.JWT_SECRET?.trim() ?? ''
        if (!publicApiUrl || !secret) {
          return { success: false, status: 'failed', provider: 'genx', model, error: 'PUBLIC_API_URL and JWT_SECRET required for source video' }
        }
        const { createProviderMediaUrl } = await import('@amarktai/artifacts')
        referenceVideoUrl = createProviderMediaUrl({ artifactId: sourceId, publicApiUrl, secret })
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
        negativePrompt: readString(payload.input, 'negativePrompt'),
        sourceImageDataUrl,
        referenceVideoUrl,
        onSubmitted: async (jobId: string, submittedModel: string) => {
          await persistJobMetadata(payload.jobId, {
            genxProviderJobId: jobId,
            genxProviderModel: submittedModel,
            genxProviderSubmittedAt: new Date().toISOString(),
          })
        },
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
        subType: payload.capability,
        title: `${payload.capability} output for ${payload.appSlug}`,
        description: `GenX ${payload.capability} artifact`,
        provider: 'genx',
        model: result.model || model,
        traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability: payload.capability,
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
          sourceArtifactId,
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
      sourceArtifactId,
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
): Promise<{ decision: OrchestraDecision; reusedPersistedRoute: boolean }> {
  const capability = payload.capability as CapabilityKey
  const routingMode = normalizeRoutingMode(payload)
  let orchestraCandidates: OrchestraCandidate[] = []
  let durableMetadata: Record<string, unknown> = {}
  try {
    const [models, providers, job] = await Promise.all([
      prisma.modelRegistryEntry.findMany({ where: { enabled: true } }),
      prisma.aiProvider.findMany(),
      prisma.job.findUnique({ where: { id: payload.jobId }, select: { metadataJson: true } }),
    ])
    durableMetadata = safeParseJsonObject(job?.metadataJson)
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

  const serverControlledLongFormRoute = payload.executionProfile === 'internal_dashboard'
    && capability === 'video_generation'
    && durableMetadata.longFormVideo === true
  const executorConstraint = serverControlledLongFormRoute && typeof durableMetadata.orchestraExecutorConstraint === 'string'
    ? durableMetadata.orchestraExecutorConstraint
    : null
  if (executorConstraint) {
    orchestraCandidates = orchestraCandidates.filter((candidate) => candidate.executorId === executorConstraint)
  }

  const persistedProvider = durableMetadata.orchestraSelectedProvider
  const persistedModel = durableMetadata.orchestraSelectedModel
  const persistedExecutor = durableMetadata.orchestraSelectedExecutorId
  const reusedPersistedRoute = typeof persistedProvider === 'string'
    && typeof persistedModel === 'string'
    && typeof persistedExecutor === 'string'
  if (reusedPersistedRoute) {
    // Re-evaluate current health/configuration/compatibility, but never silently
    // switch the provider, model, or executor selected for this durable job.
    orchestraCandidates = orchestraCandidates.filter((candidate) => (
      candidate.provider === persistedProvider
      && candidate.model === persistedModel
      && candidate.executorId === persistedExecutor
    ))
  }

  const decision = evaluateOrchestra({
    capability,
    executionProfile: payload.executionProfile ?? 'external_app',
    routingMode,
    executionId: payload.jobId,
    appSlug: payload.appSlug,
    appGrant,
    requestedRoute: readRequestedRoute(durableMetadata),
  }, orchestraCandidates)
  return { decision, reusedPersistedRoute }
}

function readRequestedRoute(metadata: Record<string, unknown>): { provider: ProviderKey; model: string } | undefined {
  const route = metadata.requestedRoute
  if (!route || typeof route !== 'object' || Array.isArray(route)) return undefined
  const value = route as Record<string, unknown>
  if (!['genx', 'together', 'deepinfra'].includes(String(value.provider)) || typeof value.model !== 'string' || !value.model.trim()) return undefined
  return { provider: value.provider as ProviderKey, model: value.model }
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
  'together.tts': executeTogetherTts,
  'together.stt': executeTogetherStt,
  'genx.video-generation': executeGenxVideo,
  'genx.image-to-video': executeGenxVideo,
  'genx.video-to-video': executeGenxVideo,
  'genx.music-generation': executeGenxMusic,
  'genx.song-generation': executeGenxMusic,
  'genx.tts': executeGenxTts,
  'genx.stt': executeGenxStt,
}

async function executeTogetherTts(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  try {
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactWrite) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'AppCapabilityGrant denies TTS artifact write.' }
    const existing = await findCompletedArtifactByTraceId(payload.traceId, 'tts')
    if (existing) return {
      success: true, status: 'completed', provider: 'together', model: selectedModel, artifactId: existing.id,
      output: JSON.stringify({ artifactId: existing.id, artifactUrl: existing.storageUrl, mimeType: existing.mimeType, fileSizeBytes: existing.fileSizeBytes, reused: true }),
      metadata: { artifactId: existing.id, reused: true, outputValidation: { valid: true, contract: 'reused_tts_artifact' } },
    }
    const claim = await claimProviderExecution(payload.jobId)
    if (!claim.claimed) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: claim.error || 'Execution already claimed' }
    const credential = await resolveProviderApiKey('together')
    const status = await getProviderCredentialStatus('together')
    const { togetherTextToSpeech } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    const result = await togetherTextToSpeech({
      apiKey: credential.apiKey, baseUrl: status.baseUrl || undefined, model: selectedModel,
      text: String(payload.input?.text ?? payload.prompt),
      voice: readString(payload.input, 'voice'), responseFormat: readString(payload.input, 'outputFormat'),
    })
    assertMediaSignature(result.audioBuffer, result.mimeType)
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug, type: 'audio', subType: 'tts', title: `TTS audio for ${payload.appSlug}`,
        description: 'Together speech synthesis output', provider: 'together', model: selectedModel,
        traceId: payload.traceId, mimeType: result.mimeType,
        metadata: { capability: 'tts', provider: 'together', model: selectedModel, duration: result.duration, voice: result.voice, evidenceSource: 'live_provider', liveProviderProof: true },
      }, data: result.audioBuffer, explicitMimeType: result.mimeType,
    })
    return {
      success: true, status: 'completed', provider: 'together', model: selectedModel, artifactId: artifact.id,
      output: JSON.stringify({ artifactId: artifact.id, artifactUrl: artifact.storageUrl, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, duration: result.duration }),
      metadata: { artifactId: artifact.id, duration: result.duration, usage: createCanonicalProviderUsage({ provider: 'together', model: selectedModel, audioSeconds: result.duration }), outputValidation: { valid: true, contract: 'validated_audio_artifact_signature' } },
    }
  } catch (error) {
    const canonical = (await import('@amarktai/providers')).normalizeProviderError('together', error)
    return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: canonical.message, metadata: { errorClassification: canonical.code, retryable: canonical.retryable, httpStatus: canonical.status } }
  }
}

async function executeTogetherStt(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  try {
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactRead) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'AppCapabilityGrant denies STT artifact read.' }
    const sourceId = readString(payload.input, 'artifactId') ?? readString(payload.input, 'audioArtifactId')
    if (!sourceId) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'STT requires an authorised audio source artifact' }
    const source = await getArtifactRecord(sourceId)
    if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'Authorised source artifact was not found' }
    if (!source.mimeType.startsWith('audio/') && !source.mimeType.startsWith('video/')) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'STT source must be audio or video' }
    const file = await getArtifactFile(sourceId)
    if (!file?.buffer.length) return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: 'Source artifact bytes are missing' }
    assertMediaSignature(file.buffer, file.mimeType)
    const credential = await resolveProviderApiKey('together')
    const status = await getProviderCredentialStatus('together')
    const { togetherSpeechToText } = await import('@amarktai/providers')
    const result = await togetherSpeechToText({
      apiKey: credential.apiKey, baseUrl: status.baseUrl || undefined, model: selectedModel,
      audioBuffer: file.buffer, filename: file.filename, mimeType: file.mimeType, language: readString(payload.input, 'language'),
    })
    return {
      success: true, status: 'completed', provider: 'together', model: selectedModel,
      output: JSON.stringify({ transcript: result.text, language: result.language, duration: result.duration, sourceArtifactId: sourceId }),
      metadata: { sourceArtifactId: sourceId, usage: createCanonicalProviderUsage({ provider: 'together', model: selectedModel, audioSeconds: result.duration ?? 0 }), outputValidation: { valid: true, contract: 'nonempty_authorised_transcript' } },
    }
  } catch (error) {
    const canonical = (await import('@amarktai/providers')).normalizeProviderError('together', error)
    return { success: false, status: 'failed', provider: 'together', model: selectedModel, error: canonical.message, metadata: { errorClassification: canonical.code, retryable: canonical.retryable, httpStatus: canonical.status } }
  }
}

async function executeGenxTts(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  let apiKey = ''
  let model = selectedModel?.trim() ?? ''
  try {
    if (!model) throw new Error('Orchestra route did not include an exact GenX TTS model')
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactWrite) return { success: false, status: 'failed', provider: 'genx', model, error: 'AppCapabilityGrant denies TTS artifact write.' }

    const existing = await findCompletedArtifactByTraceId(payload.traceId, 'tts')
    if (existing) {
      const meta = safeParseJsonObject(existing.metadata)
      const duration = readPositiveNumber(meta.duration)
      if (duration) {
        return {
          success: true, status: 'completed', provider: 'genx', model, artifactId: existing.id,
          output: JSON.stringify({ artifactId: existing.id, artifactUrl: existing.storageUrl, mimeType: existing.mimeType, fileSizeBytes: existing.fileSizeBytes, duration, reused: true }),
          metadata: { artifactId: existing.id, duration, reused: true, usage: createCanonicalProviderUsage({ provider: 'genx', model, audioSeconds: duration }), outputValidation: { valid: true, contract: 'reused_tts_artifact' } },
        }
      }
    }

    const claim = await claimProviderExecution(payload.jobId)
    if (!claim.claimed) return { success: false, status: 'failed', provider: 'genx', model, error: claim.error || 'Execution already claimed' }

    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const { genxGenerateTts } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')
    const selectedVoice = await resolveGenxVoice(model, payload.input)

    const result = await genxGenerateTts({
      text: String(payload.input?.text ?? payload.prompt),
      model,
      voice: selectedVoice.voiceId,
      speed: Number(payload.input?.speed ?? 1),
      outputFormat: String(payload.input?.outputFormat ?? 'wav'),
      language: selectedVoice.locale || selectedVoice.language,
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
    })

    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug, type: 'audio', subType: 'tts', title: `TTS audio for ${payload.appSlug}`,
        description: 'GenX speech synthesis output', provider: 'genx', model, traceId: payload.traceId, mimeType: result.mimeType,
        metadata: { capability: 'tts', provider: 'genx', model, duration: result.duration, voice: selectedVoice.voiceId, voiceProfileId: selectedVoice.id, evidenceSource: 'live_provider', liveProviderProof: true },
      }, data: result.audioBuffer, explicitMimeType: result.mimeType,
    })

    return {
      success: true, status: 'completed', provider: 'genx', model, artifactId: artifact.id,
      output: JSON.stringify({ artifactId: artifact.id, artifactUrl: artifact.storageUrl, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, duration: result.duration }),
      metadata: { artifactId: artifact.id, duration: result.duration, usage: createCanonicalProviderUsage({ provider: 'genx', model, audioSeconds: result.duration }), outputValidation: { valid: true, contract: 'playable_audio_artifact' } },
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    return { success: false, status: 'failed', provider: 'genx', model, error: `GenX TTS failed: ${redactProviderSecrets(err instanceof Error ? err.message : 'unknown', [apiKey])}` }
  }
}

async function executeGenxStt(payload: WorkerJobData, selectedModel?: string): Promise<ProcessorResult> {
  let apiKey = ''
  let model = selectedModel?.trim() ?? ''
  try {
    if (!model) throw new Error('Orchestra route did not include an exact GenX STT model')
    const grant = readAppGrantSnapshot(payload)
    if (!grant?.artifactRead) return { success: false, status: 'failed', provider: 'genx', model, error: 'AppCapabilityGrant denies STT artifact read.' }

    const sourceId = typeof payload.input?.artifactId === 'string' ? payload.input.artifactId : typeof payload.input?.audioArtifactId === 'string' ? payload.input.audioArtifactId : null
    if (!sourceId) return { success: false, status: 'failed', provider: 'genx', model, error: 'STT requires an authorised audio source artifact' }
    const source = await getArtifactRecord(sourceId)
    if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) {
      return { success: false, status: 'failed', provider: 'genx', model, error: 'Authorised source artifact was not found' }
    }
    if (!source.mimeType.startsWith('audio/') && !source.mimeType.startsWith('video/')) {
      return { success: false, status: 'failed', provider: 'genx', model, error: 'STT source must be audio or video' }
    }
    const file = await getArtifactFile(sourceId)
    if (!file?.buffer.length) return { success: false, status: 'failed', provider: 'genx', model, error: 'Source artifact bytes are missing' }

    const credential = await resolveProviderApiKey('genx')
    apiKey = credential.apiKey
    const providerStatus = await getProviderCredentialStatus('genx')
    const { genxGenerateStt } = await import('@amarktai/providers')
    const { saveArtifact } = await import('@amarktai/artifacts')

    const result = await genxGenerateStt({
      audioBuffer: file.buffer,
      filename: file.filename,
      mimeType: file.mimeType,
      model,
      language: String(payload.input?.language),
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
    })

    let artifactId: string | undefined
    if (payload.input?.persistTranscript !== false) {
      const artifact = await saveArtifact({
        input: {
          appSlug: payload.appSlug, type: 'transcript', subType: 'stt', title: `STT transcript for ${payload.appSlug}`,
          description: 'GenX speech transcription output', provider: 'genx', model, traceId: payload.traceId, mimeType: 'application/json',
          metadata: { capability: 'stt', provider: 'genx', model, sourceArtifactId: sourceId, language: result.language, duration: result.duration, evidenceSource: 'live_provider', liveProviderProof: true },
        }, data: Buffer.from(JSON.stringify({ text: result.text, language: result.language, duration: result.duration, segments: result.segments })), explicitMimeType: 'application/json',
      })
      artifactId = artifact.id
    }

    return {
      success: true, status: 'completed', provider: 'genx', model, artifactId,
      output: JSON.stringify({ transcript: result.text, language: result.language, duration: result.duration, segments: result.segments, artifactId: artifactId ?? null }),
      metadata: { sourceArtifactId: sourceId, artifactId: artifactId ?? null, usage: createCanonicalProviderUsage({ provider: 'genx', model, audioSeconds: result.duration }), outputValidation: { valid: true, contract: 'nonempty_authorised_transcript' } },
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) throw err
    return { success: false, status: 'failed', provider: 'genx', model, error: `GenX STT failed: ${redactProviderSecrets(err instanceof Error ? err.message : 'unknown', [apiKey])}` }
  }
}

async function resolveGenxVoice(model: string, input: Record<string, unknown> | undefined): Promise<{
  id: string; voiceId: string; language: string; locale: string
}> {
  const requested = readString(input, 'voiceProfileId') ?? readString(input, 'voice')
  const voices = requested
    ? await prisma.voiceLibrary.findMany({ where: { enabled: true, provider: 'genx', OR: [{ id: requested }, { voiceId: requested }] } })
    : await prisma.voiceLibrary.findMany({ where: { enabled: true, provider: 'genx' } })
  const language = readString(input, 'language')
  const accent = readString(input, 'accent')?.toLowerCase()
  const style = readString(input, 'tone')?.toLowerCase() ?? readString(input, 'style')?.toLowerCase()
  const compatible = voices.filter((voice) => {
    const models = safeJsonArray(voice.compatibleModels)
    if (models.length > 0 && !models.includes(model)) return false
    if (language && voice.language !== language && voice.locale !== language) return false
    if (accent && !voice.accent.toLowerCase().includes(accent)) return false
    if (style && !voice.style.toLowerCase().includes(style)) return false
    return true
  })
  const voice = compatible[0]
  if (!voice) throw new Error(requested ? `Selected voice '${requested}' is not available for model '${model}'` : `No verified GenX voice is compatible with model '${model}' and the requested profile`)
  return { id: voice.id, voiceId: voice.voiceId, language: voice.language, locale: voice.locale }
}

function safeJsonArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [] } catch { return [] }
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

  const findUnique = (prisma.modelRegistryEntry as typeof prisma.modelRegistryEntry & { findUnique?: typeof prisma.modelRegistryEntry.findUnique }).findUnique
  const modelRecord = typeof findUnique === 'function'
    ? await findUnique.call(prisma.modelRegistryEntry, { where: { provider_modelId: { provider: route.provider, modelId: route.model } } }).catch(() => null)
    : (await prisma.modelRegistryEntry.findMany({ where: { provider: route.provider, modelId: route.model }, take: 1 }).catch(() => []))[0] ?? null
  const compatibility = executorModelMetadataFromDbRecord(modelRecord ?? { provider: route.provider, modelId: route.model })
  const togetherStatus = route.provider === 'together' ? await getProviderCredentialStatus('together') : null
  const dedicatedTogetherEndpoint = togetherStatus?.baseUrl
    ? togetherStatus.baseUrl.replace(/\/$/, '') !== getProviderDefaultBaseUrl('together').replace(/\/$/, '')
    : false
  const accountAccess = String(modelRecord?.accountAccess ?? 'unknown').toLowerCase()
  const modelAccountAccessible = route.provider === 'together'
    ? modelRecord?.accountAccess === undefined || accountAccess === 'accessible'
      || (String(modelRecord?.currentAvailability ?? '').toLowerCase() === 'dedicated_endpoint_required' && dedicatedTogetherEndpoint)
    : accountAccess !== 'inaccessible'
  const modelCompatible = modelRecord !== null
    && modelRecord.enabled !== false
    && !['blocked', 'retired', 'deprecated', 'account_inaccessible'].includes(String(modelRecord.currentAvailability ?? '').toLowerCase())
    && modelAccountAccessible
    && modelRecord.deprecated !== true
    && isExecutorModelCompatible(registration, route.model, compatibility)
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
    const result = await handler({
      ...payload,
      metadata: { ...payload.metadata, routeModelCompatibility: compatibility },
    }, route.model)
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

  if (isReleaseFixtureAdapterEnabled()) {
    const registration = getExecutorRegistrations(capability)[0]
    await persistJobMetadata(payload.jobId, {
      evidenceSource: 'local_fixture',
      fixtureAdapter: 'release-candidate-v1',
      liveProviderProof: false,
      orchestraSelectedProvider: registration?.provider ?? null,
      orchestraSelectedExecutorId: registration?.id ?? null,
      orchestraActualProvider: registration?.provider ?? null,
      orchestraActualExecutorId: registration?.id ?? null,
      directProviderExecutorId: registration?.id ?? null,
      directProviderRouteType: 'fixture',
    }).catch(() => {})
    const result = await executeReleaseFixture(payload)
    await persistJobMetadata(payload.jobId, {
      orchestraActualModel: result.model ?? null,
      orchestraActualOutcome: result.success ? 'completed' : 'failed',
      directProviderUsage: result.metadata?.usage ?? null,
      directProviderOutputValidation: result.metadata?.outputValidation ?? null,
      fixtureEvidence: {
        adapter: 'release-candidate-v1',
        liveProviderProof: false,
        ffmpegMedia: Boolean(result.artifactId),
      },
    }).catch(() => {})
    return result
  }

  const { decision: orchestraDecision, reusedPersistedRoute } = await resolveOrchestraDecision(payload, appGrant)

  await persistJobMetadata(payload.jobId, {
    ...(reusedPersistedRoute ? {} : {
      orchestraExecutionId: orchestraDecision.executionId,
      orchestraSelectedProvider: orchestraDecision.selectedProvider,
      orchestraSelectedModel: orchestraDecision.selectedModel,
      orchestraSelectedExecutorId: orchestraDecision.selectedExecutorId,
      orchestraSelectionPersistedAt: new Date().toISOString(),
    }),
    orchestraSelectionReused: reusedPersistedRoute,
    orchestraExecutionProfile: orchestraDecision.executionProfile,
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
      routeKind: 'primary' as const,
    },
    ...orchestraDecision.fallbackRoutes.map((fallback) => ({
      provider: fallback.provider,
      model: fallback.model,
      executorId: fallback.executorId,
      routeKind: 'fallback' as const,
    })),
  ].filter((route, index, all) => all.findIndex((candidate) => candidate.provider === route.provider && candidate.model === route.model && candidate.executorId === route.executorId) === index)
  const attempts: Array<{ provider: ProviderKey; model: string; executorId: ExecutorId; success: boolean; error?: string }> = []
  let lastResult: ProcessorResult | null = null

  for (const route of routes) {
    const result = await executeRegisteredRoute(payload, route)
    attempts.push({ provider: route.provider, model: route.model, executorId: route.executorId, success: result.success, error: result.error })
    lastResult = result

    if (result.metadata?.errorClassification === 'model_not_available') {
      await recordModelAccessibilityFailure({
        provider: route.provider,
        modelId: route.model,
        blocker: /dedicated|non-serverless|non serverless/i.test(result.error ?? '')
          ? 'dedicated_endpoint_required'
          : 'model_not_available',
      }).catch(() => false)
    }

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
      directProviderSourceArtifactId: result.metadata?.sourceArtifactId ?? null,
    }).catch(() => {})
    await recordCanonicalUsage(payload, route, result).catch(() => {})

    if (result.success) {
      if (typeof recordModelAccessibilitySuccess === 'function') {
        await recordModelAccessibilitySuccess({ provider: route.provider, modelId: route.model }).catch(() => false)
      }
      await persistJobMetadata(payload.jobId, {
        orchestraInitialSelectedProvider: orchestraDecision.selectedProvider,
        orchestraInitialSelectedModel: orchestraDecision.selectedModel,
        orchestraInitialSelectedExecutorId: orchestraDecision.selectedExecutorId,
        orchestraSelectedProvider: route.provider,
        orchestraSelectedModel: route.model,
        orchestraSelectedExecutorId: route.executorId,
      }).catch(() => {})
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
