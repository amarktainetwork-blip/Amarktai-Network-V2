import { z } from 'zod'
import { DISCOVERED_PROVIDER_MODELS } from './model-catalog.js'
import { ORCHESTRA_ROUTING_MODES, type OrchestraRoutingMode } from './orchestra.js'
import { APPROVED_PROVIDER_DEFINITIONS, type ProviderKey } from './providers.js'
import { getRuntimeTruth } from './runtime-truth.js'

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

export const MUSIC_RIGHTS_BASES = ['own', 'permission', 'license', 'public_domain'] as const
export type MusicRightsBasis = (typeof MUSIC_RIGHTS_BASES)[number]

export const MUSIC_FEATURE_CLASSIFICATIONS = [
  'PROVEN_SUPPORTED',
  'INTERNAL_DERIVED_PROMPT_ONLY',
  'UNSUPPORTED',
  'UNPROVEN',
] as const
export type MusicFeatureClassification = (typeof MUSIC_FEATURE_CLASSIFICATIONS)[number]

export const GENX_LYRIA_REQUEST_CONTRACT: Record<string, MusicFeatureClassification> = {
  prompt: 'PROVEN_SUPPORTED',
  model: 'PROVEN_SUPPORTED',
  duration: 'INTERNAL_DERIVED_PROMPT_ONLY',
  instrumental: 'INTERNAL_DERIVED_PROMPT_ONLY',
  vocals: 'UNPROVEN',
  lyrics: 'UNPROVEN',
  genre: 'INTERNAL_DERIVED_PROMPT_ONLY',
  mood: 'INTERNAL_DERIVED_PROMPT_ONLY',
  tempoBpm: 'INTERNAL_DERIVED_PROMPT_ONLY',
  arrangement: 'INTERNAL_DERIVED_PROMPT_ONLY',
  negativePrompt: 'UNPROVEN',
  outputFormat: 'UNPROVEN',
  referenceAudio: 'UNPROVEN',
} as const

export const MAX_REFERENCE_AUDIO_BYTES = 25 * 1024 * 1024
export const MAX_REFERENCE_AUDIO_DURATION_SECONDS = 300

export const MusicGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  style: z.enum(MUSIC_STYLES).default('custom'),
  mood: z.string().max(120).optional(),
  genre: z.string().max(120).optional(),
  tempo: z.string().max(80).optional(),
  bpm: z.number().int().min(40).max(220).optional(),
  arrangement: z.array(z.string().min(1).max(80)).max(12).optional(),
  durationSeconds: z.number().int().min(MUSIC_DURATION_LIMITS.minSeconds).max(MUSIC_DURATION_LIMITS.maxSeconds).default(MUSIC_DURATION_LIMITS.defaultSeconds),
  instrumentalOnly: z.boolean().default(true),
  vocalsRequested: z.boolean().default(false),
  lyrics: z.string().max(8000).optional(),
  referenceAudioArtifactId: z.string().min(1).max(128).optional(),
  routingMode: z.enum(ORCHESTRA_ROUTING_MODES).default('balanced'),
  safetyLevel: z.enum(MUSIC_SAFETY_LEVELS).default('standard'),
  outputFormat: z.enum(MUSIC_OUTPUT_FORMATS).default('mp3'),
})

export type MusicGenerationRequest = z.infer<typeof MusicGenerationRequestSchema>

export const MusicReferenceRightsDeclarationSchema = z.object({
  accepted: z.boolean(),
  basis: z.enum(MUSIC_RIGHTS_BASES),
  statement: z.string().min(8).max(1000),
})

export const MusicReferenceUploadRequestSchema = z.object({
  appSlug: z.string().min(1).max(120).default('admin-music'),
  filename: z.string().min(1).max(180).default('reference-audio'),
  mimeType: z.string().min(1).max(120),
  durationSeconds: z.number().min(0).max(MAX_REFERENCE_AUDIO_DURATION_SECONDS).optional(),
  rights: MusicReferenceRightsDeclarationSchema,
})

export type MusicReferenceUploadRequest = z.infer<typeof MusicReferenceUploadRequestSchema>

