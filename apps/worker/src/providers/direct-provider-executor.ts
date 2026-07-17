import {
  createCanonicalProviderUsage,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
  type CapabilityKey,
  type ExecutorId,
  type ProviderKey,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import {
  CanonicalProviderError,
  deepinfraTaskInference,
  providerEmbeddings,
  providerRerank,
  type OpenAiTransportMessage,
} from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

type DirectHandler = (payload: WorkerJobData, selectedModel: string) => Promise<ProcessorResult>
type TextProvider = Extract<ProviderKey, 'deepinfra'>
type RetrievalProvider = Extract<ProviderKey, 'together' | 'deepinfra'>

export const DIRECT_EXECUTOR_HANDLERS: Partial<Record<ExecutorId, DirectHandler>> = {
  'deepinfra.chat': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.text-transform': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.task-inference': executeDeepInfraTaskCapability,
  'deepinfra.embeddings': (payload, model) => executeEmbeddingsCapability('deepinfra', payload, model),
  'deepinfra.reranking': (payload, model) => executeRerankingCapability('deepinfra', payload, model),
  'together.embeddings': (payload, model) => executeEmbeddingsCapability('together', payload, model),
  'together.reranking': (payload, model) => executeRerankingCapability('together', payload, model),
}

async function executeValidatedTextCapability(
  provider: TextProvider,
  payload: WorkerJobData,
  selectedModel: string,
): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, provider, selectedModel)
  const input = validation.data!
  const capability = payload.capability as CapabilityKey

  try {
    const credential = await resolveProviderApiKey(provider)
    const providerStatus = await getProviderCredentialStatus(provider)
    const plan = buildTextPlan(capability, payload.prompt, input)
    const responseFormat = plan.schema
      ? { type: 'json_schema', json_schema: { name: `${capability}_output`, strict: true, schema: plan.schema } }
      : undefined
    const result = await import('@amarktai/providers').then(({ deepinfraChat }) => deepinfraChat({
        prompt: plan.prompt,
        apiKey: credential.apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        model: selectedModel,
        systemPrompt: plan.system,
        messages: chatMessages(input.messages),
        maxTokens: numberValue(input.maxOutputTokens),
        temperature: numberValue(input.temperature) ?? 0,
        responseFormat,
        reasoningEffort: capability === 'reasoning' ? effortValue(input.effort) : undefined,
      }))

    let output: unknown = result.content
    if (plan.schema) {
      output = parseJsonObject(result.content, `${capability} returned invalid JSON`)
      const schemaValidation = validateJsonSchemaValue(output, plan.schema)
      if (!schemaValidation.valid) throw malformed(provider, `${capability} output schema failed: ${schemaValidation.errors.join('; ')}`)
      validateTextSemantics(capability, output, input, provider)
    } else if (!result.content.trim()) {
      throw malformed(provider, `${capability} returned empty text`)
    }

    const rationale = 'reasoningSummary' in result ? result.reasoningSummary : null
    return success(typeof output === 'string' ? output : JSON.stringify(output), provider, selectedModel, result.usage.promptTokens, result.usage.completionTokens, {
      finishReason: result.finishReason,
      reasoningSummary: capability === 'reasoning' ? rationale : undefined,
      outputValidation: { valid: true, contract: plan.schema ? `${capability}_json_schema` : `${capability}_nonempty_text` },
    })
  } catch (error) {
    return providerFailure(provider, selectedModel, error)
  }
}

async function executeDeepInfraTaskCapability(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, 'deepinfra', selectedModel)
  const input = validation.data!
  const capability = payload.capability as CapabilityKey
  try {
    const credential = await resolveProviderApiKey('deepinfra')
    const providerStatus = await getProviderCredentialStatus('deepinfra')
    let requestBody: Record<string, unknown>
    if (capability === 'zero_shot_classification') {
      requestBody = { input: input.text, candidate_labels: input.labels, multi_label: input.multiLabel }
    } else if (capability === 'token_classification' || capability === 'fill_mask') {
      requestBody = { input: input.text }
    } else if (capability === 'table_qa') {
      requestBody = { query: input.question, table: input.table }
    } else {
      return failure(`Unsupported DeepInfra task capability '${capability}'`, 'deepinfra', selectedModel)
    }
    const raw = await deepinfraTaskInference({
      apiKey: credential.apiKey,
      model: selectedModel,
      baseUrl: providerStatus.baseUrl || undefined,
      input: requestBody,
    })
    const output = normalizeDeepInfraTaskOutput(capability, raw, input)
    return success(JSON.stringify(output), 'deepinfra', selectedModel, 0, 0, {
      outputValidation: { valid: true, contract: `${capability}_specialist_task` },
    })
  } catch (error) {
    return providerFailure('deepinfra', selectedModel, error)
  }
}

