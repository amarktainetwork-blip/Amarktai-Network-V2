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
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  finishReason: string
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
  const result = await openAiChatCompletion({
    provider: 'deepinfra',
    baseUrl,
    apiKey,
    model,
    messages,
    maxOutputTokens: request.maxTokens ?? 4_096,
    temperature: request.temperature,
    responseFormat: request.responseFormat,
    reasoningEffort: request.reasoningEffort,
  })

  return {
    content: result.content,
    model: result.model,
    usage: {
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    finishReason: result.finishReason,
  }
}
