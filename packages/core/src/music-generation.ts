import { z } from 'zod'
import { DISCOVERED_PROVIDER_MODELS, MODEL_CATALOGUE } from './model-catalog.js'
import { ROUTING_MODES, type RoutingMode } from './brain-router.js'

export const MUSIC_STYLES = [
  'cinematic',
  'pop',
  'hip_hop',
  'electronic',
  'rock',
  'ambient',
  'jazz',
  'classical',
  'corporate',
  'custom',
] as const

export type MusicStyle = (typeof MUSIC_STYLES)[number]

export const MUSIC_DURATION_LIMITS = {
  minSeconds: 15,
  maxSeconds: 300,
  defaultSeconds: 60,
} as const

export type MusicDuration = number

export const MUSIC_OUTPUT_FORMATS = ['mp3', 'wav', 'flac', 'ogg'] as const
export type MusicOutputFormat = (typeof MUSIC_OUTPUT_FORMATS)[number]

export const MUSIC_SAFETY_LEVELS = ['standard', 'strict'] as const
export type MusicSafetyLevel = (typeof MUSIC_SAFETY_LEVELS)[number]

export const MusicGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  style: z.enum(MUSIC_STYLES).default('custom'),
  mood: z.string().max(120).optional(),
  genre: z.string().max(120).optional(),
  durationSeconds: z.number().int().min(MUSIC_DURATION_LIMITS.minSeconds).max(MUSIC_DURATION_LIMITS.maxSeconds).default(MUSIC_DURATION_LIMITS.defaultSeconds),
  instrumentalOnly: z.boolean().default(true),
  vocalsRequested: z.boolean().default(false),
  lyrics: z.string().max(8000).optional(),
  referenceAudioArtifactId: z.string().min(1).max(128).optional(),
  routingMode: z.enum(ROUTING_MODES).default('balanced'),
  safetyLevel: z.enum(MUSIC_SAFETY_LEVELS).default('standard'),
  outputFormat: z.enum(MUSIC_OUTPUT_FORMATS).default('mp3'),
})

export type MusicGenerationRequest = z.infer<typeof MusicGenerationRequestSchema>

export interface MusicPromptNormalization {
  prompt: string
  blocked: boolean
  transformed: boolean
  warnings: string[]
  blockedReason: string | null
}

export interface MusicCapabilityStatus {
  foundationReady: boolean
  schemaReady: boolean
  plannerReady: boolean
  providerClientExists: boolean
  clientImplemented: boolean
  modelCatalogueEntryExists: boolean
  workerExecutorExists: boolean
  executorRegistered: boolean
  artifactPersistenceReady: boolean
  artifactPathImplemented: boolean
  queuePathImplemented: boolean
  routeImplemented: boolean
  implementationReady: boolean
  catalogueKnown: boolean
  dashboardReady: boolean
  instrumentalReady: boolean
  vocalsReady: boolean
  lyricsReady: boolean
  configured: boolean
  policyAllowed: boolean
  infrastructureReady: boolean
  executableNow: boolean
  liveProven: boolean
  lastProofAt: string | null
  blockedReasons: string[]
  musicGenerationReady: boolean
  executionBlocked: boolean
  blockedReason: string
  discoveredMusicModels: number
  genxMusicModels: string[]
  togetherMusicModels: string[]
  deepinfraMusicModels: string[]
  groqMusicModels: string[]
  genxMusicCapabilityKnown: boolean
  lyriaClipDiscovered: boolean
  lyriaProDiscovered: boolean
  musicProviderCapabilityKnown: boolean
  musicExecutorReady: boolean
  endpointShapeKnown: boolean
  approvedProviderAudit: Array<{
    provider: 'genx' | 'groq' | 'together' | 'mimo' | 'deepinfra'
    musicClient: boolean
    executable: boolean
    note: string
  }>
}

export interface MusicCapabilityRuntimeState {
  configured?: boolean
  policyAllowed?: boolean
  infrastructureReady?: boolean
  liveProven?: boolean
  lastProofAt?: string | null
}

const MUSIC_IMPLEMENTATION_TRUTH = {
  providerClientExists: true,
  workerExecutorExists: true,
  queuePathImplemented: true,
  routeImplemented: true,
  artifactPersistenceReady: true,
  statusEndpointImplemented: true,
  authorisedArtifactDeliveryImplemented: true,
} as const

export interface MusicGenerationPlan {
  capability: 'music_generation'
  prompt: string
  normalizedPrompt: string
  style: MusicStyle
  mood: string | null
  genre: string | null
  durationSeconds: MusicDuration
  instrumentalOnly: boolean
  vocalsRequested: boolean
  lyricsProvided: boolean
  lyricsStatus: 'not_requested' | 'pending_provider_support' | 'blocked'
  vocalsStatus: 'not_requested' | 'pending_provider_support' | 'blocked'
  referenceAudioArtifactId: string | null
  routingMode: RoutingMode
  safetyLevel: MusicSafetyLevel
  outputFormat: MusicOutputFormat
  executionReady: boolean
  blockedReason: string
  warnings: string[]
}

