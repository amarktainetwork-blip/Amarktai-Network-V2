/**
 * GenX music adapter — live integration for music_generation capability.
 *
 * Handles: music_generation
 *
 * Implements async music generation with long-polling:
 *   1. Submit prompt to GenX via genxGenerateMusic (handles submit+poll+download)
 *   2. Validate audio bytes and MIME type
 *   3. Save to artifact storage
 *   4. Return artifact metadata
 *
 * Provider and model are internally resolved. The caller cannot select
 * GenX or a specific model directly.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import {
  genxGenerateMusic,
  resolveGenxMusicModel,
  type GenxMusicRequest,
} from '@amarktai/providers'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class GenxMusicAdapter implements ProviderAdapter {
  name = 'genx'
  supportedPrefixes = ['music']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    let apiKey = ''
    let model = 'lyria-3-clip-preview'

    try {
      const credential = await import('@amarktai/db').then((m) =>
        m.resolveProviderApiKey('genx'),
      )
      apiKey = credential.apiKey
      const providerStatus = await import('@amarktai/db').then((m) =>
        m.getProviderCredentialStatus('genx'),
      )

      const providerAvailableModels = parseGenxMusicModels(providerStatus.healthMessage)
      model = resolveGenxMusicModel({
        providerDefaultModel: providerStatus.defaultModel || undefined,
        providerFallbackModel: providerStatus.fallbackModel || undefined,
        providerAvailableModels,
      })

      const request: GenxMusicRequest = {
        prompt: context.prompt,
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        providerDefaultModel: providerStatus.defaultModel || undefined,
        providerFallbackModel: providerStatus.fallbackModel || undefined,
        providerAvailableModels,
        duration: readNumber(context.input, 'duration'),
        instrumental: readBool(context.input, 'instrumental'),
        genre: readString(context.input, 'genre'),
        mood: readString(context.input, 'mood'),
        tempo: readString(context.input, 'tempo'),
        negativePrompt: readString(context.input, 'negativePrompt'),
      }

      // Update progress — generation includes submit + poll + download
      await this.updateJobStatus(context, 'processing', 5)

      // genxGenerateMusic handles the full async lifecycle internally
      const result = await genxGenerateMusic(request, {
        onProgress: (progress) => {
          // Map GenX progress (0-100) to worker range (5-95)
          const mapped = Math.min(95, Math.max(5, progress))
          this.updateJobStatus(context, 'processing', mapped).catch(() => {})
        },
      })

      // Validate audio bytes
      if (!result.audioBuffer || result.audioBuffer.length === 0) {
        return {
          success: false,
          status: 'failed',
          error: 'GenX returned empty audio data',
          provider: 'genx',
          model: result.model || model,
        }
      }

      // Validate MIME type against allowed music artifact types
      const { isValidMimeForType } = await import('@amarktai/core')
      if (!isValidMimeForType('music', result.mimeType)) {
        return {
          success: false,
          status: 'failed',
          error: `GenX returned unsupported MIME type '${result.mimeType}' for music artifact`,
          provider: 'genx',
          model: result.model || model,
        }
      }

      // Save to artifact storage
      const artifact = await saveArtifact({
        input: {
          appSlug: context.appSlug,
          type: 'music',
          subType: 'music_generation',
          title: `music_generation output for ${context.appSlug}`,
          description: 'GenX music_generation artifact',
          provider: 'genx',
          model: result.model || model,
          traceId: context.traceId,
          mimeType: result.mimeType,
          metadata: {
            capability: 'music_generation',
            provider: 'genx',
            model: result.model || model,
            duration: result.duration,
            providerJobId: result.providerJobId,
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
      // ProviderConfigError is re-thrown for the executor to handle
      const { ProviderConfigError } = await import('@amarktai/db')
      if (err instanceof ProviderConfigError) throw err

      const { redactProviderSecrets } = await import('../providers/provider-executor.js')
      // redactProviderSecrets is not exported — inline secret redaction
      const message = err instanceof Error ? err.message : 'Unknown GenX music error'
      const safeMessage = redactMusicSecrets(message, [apiKey])
      return {
        success: false,
        status: 'failed',
        error: `GenX music execution failed: provider=genx; selectedModel=${model}; ${safeMessage}`,
        provider: 'genx',
        model,
      }
    }
  }

  private async updateJobStatus(
    context: ProviderExecutionContext,
    status: string,
    progress: number,
  ): Promise<void> {
    try {
      await prisma.job.update({
        where: { id: context.jobId },
        data: {
          status,
          progress,
          ...(status === 'processing' ? { startedAt: new Date() } : {}),
        },
      })
    } catch {
      // Non-critical
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function parseGenxMusicModels(healthMessage: string): string[] {
  const match = healthMessage.match(/Models seen:\s*(.+)$/i)
  if (!match?.[1]) return []

  return match[1]
    .split(',')
    .map((model) => model.trim().replace(/\.$/, ''))
    .filter(Boolean)
}

function redactMusicSecrets(message: string, extraKeys: string[] = []): string {
  let safe = message
  for (const key of [process.env.GENX_API_KEY, process.env.GROQ_API_KEY, process.env.TOGETHER_API_KEY, process.env.DEEPINFRA_API_KEY, process.env.MIMO_API_KEY, ...extraKeys]) {
    if (key) {
      safe = safe.split(key).join('[redacted]')
    }
  }
  return safe
}