async function executeEmbeddingsCapability(
  provider: RetrievalProvider,
  payload: WorkerJobData,
  selectedModel: string,
): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, provider, selectedModel)
  const input = validation.data!
  try {
    const credential = await resolveProviderApiKey(provider)
    const providerStatus = await getProviderCredentialStatus(provider)
    const capability = payload.capability as CapabilityKey
    if (capability === 'sentence_similarity') {
      return executeSentenceSimilarity(provider, payload, selectedModel, input, credential.apiKey, providerStatus.baseUrl || undefined)
    }
    const texts = capability === 'feature_extraction'
      ? (Array.isArray(input.text) ? input.text as string[] : [String(input.text)])
      : input.texts as string[]
    const result = await providerEmbeddings({
      provider,
      apiKey: credential.apiKey,
      model: selectedModel,
      texts,
      dimensions: numberValue(input.dimensions),
      baseUrl: providerStatus.baseUrl || undefined,
    })
    const output = capability === 'feature_extraction'
      ? { features: result.vectors, dimensions: result.dimensions, normalized: input.normalize ?? null }
      : { vectors: result.vectors, dimensions: result.dimensions, count: result.vectors.length, normalized: input.normalize ?? null }
    return success(JSON.stringify(output), provider, selectedModel, result.usage.inputTokens, 0, {
      outputValidation: { valid: true, contract: capability === 'feature_extraction' ? 'numeric_feature_vectors' : 'embedding_vectors' },
      dimensions: result.dimensions,
      vectorCount: result.vectors.length,
      providerReportedCost: result.usage.providerReportedCost,
      currency: result.usage.currency,
    })
  } catch (error) {
    return providerFailure(provider, selectedModel, error)
  }
}

async function executeSentenceSimilarity(
  provider: RetrievalProvider,
  _payload: WorkerJobData,
  selectedModel: string,
  input: Record<string, unknown>,
  apiKey: string,
  baseUrl?: string,
): Promise<ProcessorResult> {
  try {
    const comparisons = input.comparisonSentences as string[]
    const result = await providerEmbeddings({
      provider,
      apiKey,
      model: selectedModel,
      texts: [String(input.sourceSentence), ...comparisons],
      baseUrl,
    })
    const source = result.vectors[0]!
    const scores = result.vectors.slice(1).map((vector, index) => ({
      index,
      sentence: comparisons[index]!,
      score: cosineSimilarity(source, vector),
    }))
    if (scores.some((item) => !Number.isFinite(item.score) || item.score < -1 || item.score > 1)) throw malformed(provider, 'sentence similarity returned an out-of-range score')
    return success(JSON.stringify({ scores, range: [-1, 1] }), provider, selectedModel, result.usage.inputTokens, 0, {
      outputValidation: { valid: true, contract: 'finite_cosine_similarity_scores' },
      dimensions: result.dimensions,
    })
  } catch (error) {
    return providerFailure(provider, selectedModel, error)
  }
}

async function executeRerankingCapability(
  provider: RetrievalProvider,
  payload: WorkerJobData,
  selectedModel: string,
): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, provider, selectedModel)
  const input = validation.data!
  try {
    const credential = await resolveProviderApiKey(provider)
    const providerStatus = await getProviderCredentialStatus(provider)
    const documents = (input.documents as Array<string | { id?: string; text: string }>).map((document) =>
      typeof document === 'string' ? { text: document } : document,
    )
    const result = await providerRerank({
      provider,
      apiKey: credential.apiKey,
      model: selectedModel,
      query: String(input.query),
      documents,
      topN: numberValue(input.topN),
      baseUrl: providerStatus.baseUrl || undefined,
    })
    return success(JSON.stringify({ results: result.results }), provider, selectedModel, result.usage.inputTokens, 0, {
      outputValidation: { valid: true, contract: 'ordered_finite_rerank_scores' },
      providerReportedCost: result.usage.providerReportedCost,
      currency: result.usage.currency,
    })
  } catch (error) {
    return providerFailure(provider, selectedModel, error)
  }
}

