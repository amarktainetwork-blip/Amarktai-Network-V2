import { z } from 'zod'
import type { CapabilityKey } from './capabilities.js'
import type { ProviderKey } from './providers.js'

export const DIRECT_PROVIDER_CAPABILITIES = [
  'chat',
  'streaming_chat',
  'reasoning',
  'code',
  'summarization',
  'translation',
  'question_answering',
  'classification',
  'zero_shot_classification',
  'extraction',
  'token_classification',
  'fill_mask',
  'feature_extraction',
  'sentence_similarity',
  'table_qa',
  'structured_output',
  'tts',
  'stt',
  'embeddings',
  'reranking',
  'image_generation',
  'video_generation',
  'image_to_video',
  'video_to_video',
  'music_generation',
] as const satisfies readonly CapabilityKey[]

export type DirectProviderCapability = (typeof DIRECT_PROVIDER_CAPABILITIES)[number]

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1).max(100_000),
  toolCallId: z.string().min(1).optional(),
})

const JsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown()).superRefine((schema, context) => {
  for (const issue of validateJsonSchemaDefinition(schema)) {
    context.addIssue({ code: 'custom', message: issue })
  }
})
const NonEmptyStringArraySchema = z.array(z.string().trim().min(1)).min(1).max(512)
const DocumentSchema = z.union([
  z.string().trim().min(1),
  z.object({ id: z.string().min(1).optional(), text: z.string().trim().min(1) }),
])

