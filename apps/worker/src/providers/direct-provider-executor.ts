import {
  createCanonicalProviderUsage,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type ExecutorId,
  type ProviderKey,
} from '@amarktai/core'
import { ProviderConfigError, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { findCompletedArtifactByTraceId, getArtifactFile, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import {
  CanonicalProviderError,
  deepinfraTaskInference,
  groqChat,
  groqStt,
  groqTts,
  providerEmbeddings,
  providerRerank,
  type OpenAiTransportMessage,
} from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'
import { executeInternalTool, getInternalToolDefinitions } from '../tools/tool-registry.js'

type DirectHandler = (payload: WorkerJobData, selectedModel: string) => Promise<ProcessorResult>
type TextProvider = Extract<ProviderKey, 'groq' | 'deepinfra'>
type RetrievalProvider = Extract<ProviderKey, 'together' | 'deepinfra'>

export const DIRECT_EXECUTOR_HANDLERS: Partial<Record<ExecutorId, DirectHandler>> = {
  'groq.chat': executeGroqChat,
  'groq.text-transform': (payload, model) => executeValidatedTextCapability('groq', payload, model),
  'groq.tool-use': executeGroqToolUse,
  'groq.tts': executeGroqTts,
  'groq.stt': executeGroqStt,
  'deepinfra.chat': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.text-transform': (payload, model) => executeValidatedTextCapability('deepinfra', payload, model),
  'deepinfra.task-inference': executeDeepInfraTaskCapability,
  'deepinfra.embeddings': (payload, model) => executeEmbeddingsCapability('deepinfra', payload, model),
  'deepinfra.reranking': (payload, model) => executeRerankingCapability('deepinfra', payload, model),
  'together.embeddings': (payload, model) => executeEmbeddingsCapability('together', payload, model),
  'together.reranking': (payload, model) => executeRerankingCapability('together', payload, model),
}

async function executeGroqChat(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!)
  try {
    const credential = await resolveProviderApiKey('groq')
    const input = validation.data!
    const result = await groqChat({
      prompt: payload.prompt,
      apiKey: credential.apiKey,
      model: selectedModel,
      systemPrompt: stringValue(input.system),
      messages: chatMessages(input.messages),
      maxTokens: numberValue(input.maxOutputTokens),
      temperature: numberValue(input.temperature),
    })
    if (!result.content.trim()) throw malformed('groq', 'chat returned empty text')
    return success(result.content, 'groq', selectedModel, result.usage.promptTokens, result.usage.completionTokens, {
      finishReason: result.finishReason,
      outputValidation: { valid: true, contract: 'nonempty_chat_text' },
    })
  } catch (error) {
    return providerFailure('groq', selectedModel, error)
  }
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
      ? provider === 'deepinfra'
        ? { type: 'json_schema', json_schema: { name: `${capability}_output`, strict: true, schema: plan.schema } }
        : { type: 'json_object' }
      : undefined
    const result = provider === 'groq'
      ? await groqChat({
        prompt: plan.prompt,
        apiKey: credential.apiKey,
        model: selectedModel,
        systemPrompt: plan.system,
        messages: chatMessages(input.messages),
        maxTokens: numberValue(input.maxOutputTokens),
        temperature: numberValue(input.temperature) ?? 0,
        responseFormat,
        reasoningEffort: capability === 'reasoning' ? effortValue(input.effort) : undefined,
      })
      : await import('@amarktai/providers').then(({ deepinfraChat }) => deepinfraChat({
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

async function executeGroqToolUse(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, 'groq', selectedModel)
  const input = validation.data!
  const grant = readGrant(payload)
  if (!grant) return failure('Immutable AppCapabilityGrant snapshot is missing or invalid', 'groq', selectedModel)
  const allowedTools = input.allowedTools as string[]
  const tools = getInternalToolDefinitions(allowedTools)
  const maxIterations = Number(input.maxIterations ?? 3)
  const trace: Array<{ iteration: number; tool: string; callId: string; outcome: 'completed' | 'failed'; error?: string }> = []
  let inputTokens = 0
  let outputTokens = 0
  try {
    const credential = await resolveProviderApiKey('groq')
    const messages: OpenAiTransportMessage[] = [{ role: 'user', content: payload.prompt }]
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const result = await groqChat({
        prompt: '',
        apiKey: credential.apiKey,
        model: selectedModel,
        systemPrompt: 'Use only the registered tools supplied by the server. Do not invent tools. Return a final answer after tool results are available.',
        messages,
        tools,
        toolChoice: 'auto',
        temperature: 0,
      })
      inputTokens += result.usage.promptTokens
      outputTokens += result.usage.completionTokens
      if (result.toolCalls.length === 0) {
        if (!result.content.trim()) throw malformed('groq', 'tool loop ended without a final response')
        return success(JSON.stringify({ answer: result.content, toolCalls: trace }), 'groq', selectedModel, inputTokens, outputTokens, {
          toolTrace: trace,
          toolIterations: iteration,
          outputValidation: { valid: true, contract: 'registered_tool_loop_final_answer' },
        })
      }
      messages.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls })
      for (const call of result.toolCalls) {
        if (!allowedTools.includes(call.function.name)) throw new Error(`Tool '${call.function.name}' is not authorised for this request`)
        try {
          const toolResult = await executeInternalTool(call.function.name, call.function.arguments, { appSlug: payload.appSlug, grant })
          trace.push({ iteration, tool: call.function.name, callId: call.id, outcome: 'completed' })
          messages.push({ role: 'tool', content: JSON.stringify(toolResult), tool_call_id: call.id })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'tool execution failed'
          trace.push({ iteration, tool: call.function.name, callId: call.id, outcome: 'failed', error: message })
          messages.push({ role: 'tool', content: JSON.stringify({ error: message }), tool_call_id: call.id })
        }
      }
    }
    throw new Error(`Tool loop exceeded maxIterations=${maxIterations}`)
  } catch (error) {
    return providerFailure('groq', selectedModel, error, { toolTrace: trace })
  }
}

async function executeGroqTts(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, 'groq', selectedModel)
  const input = validation.data!
  const grant = readGrant(payload)
  if (!grant?.artifactWrite) return failure('AppCapabilityGrant denies artifact write for TTS', 'groq', selectedModel)
  try {
    const existing = await findCompletedArtifactByTraceId(payload.traceId, 'tts')
    if (existing) {
      const reused = reusedArtifact(existing, 'groq', selectedModel)
      if (reused) return reused
    }
    const credential = await resolveProviderApiKey('groq')
    const result = await groqTts({
      text: String(input.text),
      apiKey: credential.apiKey,
      model: selectedModel,
      voice: String(input.voice),
      speed: Number(input.speed),
      outputFormat: input.outputFormat as 'wav' | 'mp3' | 'flac' | 'ogg',
    })
    const duration = result.duration > 0 ? result.duration : Math.max(0.1, String(input.text).split(/\s+/).length / (2.5 * Number(input.speed)))
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'audio',
        subType: 'tts',
        title: `TTS audio for ${payload.appSlug}`,
        description: 'Groq speech synthesis output',
        provider: 'groq',
        model: selectedModel,
        traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability: 'tts', provider: 'groq', model: selectedModel, voice: result.voice,
          duration, durationSource: result.duration > 0 ? 'wav_header' : 'estimated_from_text',
          chunkCount: result.chunkCount, outputFormat: result.outputFormat,
        },
      },
      data: result.audioBuffer,
      explicitMimeType: result.mimeType,
    })
    return {
      success: true, status: 'completed', provider: 'groq', model: selectedModel, artifactId: artifact.id,
      output: JSON.stringify({ artifactId: artifact.id, artifactUrl: artifact.storageUrl, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, duration }),
      metadata: {
        artifactId: artifact.id, duration,
        usage: createCanonicalProviderUsage({ provider: 'groq', model: selectedModel, audioSeconds: duration }),
        outputValidation: { valid: true, contract: 'playable_audio_artifact' },
      },
    }
  } catch (error) {
    return providerFailure('groq', selectedModel, error)
  }
}

