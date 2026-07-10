import { z } from 'zod'
import { MODEL_CATALOGUE } from './model-catalog.js'
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
  modelCatalogueEntryExists: boolean
  workerExecutorExists: boolean
  artifactPersistenceReady: boolean
  dashboardReady: boolean
  instrumentalReady: boolean
  vocalsReady: boolean
  lyricsReady: boolean
  musicGenerationReady: boolean
  executionBlocked: boolean
  blockedReason: string
  approvedProviderAudit: Array<{
    provider: 'genx' | 'groq' | 'together' | 'mimo' | 'deepinfra'
    musicClient: boolean
    executable: boolean
    note: string
  }>
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

export function getMusicCapabilityStatus(): MusicCapabilityStatus {
  const modelCatalogueEntryExists = MODEL_CATALOGUE.some((model) => model.capabilities.includes('music_generation'))
  const missingProviderClient = 'No approved provider music generation client or endpoint is documented/configured in this repo.'

  return {
    foundationReady: true,
    schemaReady: true,
    plannerReady: true,
    providerClientExists: false,
    modelCatalogueEntryExists,
    workerExecutorExists: false,
    artifactPersistenceReady: true,
    dashboardReady: true,
    instrumentalReady: true,
    vocalsReady: false,
    lyricsReady: false,
    musicGenerationReady: false,
    executionBlocked: true,
    blockedReason: missingProviderClient,
    approvedProviderAudit: [
      { provider: 'genx', musicClient: false, executable: false, note: 'GenX video client exists; no repo music client or documented music endpoint.' },
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
    executionReady: status.musicGenerationReady && !normalized.blocked,
    blockedReason: normalized.blocked ? normalized.blockedReason ?? status.blockedReason : status.blockedReason,
    warnings,
  }
}
