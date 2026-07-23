import { getProviderDefaultBaseUrl, type ProviderKey } from '@amarktai/core'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface OpenAiTextContentPart {
  type: 'text'
  text: string
}

export interface OpenAiImageContentPart {
  type: 'image_url'
  image_url: { url: string }
}

export type OpenAiTransportContent = string | null | Array<OpenAiTextContentPart | OpenAiImageContentPart>

export interface OpenAiTransportMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: OpenAiTransportContent
  tool_call_id?: string
  tool_calls?: OpenAiToolCall[]
}

export interface OpenAiToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAiChatTransportRequest {
  provider: Extract<ProviderKey, 'together' | 'deepinfra' | 'genx'>
  baseUrl: string
  apiKey: string
  model: string
  messages: OpenAiTransportMessage[]
  maxOutputTokens?: number
  temperature?: number
  responseFormat?: Record<string, unknown>
  tools?: OpenAiToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required'
  reasoningEffort?: 'low' | 'medium' | 'high'
  timeoutMs?: number
  maxRetries?: number
  signal?: AbortSignal
}

export interface OpenAiChatTransportResponse {
  content: string
  reasoningSummary: string | null
  model: string
  finishReason: string
  toolCalls: OpenAiToolCall[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    providerReportedCost: number | null
    currency: string | null
  }
}

export interface OpenAiStreamChunk {
  type: 'content' | 'usage' | 'done'
  content?: string
  finishReason?: string
  usage?: OpenAiChatTransportResponse['usage']
  model?: string
}

export async function openAiChatCompletion(request: OpenAiChatTransportRequest): Promise<OpenAiChatTransportResponse> {
  const response = await fetchWithRetry(request, false)
  const body = await response.text()
  let data: Record<string, unknown>
  try {
    data = body ? JSON.parse(body) as Record<string, unknown> : {}
  } catch (error) {
    throw new CanonicalProviderError({
      code: 'malformed_response',
      provider: request.provider,
      message: `${request.provider} returned unreadable chat JSON`,
      cause: error,
    })
  }

  const choice = arrayRecords(data.choices)[0]
  const message = isRecord(choice?.message) ? choice.message : {}
  const content = typeof message.content === 'string' ? message.content : ''
  const reasoningSummary = firstString(message.reasoning, message.reasoning_content, message.reasoning_summary)
  const toolCalls = arrayRecords(message.tool_calls).map(parseToolCall).filter((call): call is OpenAiToolCall => call !== null)
  const usage = normalizeOpenAiUsage(data.usage)
  if (!content.trim() && toolCalls.length === 0) {
    throw new CanonicalProviderError({
      code: 'malformed_response',
      provider: request.provider,
      message: `${request.provider} returned neither content nor tool calls`,
    })
  }
  return {
    content,
    reasoningSummary,
    model: typeof data.model === 'string' && data.model.trim() ? data.model : request.model,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'stop',
    toolCalls,
    usage,
  }
}

export async function* openAiStreamingChat(
  request: OpenAiChatTransportRequest,
): AsyncGenerator<OpenAiStreamChunk> {
  const response = await fetchWithRetry(request, true)
  if (!response.body) {
    throw new CanonicalProviderError({ code: 'malformed_response', provider: request.provider, message: `${request.provider} streaming response had no body` })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalUsage: OpenAiChatTransportResponse['usage'] | undefined
  let finalModel = request.model
  let finalReason = 'stop'

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          let data: Record<string, unknown>
          try {
            data = JSON.parse(payload) as Record<string, unknown>
          } catch {
            throw new CanonicalProviderError({ code: 'malformed_response', provider: request.provider, message: `${request.provider} emitted invalid SSE JSON` })
          }
          if (typeof data.model === 'string') finalModel = data.model
          if (data.usage) {
            finalUsage = normalizeOpenAiUsage(data.usage)
            yield { type: 'usage', usage: finalUsage, model: finalModel }
          }
          const choice = arrayRecords(data.choices)[0]
          const delta = isRecord(choice?.delta) ? choice.delta : {}
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            yield { type: 'content', content: delta.content, model: finalModel }
          }
          if (typeof choice?.finish_reason === 'string') finalReason = choice.finish_reason
        }
      }
    }
  } catch (error) {
    throw normalizeProviderError(request.provider, error)
  } finally {
    reader.releaseLock()
  }

  yield { type: 'done', finishReason: finalReason, usage: finalUsage, model: finalModel }
}

async function fetchWithRetry(request: OpenAiChatTransportRequest, stream: boolean): Promise<Response> {
  const maxRetries = Math.max(0, Math.min(request.maxRetries ?? 2, 3))
  const baseUrl = request.baseUrl.trim() || getProviderDefaultBaseUrl(request.provider)
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('provider timeout'))
    }, request.timeoutMs ?? 60_000)
    const cancel = () => controller.abort(request.signal?.reason)
    request.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const payload: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        max_completion_tokens: request.maxOutputTokens ?? 4_096,
        temperature: request.temperature ?? 0,
        stream,
      }
      if (stream) payload.stream_options = { include_usage: true }
      if (request.responseFormat) payload.response_format = request.responseFormat
      if (request.tools?.length) payload.tools = request.tools
      if (request.toolChoice) payload.tool_choice = request.toolChoice
      if (request.reasoningEffort) payload.reasoning_effort = request.reasoningEffort

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (response.ok) return response
      const error = providerHttpError({ provider: request.provider, status: response.status, body: await response.text() })
      if (!error.retryable || attempt === maxRetries) throw error
      lastError = error
      await delay(Math.min(250 * 2 ** attempt, 2_000), request.signal)
    } catch (error) {
      const normalized = timedOut
        ? new CanonicalProviderError({ code: 'provider_timeout', provider: request.provider, message: `${request.provider} request timed out`, cause: error })
        : normalizeProviderError(request.provider, error)
      if (!normalized.retryable || normalized.code === 'cancelled_request' || attempt === maxRetries) throw normalized
      lastError = normalized
      await delay(Math.min(250 * 2 ** attempt, 2_000), request.signal)
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
    }
  }
  throw normalizeProviderError(request.provider, lastError)
}

function normalizeOpenAiUsage(value: unknown): OpenAiChatTransportResponse['usage'] {
  const usage = isRecord(value) ? value : {}
  const inputTokens = finiteNumber(usage.prompt_tokens ?? usage.input_tokens)
  const outputTokens = finiteNumber(usage.completion_tokens ?? usage.output_tokens)
  return {
    inputTokens,
    outputTokens,
    totalTokens: finiteNumber(usage.total_tokens) || inputTokens + outputTokens,
    providerReportedCost: nullableNumber(usage.cost ?? usage.total_cost ?? usage.estimated_cost),
    currency: typeof usage.currency === 'string' ? usage.currency : null,
  }
}

function parseToolCall(value: Record<string, unknown>): OpenAiToolCall | null {
  const fn = isRecord(value.function) ? value.function : {}
  if (typeof value.id !== 'string' || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') return null
  return { id: value.id, type: 'function', function: { name: fn.name, arguments: fn.arguments } }
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function firstString(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}
