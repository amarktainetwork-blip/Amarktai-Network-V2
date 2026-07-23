import {
  openAiChatCompletion as rawOpenAiChatCompletion,
  openAiStreamingChat,
  type OpenAiChatTransportRequest,
  type OpenAiChatTransportResponse,
  type OpenAiImageContentPart,
  type OpenAiStreamChunk,
  type OpenAiTextContentPart,
  type OpenAiToolCall,
  type OpenAiToolDefinition,
  type OpenAiTransportContent,
  type OpenAiTransportMessage,
} from './openai-transport.js'

export { openAiStreamingChat }
export type {
  OpenAiChatTransportRequest,
  OpenAiChatTransportResponse,
  OpenAiImageContentPart,
  OpenAiStreamChunk,
  OpenAiTextContentPart,
  OpenAiToolCall,
  OpenAiToolDefinition,
  OpenAiTransportContent,
  OpenAiTransportMessage,
}

/**
 * OpenAI-compatible reasoning models may wrap an otherwise valid structured
 * response in reasoning text or Markdown fences. Normalise only calls that
 * explicitly request a JSON object; ordinary chat content remains untouched.
 * The worker still performs the authoritative JSON Schema and semantic checks.
 */
export async function openAiChatCompletion(
  request: OpenAiChatTransportRequest,
): Promise<OpenAiChatTransportResponse> {
  const response = await rawOpenAiChatCompletion(request)
  if (!expectsStructuredJsonObject(request)) return response

  const content = extractLastJsonObject(response.content)
  return content === null ? response : { ...response, content }
}

function expectsStructuredJsonObject(request: OpenAiChatTransportRequest): boolean {
  if (request.responseFormat) return true
  return request.messages.some((message) =>
    typeof message.content === 'string'
      && /return only (?:one |a )?json object|matching this json schema|extract data matching this json schema/i.test(message.content),
  )
}

function extractLastJsonObject(content: string): string | null {
  const direct = parseRecord(content.trim())
  if (direct) return JSON.stringify(direct)

  let last: Record<string, unknown> | null = null

  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = parseRecord(String(match[1] ?? '').trim())
    if (parsed) last = parsed
  }

  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }

    if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const parsed = parseRecord(content.slice(start, index + 1))
        if (parsed) last = parsed
        start = -1
      }
    }
  }

  return last ? JSON.stringify(last) : null
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}