export const DIRECT_PROVIDER_REQUEST_SCHEMAS: Record<DirectProviderCapability, z.ZodType> = {
  chat: z.object({
    system: z.string().max(20_000).optional(),
    messages: z.array(ChatMessageSchema).max(256).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(32_768).optional(),
  }),
  streaming_chat: z.object({
    system: z.string().max(20_000).optional(),
    messages: z.array(ChatMessageSchema).max(256).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(32_768).optional(),
  }),
  reasoning: z.object({
    context: z.string().max(100_000).optional(),
    constraints: z.array(z.string().min(1)).max(50).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
  }),
  code: z.object({
    language: z.string().trim().min(1).max(100),
    task: z.string().trim().min(1).max(100_000).optional(),
    existingCode: z.string().max(200_000).optional(),
    context: z.string().max(100_000).optional(),
    outputFormat: z.enum(['code', 'patch', 'explanation_with_code']).default('code'),
  }),
  summarization: z.object({
    sourceText: z.string().trim().min(1).max(500_000),
    desiredLength: z.enum(['brief', 'medium', 'detailed']).default('medium'),
    format: z.enum(['paragraph', 'bullets', 'outline']).default('paragraph'),
    includeKeyPoints: z.boolean().default(false),
  }),
  translation: z.object({
    sourceText: z.string().trim().min(1).max(200_000),
    sourceLanguage: z.string().trim().min(1).max(100).optional(),
    targetLanguage: z.string().trim().min(1).max(100),
    preserveTone: z.boolean().default(true),
  }),
  question_answering: z.object({
    question: z.string().trim().min(1).max(20_000).optional(),
    context: z.string().trim().min(1).max(500_000),
    sourceIds: z.array(z.string().min(1)).max(1_000).optional(),
  }),
  classification: z.object({
    text: z.string().trim().min(1).max(100_000),
    labels: NonEmptyStringArraySchema,
    multiLabel: z.boolean().default(false),
  }),
  zero_shot_classification: z.object({
    text: z.string().trim().min(1).max(100_000),
    labels: NonEmptyStringArraySchema,
    multiLabel: z.boolean().default(false),
  }),
  extraction: z.object({
    sourceText: z.string().trim().min(1).max(500_000),
    schema: JsonSchemaSchema,
  }),
  token_classification: z.object({
    text: z.string().trim().min(1).max(100_000),
  }),
  fill_mask: z.object({
    text: z.string().trim().min(1).max(100_000).refine((value) => value.includes('[MASK]'), 'text must contain [MASK]'),
    topK: z.number().int().min(1).max(20).default(5),
  }),
  feature_extraction: z.object({
    text: z.union([z.string().trim().min(1), NonEmptyStringArraySchema]),
    normalize: z.boolean().optional(),
  }),
  sentence_similarity: z.object({
    sourceSentence: z.string().trim().min(1).max(100_000),
    comparisonSentences: NonEmptyStringArraySchema,
  }),
  table_qa: z.object({
    question: z.string().trim().min(1).max(20_000).optional(),
    table: z.record(z.string(), z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).min(1)),
  }),
  structured_output: z.object({
    schema: JsonSchemaSchema,
    context: z.string().max(100_000).optional(),
  }),
  tts: z.object({
    text: z.string().trim().min(1).max(50_000).optional(),
    voice: z.string().trim().min(1).max(100).default('tara'),
    speed: z.number().min(0.5).max(5).default(1),
    outputFormat: z.enum(['wav', 'mp3', 'flac', 'ogg']).default('wav'),
    language: z.string().trim().min(2).max(20).optional(),
    style: z.string().trim().min(1).max(200).optional(),
  }),
  stt: z.object({
    artifactId: z.string().uuid(),
    language: z.string().trim().min(2).max(20).optional(),
    timestamps: z.enum(['none', 'segment', 'word', 'both']).default('segment'),
    translateToEnglish: z.boolean().default(false),
    persistTranscript: z.boolean().default(true),
  }),
  embeddings: z.object({
    texts: NonEmptyStringArraySchema,
    dimensions: z.number().int().min(1).max(65_536).optional(),
    normalize: z.boolean().optional(),
  }),
  reranking: z.object({
    query: z.string().trim().min(1).max(20_000),
    documents: z.array(DocumentSchema).min(1).max(1_000),
    topN: z.number().int().min(1).max(1_000).optional(),
  }).superRefine((value, context) => {
    if (value.topN !== undefined && value.topN > value.documents.length) {
      context.addIssue({ code: 'custom', path: ['topN'], message: 'topN cannot exceed the number of documents' })
    }
  }),
  image_generation: z.object({
    width: z.number().int().min(64).max(2_048).optional(),
    height: z.number().int().min(64).max(2_048).optional(),
    steps: z.number().int().min(1).max(100).optional(),
    seed: z.number().int().optional(),
    negativePrompt: z.string().max(10_000).optional(),
  }),
  video_generation: z.object({
    duration: z.number().min(1).max(60).optional(),
    aspectRatio: z.string().max(20).optional(),
    style: z.string().max(200).optional(),
  }),
  image_to_video: z.object({
    sourceImageArtifactId: z.string().uuid().optional(),
    sourceImage: z.string().uuid().optional(),
    duration: z.number().min(1).max(60).optional(),
    width: z.number().int().min(64).max(2_048).optional(),
    height: z.number().int().min(64).max(2_048).optional(),
  }).refine((value) => Boolean(value.sourceImageArtifactId || value.sourceImage), 'source image artifact is required'),
  video_to_video: z.object({
    sourceVideoArtifactId: z.string().uuid().optional(),
    sourceVideo: z.string().uuid().optional(),
    duration: z.number().min(1).max(60).optional(),
    width: z.number().int().min(64).max(2_048).optional(),
    height: z.number().int().min(64).max(2_048).optional(),
  }).refine((value) => Boolean(value.sourceVideoArtifactId || value.sourceVideo), 'source video artifact is required'),
  music_generation: z.object({
    duration: z.number().min(1).max(300).optional(),
    style: z.string().max(200).optional(),
    instrumentalOnly: z.literal(true).optional(),
    vocalsRequested: z.literal(false).optional(),
  }),
}

const outputObject = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({ type: 'object', properties, required, additionalProperties: true })
const nonemptyText = { type: 'string', minLength: 1 }
const finiteNumberSchema = { type: 'number' }
const artifactOutput = (
  extra: Record<string, unknown> = {},
  requiredExtra: string[] = [],
) => outputObject({
  artifactId: nonemptyText,
  artifactUrl: nonemptyText,
  mimeType: nonemptyText,
  fileSizeBytes: { type: 'integer', minimum: 1 },
  ...extra,
}, ['artifactId', 'mimeType', 'fileSizeBytes', ...requiredExtra])

