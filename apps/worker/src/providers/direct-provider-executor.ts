import {
  createCanonicalProviderUsage,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
  getProviderDefaultBaseUrl,
  resolveStructuredOutputContract,
  structuredResponseFormat,
  downgradeStructuredOutput,
  type CapabilityKey,
  type ExecutorId,
  type ProviderKey,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import {
  CanonicalProviderError,
  deepinfraTaskInference,
  openAiChatCompletion,
  providerEmbeddings,
  providerRerank,
  type OpenAiTransportMessage,
} from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

type DirectHandler = (payload: WorkerJobData, selectedModel: string) => Promise<ProcessorResult>
type TextProvider = Extract<ProviderKey, 'deepinfra' | 'together' | 'genx'>
type RetrievalProvider = Extract<ProviderKey, 'together' | 'deepinfra'>

export const DIRECT_EXECUTOR_HANDLERS: Partial<Record<ExecutorId, DirectHandler>> = {
  'deepinfra.chat': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.text-transform': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.task-inference': executeDeepInfraTaskCapability,
  'deepinfra.embeddings': (payload, model) => executeEmbeddingsCapability('deepinfra', payload, model),
  'deepinfra.reranking': (payload, model) => executeRerankingCapability('deepinfra', payload, model),
  'together.chat': (payload, model) => executeValidatedTextCapability('together', payload, model),
  'genx.chat': (payload, model) => executeValidatedTextCapability('genx', payload, model),
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
    const compatibility = isRecord(payload.metadata?.routeModelCompatibility) ? payload.metadata!.routeModelCompatibility as Record<string, unknown> : {}
    let structuredContract = resolveStructuredOutputContract(arrayStrings(compatibility.structuredOutputModes))
    const messages = chatMessages(input.messages)
    const baseUrl = (providerStatus.baseUrl || getProviderDefaultBaseUrl(provider)).replace(/\/$/, '')
    const call = async (prompt: string) => openAiChatCompletion({
      provider,
      apiKey: credential.apiKey,
      baseUrl,
      model: selectedModel,
      messages: [
        { role: 'system', content: plan.schema && structuredContract.selectedMode !== 'json_schema'
          ? `${plan.system}\nReturn only one JSON object matching this schema: ${JSON.stringify(plan.schema)}`
          : plan.system },
        ...messages,
        { role: 'user', content: prompt },
      ],
      maxOutputTokens: numberValue(input.maxOutputTokens),
      temperature: numberValue(input.temperature) ?? 0,
      responseFormat: plan.schema ? structuredResponseFormat(structuredContract, `${capability}_output`, plan.schema) : undefined,
      reasoningEffort: capability === 'reasoning' && arrayStrings(compatibility.supportedParameters).includes('reasoning_effort') ? effortValue(input.effort) : undefined,
    })

    let result
    try {
      result = await call(plan.prompt)
    } catch (error) {
      const downgrade = plan.schema && isUnsupportedResponseFormat(error) ? downgradeStructuredOutput(structuredContract) : null
      if (!downgrade) throw error
      structuredContract = downgrade
      result = await call(plan.prompt)
    }

    let output: unknown = result.content
    if (plan.schema) {
      let schemaValidation
      try {
        output = parseJsonObject(result.content, `${capability} returned invalid JSON`)
        schemaValidation = validateJsonSchemaValue(output, plan.schema)
        if (!schemaValidation.valid) throw malformed(provider, `${capability} output schema failed: ${schemaValidation.errors.join('; ')}`)
      } catch (firstError) {
        const repair = await call(`Repair this invalid ${capability} response. Return only a JSON object matching the required schema.\nInvalid response:\n${result.content}`)
        output = parseJsonObject(repair.content, `${capability} repair returned invalid JSON`)
        schemaValidation = validateJsonSchemaValue(output, plan.schema)
        if (!schemaValidation.valid) throw malformed(provider, `${capability} repaired output schema failed: ${schemaValidation.errors.join('; ')}`)
        result = repair
        void firstError
      }
      validateTextSemantics(capability, output, input, provider)
    } else if (!result.content.trim()) {
      throw malformed(provider, `${capability} returned empty text`)
    }

    const rationale = result.reasoningSummary
    return success(typeof output === 'string' ? output : JSON.stringify(output), provider, selectedModel, result.usage.inputTokens, result.usage.outputTokens, {
      finishReason: result.finishReason,
      reasoningSummary: capability === 'reasoning' ? rationale : undefined,
      outputValidation: {
        valid: true,
        contract: plan.schema ? `${capability}_canonical_schema` : `${capability}_nonempty_text`,
        mode: plan.schema ? structuredContract.validationMode : 'nonempty_text',
        providerEnforcedSchema: plan.schema ? structuredContract.providerEnforcedSchema : false,
      },
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
    const routeCompatibility = isRecord(payload.metadata?.routeModelCompatibility) ? payload.metadata!.routeModelCompatibility as Record<string, unknown> : {}
    const explicitRequestContract = typeof routeCompatibility.requestContract === 'string' ? routeCompatibility.requestContract : null
    const requestContract = explicitRequestContract === 'queries_documents' || explicitRequestContract === 'query_documents'
      ? explicitRequestContract
      : provider === 'deepinfra' && arrayStrings(routeCompatibility.supportedParameters).includes('queries')
        ? 'queries_documents'
        : 'query_documents'
    const result = await providerRerank({
      provider,
      apiKey: credential.apiKey,
      model: selectedModel,
      query: String(input.query),
      documents,
      topN: numberValue(input.topN),
      baseUrl: providerStatus.baseUrl || undefined,
      requestContract,
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
  if (capability === 'zero_shot_classification') return { system: `Classify the following text into exactly one of these labels: ${JSON.stringify(input.labels)}. Return only a JSON object with "label" (the selected label from the allowlist), "labels" (all candidate labels), and "scores" (confidence for each label, 0..1).`, prompt: String(input.text), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification }
  if (capability === 'token_classification') return { system: 'Identify all named entities in the following text. Return only a JSON object with "items" array. Each item must have "text" (the entity), "label" (entity type), "start" (character offset, integer >= 0), "end" (character offset, integer >= start), and "score" (confidence 0..1).', prompt: String(input.text), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.token_classification }
  if (capability === 'fill_mask') return { system: `Predict the [MASK] token in the following text. Return only a JSON object with "predictions" array containing exactly ${input.topK ?? 5} candidates. Each candidate must have "token" (the predicted word), "sequence" (the full text with mask filled), and "score" (confidence 0..1).`, prompt: String(input.text), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.fill_mask }
  if (capability === 'table_qa') return { system: 'Answer the question using only the provided table data. Return only a JSON object with "answer" (non-empty string), "cells" (array of relevant cell values), and "coordinates" (array of [row, col] pairs, zero-indexed, non-negative).', prompt: joinPrompt(input.question, JSON.stringify(input.table)), schema: DIRECT_PROVIDER_OUTPUT_SCHEMAS.table_qa }
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
  if (capability === 'zero_shot_classification') {
    const allowed = new Set(input.labels as string[])
    const items = arrayRecords(record.labels)
    if (!items.length) throw malformed(provider, 'zero_shot_classification returned no labels')
    for (const item of items) {
      if (!allowed.has(String(item.label))) throw malformed(provider, 'zero_shot_classification returned a label outside the allowlist')
      if (typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) throw malformed(provider, 'zero_score_classification returned a non-finite or out-of-range score')
    }
  }
  if (capability === 'token_classification') {
    const items = arrayRecords(record.items)
    if (!items.length) throw malformed(provider, 'token_classification returned no entities')
    for (const item of items) {
      if (!String(item.text ?? '').trim()) throw malformed(provider, 'token_classification returned an empty entity text')
      if (!String(item.label ?? '').trim()) throw malformed(provider, 'token_classification returned an empty entity label')
      if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || (item.start as number) < 0 || (item.end as number) < (item.start as number)) throw malformed(provider, 'token_classification returned invalid entity offsets')
      if (typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) throw malformed(provider, 'token_classification returned a non-finite or out-of-range score')
    }
  }
  if (capability === 'fill_mask') {
    const items = arrayRecords(record.predictions)
    if (!items.length) throw malformed(provider, 'fill_mask returned no predictions')
    for (const item of items) {
      if (!String(item.token ?? '').trim()) throw malformed(provider, 'fill_mask returned an empty token')
      if (!String(item.sequence ?? '').trim()) throw malformed(provider, 'fill_mask returned an empty sequence')
      if (typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) throw malformed(provider, 'fill_mask returned a non-finite or out-of-range score')
    }
  }
  if (capability === 'table_qa') {
    if (!String(record.answer ?? '').trim()) throw malformed(provider, 'table_qa returned an empty answer')
    const coords = Array.isArray(record.coordinates) ? record.coordinates : []
    for (const coord of coords) {
      if (!Array.isArray(coord) || coord.length < 2 || !Number.isInteger(coord[0]) || !Number.isInteger(coord[1]) || coord[0] < 0 || coord[1] < 0) throw malformed(provider, 'table_qa returned invalid coordinates')
    }
  }
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
function isUnsupportedResponseFormat(error: unknown): boolean {
  return /response[_ -]?format|json_schema|unsupported.*schema|unprocessable/i.test(error instanceof Error ? error.message : String(error))
}