function buildTextPlan(capability: CapabilityKey, prompt: string, input: Record<string, unknown>): { system: string; prompt: string; schema?: Record<string, unknown> } {
  if (capability === 'reasoning') return { system: 'Return a concise final answer and a concise rationale. Never reveal hidden chain-of-thought.', prompt: joinPrompt(prompt, input.context, input.constraints), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.reasoning }
  if (capability === 'code') return { system: `Produce nonempty ${input.outputFormat} output in ${input.language}.`, prompt: joinPrompt(input.task, input.existingCode, input.context), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.code }
  if (capability === 'summarization') return { system: `Summarize in ${input.desiredLength} ${input.format} form.`, prompt: String(input.sourceText), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.summarization }
  if (capability === 'translation') return { system: `Translate to ${input.targetLanguage}. Preserve tone: ${input.preserveTone}. Do not summarize.`, prompt: String(input.sourceText), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.translation }
  if (capability === 'question_answering') return { system: 'Answer only from supplied context. Set supportedByContext=false when the context is insufficient.', prompt: joinPrompt(input.question, input.context, input.sourceIds), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.question_answering }
  if (capability === 'classification') return { system: `Select only labels from this allowlist: ${JSON.stringify(input.labels)}. Multilabel: ${input.multiLabel}. Scores, when supplied, must be 0..1.`, prompt: String(input.text), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.classification }
  if (capability === 'extraction') return { system: `Extract data matching this JSON Schema: ${JSON.stringify(input.schema)}.`, prompt: String(input.sourceText), schema: input.schema as Record<string, unknown> }
  if (capability === 'structured_output') return { system: `Return data matching this JSON Schema: ${JSON.stringify(input.schema)}.`, prompt: joinPrompt(prompt, input.context), schema: input.schema as Record<string, unknown> }
  return { system: 'Return a clear, nonempty response.', prompt }
}

function normalizeDeepInfraTaskOutput(capability: CapabilityKey, raw: unknown, input: Record<string, unknown>): Record<string, unknown> {
  if (capability === 'zero_shot_classification') {
    const record = asRecord(raw)
    const labels = arrayStrings(record.labels)
    const scores = numberArray(record.scores)
    const allowed = new Set(input.labels as string[])
    if (!labels.length || labels.length !== scores.length || labels.some((label) => !allowed.has(label)) || scores.some((score) => score < 0 || score > 1)) throw malformed('deepinfra', 'zero-shot classification returned invalid labels or scores')
    return { labels: labels.map((label, index) => ({ label, score: scores[index] })) }
  }
  if (capability === 'token_classification') {
    const items = Array.isArray(raw) ? raw.filter(isRecord) : arrayRecords(asRecord(raw).items)
    const normalized = items.map((item) => ({
      text: String(item.word ?? item.token ?? ''), start: Number(item.start), end: Number(item.end),
      label: String(item.entity_group ?? item.entity ?? item.label ?? ''), score: Number(item.score),
    }))
    if (!normalized.length || normalized.some((item) => !item.text || !item.label || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end < item.start || !Number.isFinite(item.score))) throw malformed('deepinfra', 'token classification returned invalid spans')
    return { items: normalized }
  }
  if (capability === 'fill_mask') {
    const items = Array.isArray(raw) ? raw.filter(isRecord) : arrayRecords(asRecord(raw).predictions)
    const predictions = items.map((item) => ({ token: String(item.token_str ?? item.token ?? ''), sequence: String(item.sequence ?? ''), score: Number(item.score) }))
      .filter((item) => item.token && item.sequence && Number.isFinite(item.score))
      .sort((left, right) => right.score - left.score)
      .slice(0, Number(input.topK))
    if (!predictions.length) throw malformed('deepinfra', 'fill-mask returned no valid predictions')
    return { predictions }
  }
  if (capability === 'table_qa') {
    const record = asRecord(raw)
    const answer = String(record.answer ?? '')
    if (!answer.trim()) throw malformed('deepinfra', 'table QA returned an empty answer')
    return { answer, coordinates: Array.isArray(record.coordinates) ? record.coordinates : [], cells: Array.isArray(record.cells) ? record.cells : [], confidence: nullableFinite(record.score) }
  }
  throw malformed('deepinfra', `Unsupported specialist output '${capability}'`)
}