export interface MusicGenerationResult {
  success: boolean
  status: 'planned' | 'blocked' | 'completed' | 'failed'
  plan?: MusicGenerationPlan
  artifactId?: string
  artifactUrl?: string
  provider?: string
  model?: string
  error?: string
  missingDependencies: string[]
}

const DIRECT_CLONE_PATTERNS = [
  /\bclone\b/i,
  /\bcopy\b/i,
  /\bsound\s+exactly\s+like\b/i,
  /\bin\s+the\s+voice\s+of\b/i,
  /\bimpersonate\b/i,
  /\bcover\s+of\b/i,
]

const ARTIST_STYLE_PATTERNS = [
  /\bin\s+the\s+style\s+of\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})/g,
  /\blike\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})/g,
]

export function validateMusicGenerationRequest(input: unknown): MusicGenerationRequest {
  const parsed = MusicGenerationRequestSchema.parse(input)
  if (parsed.lyrics?.trim() && parsed.instrumentalOnly) {
    throw new Error('Lyrics cannot be supplied when instrumentalOnly is true')
  }
  if (parsed.vocalsRequested && parsed.instrumentalOnly) {
    throw new Error('vocalsRequested cannot be true when instrumentalOnly is true')
  }
  return parsed
}

export function normalizeMusicPrompt(prompt: string): MusicPromptNormalization {
  const trimmed = prompt.trim().replace(/\s+/g, ' ')
  const warnings: string[] = []

  if (DIRECT_CLONE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      prompt: trimmed,
      blocked: true,
      transformed: false,
      warnings,
      blockedReason: 'Direct artist, song, voice, or copyrighted track cloning is not allowed.',
    }
  }

  let normalized = trimmed
  if (/\blatest\s+pop\s+songs?\b/i.test(normalized)) {
    normalized = normalized.replace(/\blatest\s+pop\s+songs?\b/gi, 'contemporary radio-pop-inspired production')
    warnings.push('Transformed latest-song wording into a non-copying contemporary style request.')
  }

  for (const pattern of ARTIST_STYLE_PATTERNS) {
    normalized = normalized.replace(pattern, 'in an original, non-copying style inspired by broad genre traits')
  }

  const transformed = normalized !== trimmed
  if (transformed && warnings.length === 0) {
    warnings.push('Transformed artist-style wording into a broad non-copying style request.')
  }

  return {
    prompt: normalized,
    blocked: false,
    transformed,
    warnings,
    blockedReason: null,
  }
}