export interface MusicInspirationProfile {
  sourceArtifactId: string
  durationSeconds: number | null
  approximateBpm: number | null
  loudness: 'quiet' | 'moderate' | 'loud'
  energy: 'low' | 'medium' | 'high'
  instrumentalVocalLikelihood: 'unknown'
  descriptors: string[]
  copyAvoidance: string[]
}

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
  durationControlReady: boolean
  genreControlReady: boolean
  moodControlReady: boolean
  tempoControlReady: boolean
  arrangementControlReady: boolean
  referenceAudioAnalysisReady: boolean
  referenceAudioConditioningReady: boolean
  outputFormatControlReady: boolean
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
    provider: ProviderKey
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
  routingMode: OrchestraRoutingMode
  safetyLevel: MusicSafetyLevel
  outputFormat: MusicOutputFormat
  tempo: string | null
  bpm: number | null
  arrangement: string[]
  providerPrompt: string
  nativeProviderFields: string[]
  derivedPromptOnlyFields: string[]
  unsupportedFields: string[]
  referenceAudioAnalysisMode: 'none' | 'inspiration_profile'
  referenceAudioConditioningReady: boolean
  executionReady: boolean
  blockedReason: string
  blockedReasons: string[]
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

export function validateMusicReferenceUploadRequest(input: unknown): MusicReferenceUploadRequest {
  const parsed = MusicReferenceUploadRequestSchema.parse(input)
  if (!parsed.rights.accepted) {
    throw new Error('Reference audio rights declaration is required')
  }
  if (!parsed.mimeType.startsWith('audio/')) {
    throw new Error('Reference audio must use an audio MIME type')
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
  const musicModels = DISCOVERED_PROVIDER_MODELS.filter((model) => model.inferredCapabilities.includes('music_generation'))
  const genxMusicModels = musicModels.filter((model) => model.provider === 'genx')
  const genxMusicCapabilityKnown = genxMusicModels.length > 0
  const configured = runtime.configured ?? Boolean(process.env.GENX_API_KEY)
  const policyAllowed = runtime.policyAllowed ?? true
  const infrastructureReady = runtime.infrastructureReady === true
  const liveProven = runtime.liveProven ?? false
  const lastProofAt = runtime.lastProofAt ?? null
  const canonicalTruth = getRuntimeTruth({
    providers: {
      genx: {
        enabled: configured,
        runtimeEnabled: configured,
        configured,
      },
    },
    capabilities: {
      music_generation: {
        infrastructureReady,
        policyAllowed,
        liveProven,
        lastProofAt,
      },
    },
  })
  const canonical = canonicalTruth.capabilities.find((capability) => capability.capability === 'music_generation')!
  const providerClientExists = canonical.clientImplemented
  const workerExecutorExists = canonical.executorRegistered
  const queuePathImplemented = canonical.queuePathImplemented
  const routeImplemented = canonical.routeImplemented
  const artifactPersistenceReady = canonical.artifactPathImplemented
  const implementationReady = canonical.implementationReady
  const executableNow = canonical.executableNow
  const musicGenerationReady = executableNow

  const blockedReasons = canonical.blockedReasons.filter((reason) => reason !== 'live_proof_missing')
  const blockedReason = blockedReasons.length > 0
    ? `Music execution blocked: ${blockedReasons.join(', ')}.`
    : canonical.liveProven
      ? 'Music execution is ready and live proof exists.'
      : 'Music execution is ready for first live proof; live proof is still pending.'

  return {
    foundationReady: Boolean(MusicGenerationRequestSchema) && typeof createMusicGenerationPlan === 'function',
    schemaReady: Boolean(MusicGenerationRequestSchema),
    plannerReady: typeof createMusicGenerationPlan === 'function',
    providerClientExists,
    clientImplemented: providerClientExists,
    modelCatalogueEntryExists: canonical.discoveredModelCount > 0,
    workerExecutorExists,
    executorRegistered: workerExecutorExists,
    artifactPersistenceReady,
    artifactPathImplemented: artifactPersistenceReady,
    queuePathImplemented,
    routeImplemented,
    implementationReady,
    catalogueKnown: canonical.catalogueKnown,
    dashboardReady: Boolean(canonical),
    instrumentalReady: true,
    vocalsReady: genxMusicCapabilityKnown,
    lyricsReady: genxMusicCapabilityKnown,
    durationControlReady: false,
    genreControlReady: false,
    moodControlReady: false,
    tempoControlReady: false,
    arrangementControlReady: false,
    referenceAudioAnalysisReady: true,
    referenceAudioConditioningReady: false,
    outputFormatControlReady: false,
    configured,
    policyAllowed,
    infrastructureReady,
    executableNow,
    liveProven: canonical.liveProven,
    lastProofAt: canonical.lastProofAt,
    blockedReasons,
    musicGenerationReady,
    executionBlocked: !executableNow,
    blockedReason,
    discoveredMusicModels: musicModels.length,
    genxMusicModels: genxMusicModels.map((model) => model.modelId),
    togetherMusicModels: musicModels.filter((model) => model.provider === 'together').map((model) => model.modelId),
    deepinfraMusicModels: musicModels.filter((model) => model.provider === 'deepinfra').map((model) => model.modelId),
    groqMusicModels: [],
    genxMusicCapabilityKnown,
    lyriaClipDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-clip-preview'),
    lyriaProDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-pro-preview'),
    musicProviderCapabilityKnown: musicModels.length > 0,
    musicExecutorReady: canonical.executorRegistered && canonical.artifactPathImplemented,
    endpointShapeKnown: musicModels.some((model) => model.endpointShapeKnown),
    approvedProviderAudit: APPROVED_PROVIDER_DEFINITIONS.map((definition) => {
      const provider = canonicalTruth.providers.find((entry) => entry.provider === definition.key)!
      const musicClient = provider.registeredExecutorCapabilities.includes('music_generation')
      return {
        provider: definition.key,
        musicClient,
        executable: definition.key === 'genx' && executableNow,
        note: definition.codingOnly
          ? 'coding_tools_only and never runtime-selected'
          : musicClient
            ? 'Callable music executor registered; execution still requires canonical configuration, policy, and infrastructure gates.'
            : 'No callable music executor registered.',
      }
    }),
  }
}

function joinDescriptiveParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

export function createMusicProviderPrompt(
  input: MusicGenerationRequest,
  normalizedPrompt: string,
  inspirationProfile?: MusicInspirationProfile | null,
): string {
  const derivedParts = [
    input.style && input.style !== 'custom' ? `${input.style.replace(/_/g, ' ')} style` : null,
    input.genre ? `${input.genre} genre` : null,
    input.mood ? `${input.mood} mood` : null,
    input.bpm ? `approximately ${input.bpm} BPM` : input.tempo ? `${input.tempo} tempo` : null,
    input.durationSeconds ? `target duration about ${input.durationSeconds} seconds` : null,
    input.instrumentalOnly ? 'instrumental only, no vocals' : null,
    input.arrangement?.length ? `arrangement sections: ${input.arrangement.join(', ')}` : null,
    inspirationProfile ? inspirationProfileToPrompt(inspirationProfile) : null,
    'original non-copying composition; do not copy melody, lyrics, performer voice, hook, or exact arrangement',
  ]

  return joinDescriptiveParts([normalizedPrompt, ...derivedParts])
}

export function inspirationProfileToPrompt(profile: MusicInspirationProfile): string {
  return joinDescriptiveParts([
    'reference-inspired abstract traits only',
    profile.approximateBpm ? `approximately ${profile.approximateBpm} BPM` : null,
    `${profile.energy} energy`,
    `${profile.loudness} loudness`,
    profile.descriptors.length ? profile.descriptors.join(', ') : null,
    profile.copyAvoidance.join(', '),
  ])
}

export function analyzeMusicReferenceAudio(input: {
  artifactId: string
  mimeType: string
  fileSizeBytes: number
  durationSeconds?: number | null
}): MusicInspirationProfile {
  const boundedDuration = typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)
    ? Math.min(Math.max(input.durationSeconds, 0), MAX_REFERENCE_AUDIO_DURATION_SECONDS)
    : null
  const sizeRatio = Math.min(input.fileSizeBytes / MAX_REFERENCE_AUDIO_BYTES, 1)
  const energy = sizeRatio > 0.66 ? 'high' : sizeRatio > 0.25 ? 'medium' : 'low'
  const loudness = sizeRatio > 0.66 ? 'loud' : sizeRatio > 0.25 ? 'moderate' : 'quiet'
  const approximateBpm = boundedDuration && boundedDuration >= 20
    ? Math.max(60, Math.min(140, Math.round(6000 / boundedDuration)))
    : null

  return {
    sourceArtifactId: input.artifactId,
    durationSeconds: boundedDuration,
    approximateBpm,
    loudness,
    energy,
    instrumentalVocalLikelihood: 'unknown',
    descriptors: ['broad musical energy profile', `${input.mimeType} source`],
    copyAvoidance: [
      'no copied melody',
      'no copied lyrics',
      'no copied performer voice',
      'no exact arrangement cloning',
    ],
  }
}

