import {
  DEEPINFRA_DEFAULT_CHAT_MODEL,
  DEEPINFRA_OPENAI_BASE_URL,
  getDeepinfraApiKey,
} from '@amarktai/core'
import { openAiChatCompletion, type OpenAiTransportMessage } from './openai-transport.js'

export interface DeepInfraChatRequest {
  prompt: string
  apiKey?: string
  model?: string
  providerDefaultModel?: string
  baseUrl?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  messages?: OpenAiTransportMessage[]
  responseFormat?: Record<string, unknown>
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface DeepInfraChatResponse {
  content: string
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; providerReportedCost?: number | null; currency?: string | null }
  finishReason: string
}

export interface DeepInfraVisionImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  data?: Buffer
  url?: string
}

export interface DeepInfraVisionRequest {
  prompt: string
  images: DeepInfraVisionImage[]
  apiKey?: string
  model: string
  baseUrl?: string
  systemPrompt?: string
  maxTokens?: number
  responseFormat?: Record<string, unknown>
}

export function resolveDeepInfraChatModel(input: {
  requestModel?: string
  providerDefaultModel?: string
} = {}): string {
  return input.requestModel?.trim()
    || input.providerDefaultModel?.trim()
    || process.env.DEEPINFRA_CHAT_MODEL?.trim()
    || DEEPINFRA_DEFAULT_CHAT_MODEL
}

function normalizeResponse(result: Awaited<ReturnType<typeof openAiChatCompletion>>): DeepInfraChatResponse {
  return {
    content: result.content,
    model: result.model,
    usage: {
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      providerReportedCost: result.usage.providerReportedCost,
      currency: result.usage.currency,
    },
    finishReason: result.finishReason,
  }
}

export async function deepinfraChat(request: DeepInfraChatRequest): Promise<DeepInfraChatResponse> {
  const apiKey = request.apiKey ?? getDeepinfraApiKey()
  const baseUrl = (request.baseUrl?.trim() || DEEPINFRA_OPENAI_BASE_URL).replace(/\/$/, '')
  const model = resolveDeepInfraChatModel({
    requestModel: request.model,
    providerDefaultModel: request.providerDefaultModel,
  })

  const messages: OpenAiTransportMessage[] = []
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt })
  messages.push(...(request.messages ?? []))
  if (request.prompt.trim()) messages.push({ role: 'user', content: request.prompt })
  return normalizeResponse(await openAiChatCompletion({
    provider: 'deepinfra',
    baseUrl,
    apiKey,
    model,
    messages,
    maxOutputTokens: request.maxTokens ?? 4_096,
    temperature: request.temperature,
    responseFormat: request.responseFormat,
    reasoningEffort: request.reasoningEffort,
  }))
}

function imageUrl(image: DeepInfraVisionImage): string {
  if (image.url?.trim()) return image.url.trim()
  if (!image.data?.length) throw new Error('DeepInfra vision image requires data or URL')
  if (image.data.length > 20 * 1024 * 1024) throw new Error('DeepInfra vision image exceeds 20MB')
  return `data:${image.mimeType};base64,${image.data.toString('base64')}`
}

export async function deepinfraVision(request: DeepInfraVisionRequest): Promise<DeepInfraChatResponse> {
  const model = request.model.trim()
  if (!model) throw new Error('DeepInfra vision requires an Orchestra-selected model')
  if (request.images.length < 1 || request.images.length > 12) {
    throw new Error('DeepInfra vision requires between 1 and 12 images')
  }
  const apiKey = request.apiKey ?? getDeepinfraApiKey()
  const baseUrl = (request.baseUrl?.trim() || DEEPINFRA_OPENAI_BASE_URL).replace(/\/$/, '')
  const content: OpenAiTransportMessage['content'] = [
    ...request.images.map((image) => ({ type: 'image_url' as const, image_url: { url: imageUrl(image) } })),
    { type: 'text' as const, text: request.prompt },
  ]
  const messages: OpenAiTransportMessage[] = []
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt })
  messages.push({ role: 'user', content })
  return normalizeResponse(await openAiChatCompletion({
    provider: 'deepinfra',
    baseUrl,
    apiKey,
    model,
    messages,
    maxOutputTokens: request.maxTokens ?? 4_096,
    temperature: 0,
    responseFormat: request.responseFormat,
    timeoutMs: 120_000,
  }))
}