async function executeGroqStt(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const validation = validatedInput(payload)
  if (!validation.success) return failure(validation.error!, 'groq', selectedModel)
  const input = validation.data!
  const grant = readGrant(payload)
  if (!grant?.artifactRead) return failure('AppCapabilityGrant denies artifact read for STT', 'groq', selectedModel)
  try {
    const source = await getArtifactRecord(String(input.artifactId))
    if (!source || source.appSlug !== payload.appSlug) throw new CanonicalProviderError({ code: 'artifact_validation', provider: 'groq', message: 'STT source artifact was not found' })
    if (source.status !== 'completed' || (!source.mimeType.startsWith('audio/') && !source.mimeType.startsWith('video/'))) {
      throw new CanonicalProviderError({ code: 'artifact_validation', provider: 'groq', message: 'STT source must be a completed audio or video artifact' })
    }
    const file = await getArtifactFile(source.id)
    if (!file?.buffer.length) throw new CanonicalProviderError({ code: 'artifact_validation', provider: 'groq', message: 'STT source file is missing or empty' })
    const credential = await resolveProviderApiKey('groq')
    const result = await groqStt(file.buffer, file.filename, {
      apiKey: credential.apiKey,
      model: selectedModel,
      language: stringValue(input.language),
      timestamps: input.timestamps as 'none' | 'segment' | 'word' | 'both',
      translateToEnglish: input.translateToEnglish === true,
      mimeType: file.mimeType,
    })
    let artifactId: string | undefined
    if (input.persistTranscript !== false) {
      if (!grant.artifactWrite) return failure('AppCapabilityGrant denies transcript artifact write', 'groq', selectedModel)
      const artifact = await saveArtifact({
        input: {
          appSlug: payload.appSlug, type: 'transcript', subType: 'stt', title: `STT transcript for ${payload.appSlug}`,
          description: 'Groq speech transcription output', provider: 'groq', model: selectedModel, traceId: payload.traceId,
          mimeType: 'application/json', metadata: { capability: 'stt', sourceArtifactId: source.id, language: result.language, duration: result.duration },
        },
        data: Buffer.from(JSON.stringify({ text: result.text, language: result.language, duration: result.duration, segments: result.segments, words: result.words })),
        explicitMimeType: 'application/json',
      })
      artifactId = artifact.id
    }
    return {
      success: true, status: 'completed', provider: 'groq', model: selectedModel, artifactId,
      output: JSON.stringify({ transcript: result.text, language: result.language, duration: result.duration, segments: result.segments, words: result.words, artifactId: artifactId ?? null }),
      metadata: {
        sourceArtifactId: source.id, artifactId: artifactId ?? null,
        usage: createCanonicalProviderUsage({ provider: 'groq', model: selectedModel, audioSeconds: result.duration }),
        outputValidation: { valid: true, contract: 'nonempty_authorised_transcript' },
      },
    }
  } catch (error) {
    return providerFailure('groq', selectedModel, error)
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

function readGrant(payload: WorkerJobData): AppCapabilityGrantContext | null {
  const grant = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  return grant && typeof grant === 'object' && !Array.isArray(grant) ? grant as AppCapabilityGrantContext : null
}

function reusedArtifact(artifact: Awaited<ReturnType<typeof findCompletedArtifactByTraceId>> & {}, provider: ProviderKey, model: string): ProcessorResult | null {
  const artifactMetadata = parseJsonRecord(artifact.metadata)
  const duration = nullableFinite(artifactMetadata.duration)
  if (duration === null || duration <= 0) return null
  return {
    success: true, status: 'completed', provider, model, artifactId: artifact.id,
    output: JSON.stringify({ artifactId: artifact.id, artifactUrl: artifact.storageUrl, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, duration, reused: true }),
    metadata: { artifactId: artifact.id, duration, reused: true, usage: createCanonicalProviderUsage({ provider, model, audioSeconds: duration }), outputValidation: { valid: true, contract: 'reused_playable_audio_artifact' } },
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
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
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function effortValue(value: unknown): 'low' | 'medium' | 'high' | undefined { return value === 'low' || value === 'medium' || value === 'high' ? value : undefined }
function nullableFinite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }
