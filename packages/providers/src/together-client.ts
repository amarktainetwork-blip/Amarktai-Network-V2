/**
 * Together AI REST client — live integration for image.generate capabilities.
 *
 * Routes image generation payloads to active FLUX model families.
 * All API key resolution goes through @amarktai/core config (single source of truth).
 */

import {
  getTogetherApiKey,
  getTogetherImageModel,
  TOGETHER_BASE_URL,
} from '@amarktai/core'
import { inspectImageBuffer } from './media-inspection.js'
import { providerHttpError } from './provider-errors.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TogetherImageRequest {
  prompt: string
  apiKey?: string
  model?: string
  providerDefaultModel?: string
  width?: number
  height?: number
  steps?: number
  n?: number
  seed?: number
  negativePrompt?: string
}

export interface TogetherImageResponse {
  images: Array<{
    base64: string
    buffer: Buffer
    width: number
    height: number
    mimeType: string
  }>
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export function resolveTogetherImageModel(
  request: Pick<TogetherImageRequest, 'model' | 'providerDefaultModel'> = {},
): string {
  const model =
    request.model?.trim()
    || request.providerDefaultModel?.trim()
    || getTogetherImageModel()

  if (!model) {
    throw new Error('Together image model is not configured. Set request.model, the Together provider defaultModel, or TOGETHER_IMAGE_MODEL to a serverless-accessible Together image model.')
  }

  return model
}

// ── Image Generation ──────────────────────────────────────────────────────────

export async function togetherGenerateImage(
  request: TogetherImageRequest,
): Promise<TogetherImageResponse> {
  const apiKey = request.apiKey ?? getTogetherApiKey()
  const model = resolveTogetherImageModel(request)
  const width = request.width ?? 1024
  const height = request.height ?? 1024

  const body: Record<string, unknown> = {
    model,
    prompt: request.prompt,
    width,
    height,
    steps: request.steps ?? 4,
    n: request.n ?? 1,
    response_format: 'base64',
  }

  if (request.seed !== undefined) body.seed = request.seed
  if (request.negativePrompt) body.negative_prompt = request.negativePrompt

  const response = await fetch(`${TOGETHER_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw providerHttpError({
      provider: 'together',
      status: response.status,
      body: errBody.split(apiKey).join('[redacted]'),
    })
  }

  const data = await response.json() as Record<string, unknown>
  const rawData = data.data as Array<Record<string, unknown>> | undefined

  if (!rawData || rawData.length === 0) {
    throw new Error('Together returned empty image data')
  }

  const images = rawData.map((img) => {
    const b64 = (img.b64_json as string) ?? (img.base64 as string) ?? ''
    const buffer = Buffer.from(b64, 'base64')
    const inspected = inspectImageBuffer(buffer, 'together')
    return {
      base64: b64,
      buffer,
      width: inspected.width,
      height: inspected.height,
      mimeType: inspected.mimeType,
    }
  })

  const usage = data.usage as Record<string, number> | undefined

  return {
    images,
    model: (data.model as string) ?? model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  }
}