export function getMusicCapabilityStatus(runtime: MusicCapabilityRuntimeState = {}): MusicCapabilityStatus {
  const modelCatalogueEntryExists = MODEL_CATALOGUE.some((model) => model.capabilities.includes('music_generation'))
  const musicModels = DISCOVERED_PROVIDER_MODELS.filter((model) => model.inferredCapabilities.includes('music_generation'))
  const genxMusicModels = musicModels.filter((model) => model.provider === 'genx')
  const genxMusicCapabilityKnown = genxMusicModels.length > 0

  const providerClientExists = MUSIC_IMPLEMENTATION_TRUTH.providerClientExists
  const workerExecutorExists = MUSIC_IMPLEMENTATION_TRUTH.workerExecutorExists
  const queuePathImplemented = MUSIC_IMPLEMENTATION_TRUTH.queuePathImplemented
  const routeImplemented = MUSIC_IMPLEMENTATION_TRUTH.routeImplemented
  const artifactPersistenceReady = MUSIC_IMPLEMENTATION_TRUTH.artifactPersistenceReady
  const implementationReady = providerClientExists
    && workerExecutorExists
    && queuePathImplemented
    && routeImplemented
    && artifactPersistenceReady
    && MUSIC_IMPLEMENTATION_TRUTH.statusEndpointImplemented
    && MUSIC_IMPLEMENTATION_TRUTH.authorisedArtifactDeliveryImplemented
  const configured = runtime.configured ?? Boolean(process.env.GENX_API_KEY)
  const policyAllowed = runtime.policyAllowed ?? true
  const infrastructureReady = runtime.infrastructureReady ?? true
  const liveProven = runtime.liveProven ?? false
  const lastProofAt = runtime.lastProofAt ?? null
  const executableNow = implementationReady && configured && policyAllowed && infrastructureReady
  const musicGenerationReady = executableNow

  const blockedReasons: string[] = []
  if (!providerClientExists) blockedReasons.push('provider_client_missing')
  if (!workerExecutorExists) blockedReasons.push('worker_executor_missing')
  if (!queuePathImplemented) blockedReasons.push('queue_path_missing')
  if (!routeImplemented) blockedReasons.push('route_missing')
  if (!artifactPersistenceReady) blockedReasons.push('artifact_path_missing')
  if (!infrastructureReady) blockedReasons.push('infrastructure_not_ready')
  if (!configured) blockedReasons.push('genx_api_key_not_configured')
  if (!policyAllowed) blockedReasons.push('policy_not_allowed')
  const blockedReason = blockedReasons.length > 0
    ? `Music execution blocked: ${blockedReasons.join(', ')}.`
    : liveProven
      ? 'Music execution is ready and live proof exists.'
      : 'Music execution is ready for first live proof; live proof is still pending.'

  return {
    foundationReady: true,
    schemaReady: true,
    plannerReady: true,
    providerClientExists,
    clientImplemented: providerClientExists,
    modelCatalogueEntryExists,
    workerExecutorExists,
    executorRegistered: workerExecutorExists,
    artifactPersistenceReady,
    artifactPathImplemented: artifactPersistenceReady,
    queuePathImplemented,
    routeImplemented,
    implementationReady,
    catalogueKnown: genxMusicCapabilityKnown,
    dashboardReady: true,
    instrumentalReady: true,
    vocalsReady: false,
    lyricsReady: false,
    configured,
    policyAllowed,
    infrastructureReady,
    executableNow,
    liveProven,
    lastProofAt,
    blockedReasons,
    musicGenerationReady,
    executionBlocked: !executableNow,
    blockedReason,
    discoveredMusicModels: musicModels.length,
    genxMusicModels: genxMusicModels.map((model) => model.modelId),
    togetherMusicModels: musicModels.filter((model) => model.provider === 'together').map((model) => model.modelId),
    deepinfraMusicModels: musicModels.filter((model) => model.provider === 'deepinfra').map((model) => model.modelId),
    groqMusicModels: musicModels.filter((model) => model.provider === 'groq').map((model) => model.modelId),
    genxMusicCapabilityKnown,
    lyriaClipDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-clip-preview'),
    lyriaProDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-pro-preview'),
    musicProviderCapabilityKnown: musicModels.length > 0,
    musicExecutorReady: musicModels.some((model) => model.workerExecutorExists && model.providerClientExists && model.artifactPersistenceExists),
    endpointShapeKnown: musicModels.some((model) => model.endpointShapeKnown),
    approvedProviderAudit: [
      { provider: 'genx', musicClient: providerClientExists, executable: executableNow, note: providerClientExists ? 'GenX music client implemented with submit/poll/download. Runtime execution still requires configuration and queue/infrastructure gates.' : 'GenX music client not yet implemented.' },
      { provider: 'groq', musicClient: false, executable: false, note: 'Groq chat/TTS/STT clients exist; no music generation client.' },
      { provider: 'together', musicClient: false, executable: false, note: 'Together image client exists; no music generation client.' },
      { provider: 'mimo', musicClient: false, executable: false, note: 'MiMo remains coding_tools_only and is never runtime-selected.' },
      { provider: 'deepinfra', musicClient: false, executable: false, note: 'DeepInfra chat client exists; no music generation client.' },
    ],
  }
}

export function createMusicGenerationPlan(input: MusicGenerationRequest): MusicGenerationPlan {
  const normalized = normalizeMusicPrompt(input.prompt)
  const status = getMusicCapabilityStatus()
  const lyricsRequested = Boolean(input.lyrics?.trim())
  const vocalsRequested = input.vocalsRequested || lyricsRequested
  const warnings = [...normalized.warnings]

  if (vocalsRequested) {
    warnings.push('Vocals and lyrics remain pending until an approved provider music endpoint is wired.')
  }

  return {
    capability: 'music_generation',
    prompt: input.prompt,
    normalizedPrompt: normalized.prompt,
    style: input.style,
    mood: input.mood ?? null,
    genre: input.genre ?? null,
    durationSeconds: input.durationSeconds,
    instrumentalOnly: input.instrumentalOnly,
    vocalsRequested,
    lyricsProvided: lyricsRequested,
    lyricsStatus: normalized.blocked ? 'blocked' : lyricsRequested ? 'pending_provider_support' : 'not_requested',
    vocalsStatus: normalized.blocked ? 'blocked' : vocalsRequested ? 'pending_provider_support' : 'not_requested',
    referenceAudioArtifactId: input.referenceAudioArtifactId ?? null,
    routingMode: input.routingMode,
    safetyLevel: input.safetyLevel,
    outputFormat: input.outputFormat,
    executionReady: status.executableNow && !normalized.blocked,
    blockedReason: normalized.blocked ? normalized.blockedReason ?? status.blockedReason : status.blockedReason,
    warnings,
  }
}