export function createLongFormMusicRequest(input: {
  prompt?: string
  purpose?: 'background_music'
  targetDurationSeconds: number
  mood?: string
  style?: MusicStyle
  loop?: boolean
  fadeInSeconds?: number
  fadeOutSeconds?: number
  brandContext?: string
  parentExecutionId?: string
  traceId: string
  appSlug: string
}): MusicGenerationRequest & {
  capability: 'music_generation'
  purpose: 'background_music'
  loop: boolean
  fadeInSeconds: number
  fadeOutSeconds: number
  parentExecutionId: string | null
  traceId: string
  appSlug: string
} {
  return {
    capability: 'music_generation',
    purpose: 'background_music',
    prompt: input.prompt ?? joinDescriptiveParts([
      'Original background music for a future long-form video',
      input.brandContext,
      input.loop ? 'loop-friendly' : null,
      input.fadeInSeconds ? `${input.fadeInSeconds}s fade in` : null,
      input.fadeOutSeconds ? `${input.fadeOutSeconds}s fade out` : null,
    ]),
    style: input.style ?? 'cinematic',
    mood: input.mood,
    durationSeconds: input.targetDurationSeconds,
    instrumentalOnly: true,
    vocalsRequested: false,
    routingMode: 'balanced',
    safetyLevel: 'standard',
    outputFormat: 'mp3',
    loop: input.loop ?? false,
    fadeInSeconds: input.fadeInSeconds ?? 0,
    fadeOutSeconds: input.fadeOutSeconds ?? 0,
    parentExecutionId: input.parentExecutionId ?? null,
    traceId: input.traceId,
    appSlug: input.appSlug,
  }
}

export function createMusicGenerationPlan(input: MusicGenerationRequest): MusicGenerationPlan {
  const normalized = normalizeMusicPrompt(input.prompt)
  const status = getMusicCapabilityStatus()
  const lyricsRequested = Boolean(input.lyrics?.trim())
  const vocalsRequested = input.vocalsRequested || input.instrumentalOnly === false || lyricsRequested
  const warnings = [...normalized.warnings]
  const blockedReasons: string[] = []

  // Vocals and lyrics are model-dependent, not globally blocked.
  // A compatible GenX song model that supports vocals/lyrics must be discovered
  // and eligible for the request to succeed. The global blockers are removed.

  if (input.referenceAudioArtifactId) {
    warnings.push('Reference audio is analysed locally into an abstract inspiration profile; direct provider conditioning is not proven.')
  }

  if (normalized.blocked) {
    blockedReasons.push('prompt_policy_blocked')
  }

  const providerPrompt = createMusicProviderPrompt(input, normalized.prompt)
  const executionReady = status.executableNow && !normalized.blocked && blockedReasons.length === 0
  const blockedReason = blockedReasons.length > 0
    ? `Music generation blocked: ${blockedReasons.join(', ')}.`
    : normalized.blocked ? normalized.blockedReason ?? status.blockedReason : status.blockedReason

  return {
    capability: 'music_generation',
    prompt: input.prompt,
    normalizedPrompt: normalized.prompt,
    style: input.style,
    mood: input.mood ?? null,
    genre: input.genre ?? null,
    tempo: input.tempo ?? null,
    bpm: input.bpm ?? null,
    arrangement: input.arrangement ?? [],
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
    providerPrompt,
    nativeProviderFields: ['model', 'params.prompt'],
    derivedPromptOnlyFields: ['durationSeconds', 'instrumentalOnly', 'genre', 'mood', 'style', 'tempo', 'bpm', 'arrangement'],
    unsupportedFields: vocalsRequested ? [] : input.instrumentalOnly ? ['vocalsRequested', 'lyrics'] : [],
    referenceAudioAnalysisMode: input.referenceAudioArtifactId ? 'inspiration_profile' : 'none',
    referenceAudioConditioningReady: false,
    executionReady,
    blockedReason,
    blockedReasons,
    warnings,
  }
}