/** Canonical output shapes used by handlers and strict static/live proof. */
export const DIRECT_PROVIDER_OUTPUT_SCHEMAS: Record<DirectProviderCapability, Record<string, unknown>> = {
  chat: nonemptyText,
  streaming_chat: outputObject({ content: nonemptyText, chunks: { type: 'integer', minimum: 2 } }, ['content', 'chunks']),
  reasoning: outputObject({ answer: nonemptyText, rationale: nonemptyText }, ['answer', 'rationale']),
  code: outputObject({ code: nonemptyText, language: nonemptyText }, ['code', 'language']),
  summarization: outputObject({ summary: nonemptyText, keyPoints: { type: 'array', items: nonemptyText } }, ['summary']),
  translation: outputObject({ translation: nonemptyText }, ['translation']),
  question_answering: outputObject({ answer: nonemptyText, supportedByContext: { type: 'boolean' }, sourceIds: { type: 'array', items: nonemptyText } }, ['answer', 'supportedByContext']),
  classification: outputObject({ labels: { type: 'array', minItems: 1, items: outputObject({ label: nonemptyText, score: { type: 'number', minimum: 0, maximum: 1 } }, ['label']) } }, ['labels']),
  zero_shot_classification: outputObject({ labels: { type: 'array', minItems: 1, items: outputObject({ label: nonemptyText, score: { type: 'number', minimum: 0, maximum: 1 } }, ['label', 'score']) } }, ['labels']),
  extraction: { type: 'object' },
  token_classification: outputObject({ items: { type: 'array', minItems: 1, items: outputObject({ text: nonemptyText, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 }, label: nonemptyText, score: finiteNumberSchema }, ['text', 'start', 'end', 'label', 'score']) } }, ['items']),
  fill_mask: outputObject({ predictions: { type: 'array', minItems: 1, items: outputObject({ token: nonemptyText, sequence: nonemptyText, score: finiteNumberSchema }, ['token', 'sequence', 'score']) } }, ['predictions']),
  feature_extraction: outputObject({ features: { type: 'array', minItems: 1, items: { type: 'array', minItems: 1, items: finiteNumberSchema } }, dimensions: { type: 'integer', minimum: 1 } }, ['features', 'dimensions']),
  sentence_similarity: outputObject({ scores: { type: 'array', minItems: 1, items: outputObject({ index: { type: 'integer', minimum: 0 }, score: { type: 'number', minimum: -1, maximum: 1 } }, ['index', 'score']) } }, ['scores']),
  table_qa: outputObject({ answer: nonemptyText, coordinates: { type: 'array' }, cells: { type: 'array' } }, ['answer']),
  structured_output: { type: 'object' },
  tts: artifactOutput({ duration: { type: 'number', exclusiveMinimum: 0 } }, ['duration']),
  stt: outputObject({ transcript: nonemptyText, language: nonemptyText, duration: { type: 'number', minimum: 0 }, artifactId: { anyOf: [nonemptyText, { type: 'null' }] } }, ['transcript', 'duration']),
  embeddings: outputObject({ vectors: { type: 'array', minItems: 1, items: { type: 'array', minItems: 1, items: finiteNumberSchema } }, dimensions: { type: 'integer', minimum: 1 }, count: { type: 'integer', minimum: 1 } }, ['vectors', 'dimensions', 'count']),
  reranking: outputObject({ results: { type: 'array', minItems: 1, items: outputObject({ index: { type: 'integer', minimum: 0 }, score: finiteNumberSchema }, ['index', 'score']) } }, ['results']),
  image_generation: artifactOutput({ width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } }, ['width', 'height']),
  video_generation: artifactOutput({ width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, duration: { type: 'number', exclusiveMinimum: 0 } }, ['width', 'height', 'duration']),
  image_to_video: artifactOutput({ width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, duration: { type: 'number', exclusiveMinimum: 0 } }, ['width', 'height', 'duration']),
  video_to_video: artifactOutput({ width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, duration: { type: 'number', exclusiveMinimum: 0 } }, ['width', 'height', 'duration']),
  music_generation: artifactOutput({ duration: { type: 'number', exclusiveMinimum: 0 } }, ['duration']),
}