function validateTextSemantics(capability: CapabilityKey, output: unknown, input: Record<string, unknown>, provider: string): void {
  const record = asRecord(output)
  if (capability === 'classification') {
    const allowed = new Set(input.labels as string[])
    const labels = arrayRecords(record.labels)
    if (labels.some((item) => !allowed.has(String(item.label)))) throw malformed(provider, 'classification returned a label outside the allowlist')
    if (input.multiLabel !== true && labels.length !== 1) throw malformed(provider, 'single-label classification returned multiple labels')
  }
  if (capability === 'code' && !String(record.code ?? '').trim()) throw malformed(provider, 'code output was empty')
  if (capability === 'translation' && !String(record.translation ?? '').trim()) throw malformed(provider, 'translation output was empty')
}

function validatedInput(payload: WorkerJobData) {
  return validateDirectProviderRequest(payload.capability, payload.prompt, payload.input ?? {})
}

function success(output: string, provider: ProviderKey, model: string, inputTokens: number, outputTokens: number, metadata: Record<string, unknown>): ProcessorResult {
  return {
    success: true,
    status: 'completed',
    output,
    provider,
    model,
    metadata: {
      ...metadata,
      usage: createCanonicalProviderUsage({
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        providerReportedCost: nullableFinite(metadata.providerReportedCost),
        currency: typeof metadata.currency === 'string' ? metadata.currency : null,
      }),
    },
  }
}

function failure(error: string, provider?: string, model?: string): ProcessorResult {
  return { success: false, status: 'failed', error, provider, model }
}

function providerFailure(provider: ProviderKey, model: string, error: unknown, metadata: Record<string, unknown> = {}): ProcessorResult {
  if (error instanceof ProviderConfigError) throw error
  const canonical = error instanceof CanonicalProviderError ? error : new CanonicalProviderError({ code: 'provider_unavailable', provider, message: error instanceof Error ? error.message : 'Provider execution failed', cause: error })
  return {
    success: false,
    status: 'failed',
    provider,
    model,
    error: `${provider} ${canonical.code}: ${canonical.message}`,
    metadata: { ...metadata, errorClassification: canonical.code, retryable: canonical.retryable, httpStatus: canonical.status },
  }
}

function malformed(provider: string, message: string): CanonicalProviderError {
  return new CanonicalProviderError({ code: 'malformed_response', provider, message })
}

function chatMessages(value: unknown): OpenAiTransportMessage[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((message) => ({
    role: message.role as OpenAiTransportMessage['role'],
    content: String(message.content),
    ...(typeof message.toolCallId === 'string' ? { tool_call_id: message.toolCallId } : {}),
  }))
}

function parseJsonObject(value: string, message: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    if (!isRecord(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new Error(message)
  }
}

function joinPrompt(...parts: unknown[]): string {
  return parts.filter((part) => part !== undefined && part !== null && part !== '').map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join('\n\n')
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0; let leftNorm = 0; let rightNorm = 0
  for (let index = 0; index < left.length; index++) {
    dot += left[index]! * right[index]!
    leftNorm += left[index]! ** 2
    rightNorm += right[index]! ** 2
  }
  if (leftNorm === 0 || rightNorm === 0) throw new Error('Cannot compare zero-length embedding norm')
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function asRecord(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw new Error('Expected an object response'); return value }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function arrayRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : [] }
function arrayStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function numberArray(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [] }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function effortValue(value: unknown): 'low' | 'medium' | 'high' | undefined { return value === 'low' || value === 'medium' || value === 'high' ? value : undefined }
function nullableFinite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }
