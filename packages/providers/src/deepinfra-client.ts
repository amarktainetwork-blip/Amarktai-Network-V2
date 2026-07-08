import {
  DEEPINFRA_DEFAULT_CHAT_MODEL,
  DEEPINFRA_OPENAI_BASE_URL,
  getDeepinfraApiKey,
} from '@amarktai/core'

export interface DeepInfraChatRequest {
  prompt: string
  apiKey?: string
  model?: string
  providerDefaultModel?: string
  baseUrl?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
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

  const messages: Array<{ role: string; content: string }> = []
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt })
  messages.push({ role: 'user', content: request.prompt })

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: request.maxTokens ?? 64,
      temperature: request.temperature ?? 0,
    }),
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`DeepInfra chat error ${response.status}: ${shortSafeBody(body)}`)
  }

  let data: Record<string, unknown>
  try {
    data = body ? JSON.parse(body) as Record<string, unknown> : {}
  } catch {
    throw new Error(`DeepInfra chat returned unreadable JSON: ${shortSafeBody(body)}`)
  }

  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0]
  const message = choice?.message as Record<string, unknown> | undefined
  const usage = data.usage as Record<string, number> | undefined

  return {
    content: (message?.content as string | undefined) ?? '',
    model: (data.model as string | undefined) ?? model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
    finishReason: (choice?.finish_reason as string | undefined) ?? 'stop',
  }
}

function shortSafeBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 500) || '[empty body]'
}