export interface DirectProviderRequestValidation {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  issues?: Array<{ path: string; message: string }>
}

export function isDirectProviderCapability(capability: string): capability is DirectProviderCapability {
  return (DIRECT_PROVIDER_CAPABILITIES as readonly string[]).includes(capability)
}

export function validateDirectProviderRequest(
  capability: string,
  prompt: string,
  input: Record<string, unknown>,
): DirectProviderRequestValidation {
  if (!isDirectProviderCapability(capability)) return { success: true, data: input }

  const request = { ...input }
  if (capability === 'summarization' && request.sourceText === undefined) request.sourceText = prompt
  if (capability === 'translation' && request.sourceText === undefined) request.sourceText = prompt
  if (capability === 'classification' && request.text === undefined) request.text = prompt
  if (capability === 'zero_shot_classification' && request.text === undefined) request.text = prompt
  if (capability === 'extraction' && request.sourceText === undefined) request.sourceText = prompt
  if (capability === 'token_classification' && request.text === undefined) request.text = prompt
  if (capability === 'fill_mask' && request.text === undefined) request.text = prompt
  if (capability === 'feature_extraction' && request.text === undefined) request.text = prompt
  if (capability === 'question_answering' && request.question === undefined) request.question = prompt
  if (capability === 'table_qa' && request.question === undefined) request.question = prompt
  if (capability === 'tts' && request.text === undefined) request.text = prompt
  if (capability === 'code' && request.task === undefined) request.task = prompt

  const parsed = DIRECT_PROVIDER_REQUEST_SCHEMAS[capability].safeParse(request)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return {
      success: false,
      error: `Invalid ${capability} request: ${issues.map((issue) => `${issue.path || 'input'} ${issue.message}`).join('; ')}`,
      issues,
    }
  }

  return { success: true, data: parsed.data as Record<string, unknown> }
}

export interface CanonicalProviderUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  audioSeconds: number
  imageCount: number
  videoSeconds: number
  providerReportedCost: number | null
  estimatedCost: number | null
  estimated: boolean
  currency: string | null
  provider: ProviderKey
  model: string
}

export function createCanonicalProviderUsage(input: {
  provider: ProviderKey
  model: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  audioSeconds?: number
  imageCount?: number
  videoSeconds?: number
  providerReportedCost?: number | null
  estimatedCost?: number | null
  currency?: string | null
}): CanonicalProviderUsage {
  const inputTokens = finiteNonNegative(input.inputTokens)
  const outputTokens = finiteNonNegative(input.outputTokens)
  const totalTokens = finiteNonNegative(input.totalTokens) || inputTokens + outputTokens
  const providerReportedCost = finiteNullable(input.providerReportedCost)
  const estimatedCost = finiteNullable(input.estimatedCost)
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    audioSeconds: finiteNonNegative(input.audioSeconds),
    imageCount: finiteNonNegative(input.imageCount),
    videoSeconds: finiteNonNegative(input.videoSeconds),
    providerReportedCost,
    estimatedCost,
    estimated: providerReportedCost === null && estimatedCost !== null,
    currency: input.currency ?? null,
    provider: input.provider,
    model: input.model,
  }
}

function finiteNonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function finiteNullable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export interface JsonSchemaValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates the bounded JSON-Schema subset accepted by direct provider jobs.
 * Unsupported keywords fail closed instead of silently weakening validation.
 */
export function validateJsonSchemaValue(
  value: unknown,
  schema: Record<string, unknown>,
  path = '$',
): JsonSchemaValidationResult {
  const errors: string[] = []
  validateSchemaNode(value, schema, path, errors)
  return { valid: errors.length === 0, errors }
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  '$schema', '$id', 'title', 'description', 'type', 'enum', 'const', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'anyOf', 'oneOf', 'allOf', 'nullable',
])

