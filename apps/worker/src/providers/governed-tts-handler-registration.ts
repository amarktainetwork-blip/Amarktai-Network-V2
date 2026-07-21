import { prisma } from '@amarktai/db'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'
import { EXECUTOR_HANDLERS } from './provider-executor.js'
import {
  publicGovernedVoiceEvidence,
  resolveGovernedVoice,
  type GovernedTtsProvider,
  type PublicGovernedVoiceEvidence,
} from './governed-voice-resolver.js'

type LegacyTtsHandler = (payload: WorkerJobData, selectedModel: string) => Promise<ProcessorResult>

function safeJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function persistVoiceResolution(jobId: string, evidence: PublicGovernedVoiceEvidence): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { metadataJson: true } })
  if (!job) throw new Error('Governed TTS job was not found')
  await prisma.job.update({
    where: { id: jobId },
    data: {
      metadataJson: JSON.stringify({
        ...safeJsonObject(job.metadataJson),
        governedTtsVoiceResolution: evidence,
        governedTtsVoiceResolvedAt: new Date().toISOString(),
      }),
    },
  })
}

async function sanitizeArtifactVoiceEvidence(artifactId: string, evidence: PublicGovernedVoiceEvidence): Promise<void> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId }, select: { metadata: true } })
  if (!artifact) throw new Error('Governed TTS artifact was not found after provider execution')
  const metadata = safeJsonObject(artifact.metadata)
  delete metadata.voice
  delete metadata.voiceProfileId
  await prisma.artifact.update({
    where: { id: artifactId },
    data: {
      metadata: JSON.stringify({
        ...metadata,
        governedTtsVoice: evidence,
      }),
    },
  })
}

export function createGovernedTtsHandler(
  provider: GovernedTtsProvider,
  legacyHandler: LegacyTtsHandler,
): LegacyTtsHandler {
  return async (payload, selectedModel) => {
    try {
      const { request, resolution } = await resolveGovernedVoice({ payload, provider, selectedModel })
      const evidence = publicGovernedVoiceEvidence(resolution)
      await persistVoiceResolution(payload.jobId, evidence)

      const input: Record<string, unknown> = {
        ...(payload.input ?? {}),
        text: request.text ?? payload.prompt,
        speed: request.speed,
        outputFormat: request.outputFormat,
        language: resolution.locale || resolution.language || request.locale || request.language,
        style: request.style,
        voice: resolution.providerVoiceId,
      }
      delete input.voiceProfileId
      delete input.providerVoiceId

      const result = await legacyHandler({
        ...payload,
        input,
        metadata: {
          ...(payload.metadata ?? {}),
          governedTtsVoiceResolution: evidence,
        },
      }, selectedModel)

      if (result.success && result.artifactId) {
        await sanitizeArtifactVoiceEvidence(result.artifactId, evidence)
      }
      return {
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          governedTtsVoice: evidence,
        },
      }
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        provider,
        model: selectedModel,
        error: `Governed TTS voice resolution failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        metadata: {
          errorClassification: 'governed_tts_voice_resolution_failed',
          retryable: false,
        },
      }
    }
  }
}

let registered = false

export function registerGovernedTtsHandlers(): void {
  if (registered) return
  const togetherLegacy = EXECUTOR_HANDLERS['together.tts']
  const genxLegacy = EXECUTOR_HANDLERS['genx.tts']
  if (!togetherLegacy || !genxLegacy) throw new Error('Legacy Together/GenX TTS handlers are missing')
  EXECUTOR_HANDLERS['together.tts'] = createGovernedTtsHandler('together', togetherLegacy)
  EXECUTOR_HANDLERS['genx.tts'] = createGovernedTtsHandler('genx', genxLegacy)
  registered = true
}

registerGovernedTtsHandlers()