function validateJsonSchemaDefinition(schema: Record<string, unknown>, path = '$'): string[] {
  const errors: string[] = []
  const unsupported = Object.keys(schema).filter((key) => !SUPPORTED_SCHEMA_KEYS.has(key))
  if (unsupported.length > 0) errors.push(`${path}: unsupported schema keyword(s): ${unsupported.join(', ')}`)
  const type = schema.type
  const allowedTypes = new Set(['null', 'array', 'object', 'integer', 'number', 'string', 'boolean'])
  const types = typeof type === 'string' ? [type] : Array.isArray(type) ? type : []
  if (types.some((item) => typeof item !== 'string' || !allowedTypes.has(item))) errors.push(`${path}: invalid JSON Schema type`)
  if (typeof schema.pattern === 'string') {
    try { new RegExp(schema.pattern) } catch { errors.push(`${path}: invalid schema pattern`) }
  }
  if (isRecord(schema.properties)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!isRecord(child)) errors.push(`${path}.properties.${key}: schema must be an object`)
      else errors.push(...validateJsonSchemaDefinition(child, `${path}.properties.${key}`))
    }
  }
  if (isRecord(schema.items)) errors.push(...validateJsonSchemaDefinition(schema.items, `${path}.items`))
  if (isRecord(schema.additionalProperties)) errors.push(...validateJsonSchemaDefinition(schema.additionalProperties, `${path}.additionalProperties`))
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const children = schema[keyword]
    if (children === undefined) continue
    if (!Array.isArray(children) || children.length === 0 || children.some((child) => !isRecord(child))) {
      errors.push(`${path}.${keyword}: must be a nonempty array of schemas`)
      continue
    }
    children.forEach((child, index) => errors.push(...validateJsonSchemaDefinition(child as Record<string, unknown>, `${path}.${keyword}[${index}]`)))
  }
  return errors
}

function validateSchemaNode(value: unknown, schema: Record<string, unknown>, path: string, errors: string[]): void {
  const unsupported = Object.keys(schema).filter((key) => !SUPPORTED_SCHEMA_KEYS.has(key))
  if (unsupported.length > 0) {
    errors.push(`${path}: unsupported schema keyword(s): ${unsupported.join(', ')}`)
    return
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) if (isRecord(child)) validateSchemaNode(value, child, path, errors)
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter(isRecord).filter((child) => validateJsonSchemaValue(value, child, path).valid)
    if (matches.length === 0) errors.push(`${path}: value does not match anyOf`)
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(isRecord).filter((child) => validateJsonSchemaValue(value, child, path).valid)
    if (matches.length !== 1) errors.push(`${path}: value must match exactly one oneOf schema`)
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    errors.push(`${path}: value is not in enum`)
  }
  if ('const' in schema && !deepEqual(schema.const, value)) errors.push(`${path}: value does not match const`)

  const nullable = schema.nullable === true
  if (value === null && nullable) return
  const types = typeof schema.type === 'string' ? [schema.type] : Array.isArray(schema.type) ? schema.type : []
  if (types.length > 0 && !types.some((type) => matchesJsonType(value, String(type)))) {
    errors.push(`${path}: expected ${types.join('|')}`)
    return
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`)
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`)
      } catch {
        errors.push(`${path}: invalid schema pattern`)
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: below minimum`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: above maximum`)
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) errors.push(`${path}: not above exclusiveMinimum`)
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) errors.push(`${path}: not below exclusiveMaximum`)
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`)
    if (isRecord(schema.items)) value.forEach((item, index) => validateSchemaNode(item, schema.items as Record<string, unknown>, `${path}[${index}]`, errors))
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []
    for (const key of required) if (!(key in value)) errors.push(`${path}.${key}: required property missing`)
    for (const [key, childValue] of Object.entries(value)) {
      const childSchema = properties[key]
      if (isRecord(childSchema)) validateSchemaNode(childValue, childSchema, `${path}.${key}`, errors)
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: additional property not allowed`)
      else if (isRecord(schema.additionalProperties)) validateSchemaNode(childValue, schema.additionalProperties, `${path}.${key}`, errors)
    }
  }
}

function matchesJsonType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isRecord(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
