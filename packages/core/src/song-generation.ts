import { z } from 'zod'
import {
  assertPremiumSpendConfirmed,
  createPremiumSpendDecision,
  type PremiumSpendDecision,
} from './premium-media-policy.js'

export const SONG_LYRICS_MODES = ['generated', 'provided'] as const
export const SONG_MASTERING_PROFILES = ['streaming', 'broadcast', 'cinematic'] as const
export const SONG_STRUCTURE_SECTIONS = [
  'intro',
  'verse',
  'pre_chorus',
  'chorus',
  'post_chorus',
  'bridge',
  'breakdown',
  'final_chorus',
  'outro',
] as const

export const DEFAULT_FULL_SONG_STRUCTURE = [
  'intro', 'verse', 'pre_chorus', 'chorus', 'verse', 'chorus', 'bridge', 'final_chorus', 'outro',
] as const

export const SongGenerationRequestSchema = z.object({
  prompt: z.string().min(12).max(4000),
  title: z.string().min(1).max(160).optional(),
  genre: z.string().min(1).max(120).default('contemporary pop'),
  mood: z.string().min(1).max(120).default('uplifting and cinematic'),
  language: z.string().min(2).max(80).default('English'),
  vocalStyle: z.string().min(1).max(160).default('expressive lead vocal with polished backing harmonies'),
  tempo: z.string().max(80).optional(),
  bpm: z.number().int().min(40).max(220).optional(),
  durationSeconds: z.number().int().min(60).max(300).default(180),
  lyricsMode: z.enum(SONG_LYRICS_MODES).default('generated'),
  lyrics: z.string().min(20).max(12000).optional(),
  structure: z.array(z.enum(SONG_STRUCTURE_SECTIONS)).min(4).max(16).default([...DEFAULT_FULL_SONG_STRUCTURE]),
  instrumentalVersion: z.boolean().default(true),
  adCutSeconds: z.number().int().min(15).max(60).default(30),
  masteringProfile: z.enum(SONG_MASTERING_PROFILES).default('streaming'),
  maxCredits: z.number().positive().max(1_000_000),
  reserveCredits: z.number().min(0).max(1_000_000).default(0),
  confirmation: z.string().max(80).default(''),
}).superRefine((value, context) => {
  if (value.lyricsMode === 'provided' && !value.lyrics?.trim()) {
    context.addIssue({ code: 'custom', path: ['lyrics'], message: 'Provided lyrics are required when lyricsMode is provided' })
  }
  if (value.lyricsMode === 'generated' && value.lyrics?.trim()) {
    context.addIssue({ code: 'custom', path: ['lyrics'], message: 'Remove lyrics or select provided lyrics mode' })
  }
})

export type SongGenerationRequest = z.infer<typeof SongGenerationRequestSchema>
export type SongVariant = 'vocal_master' | 'instrumental_master'

export interface SongPackageVariantPlan {
  variant: SongVariant
  capability: 'song_generation'
  prompt: string
  instrumentalOnly: boolean
  vocalsRequested: boolean
  lyrics: string | null
}

export interface SongPackagePlan {
  capability: 'song_generation'
  title: string
  selectedProvider: 'genx'
  selectedModel: string
  selectedExecutorId: string
  durationSeconds: number
  adCutSeconds: number
  masteringProfile: (typeof SONG_MASTERING_PROFILES)[number]
  structure: string[]
  variants: SongPackageVariantPlan[]
  spend: PremiumSpendDecision
  confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND'
}

const CLONE_PATTERNS = [
  /\bclone\b/i,
  /\bcopy\b/i,
  /\bsound exactly like\b/i,
  /\bin the voice of\b/i,
  /\bcover of\b/i,
  /\brecreate\b/i,
]

export function validateOriginalSongRequest(input: unknown): SongGenerationRequest {
  const request = SongGenerationRequestSchema.parse(input)
  const combined = `${request.prompt}\n${request.lyrics ?? ''}`
  if (CLONE_PATTERNS.some((pattern) => pattern.test(combined))) {
    throw new Error('Full-song production must be an original, non-copying composition')
  }
  return request
}

function describeStructure(structure: readonly string[]): string {
  return structure.map((section, index) => `${index + 1}:${section.replaceAll('_', ' ')}`).join(', ')
}

export function buildFullSongPrompt(request: SongGenerationRequest, instrumentalOnly = false): string {
  const title = request.title?.trim() || 'Original AmarktAI production'
  const lyricsInstruction = instrumentalOnly
    ? 'No lead or backing vocals and no spoken words.'
    : request.lyricsMode === 'provided'
      ? 'Use the supplied original lyrics exactly where they fit the requested structure.'
      : `Write completely original ${request.language} lyrics with a memorable hook, coherent verses, and no imitation of any existing artist or song.`
  const tempo = request.bpm ? `approximately ${request.bpm} BPM` : request.tempo || 'commercial contemporary tempo'
  return [
    `Create a premium full-length ${request.genre} ${instrumentalOnly ? 'instrumental master' : 'song'} titled "${title}".`,
    request.prompt.trim(),
    `Mood: ${request.mood}. Tempo: ${tempo}. Target duration: ${request.durationSeconds} seconds.`,
    `Structure: ${describeStructure(request.structure)}.`,
    instrumentalOnly ? 'Instrumental arrangement must preserve the same hook, energy arc, structure, and production identity as the vocal master.' : `Vocal direction: ${request.vocalStyle}. Language: ${request.language}.`,
    lyricsInstruction,
    `Mastering target: ${request.masteringProfile}; polished commercial loudness, controlled low end, clear transients, wide but mono-compatible stereo image, no clipping.`,
    'This must be a completely original, non-copying composition. Do not imitate a named performer, copyrighted melody, lyric, hook, vocal identity, or exact arrangement.',
  ].join(' ')
}

export function createSongPackagePlan(input: {
  request: SongGenerationRequest
  selectedModel: string
  selectedExecutorId: string
  availableCredits: number
  estimatedCreditsPerGeneration: number | null
}): SongPackagePlan {
  const { request } = input
  const variants: SongPackageVariantPlan[] = [
    {
      variant: 'vocal_master',
      capability: 'song_generation',
      prompt: buildFullSongPrompt(request, false),
      instrumentalOnly: false,
      vocalsRequested: true,
      lyrics: request.lyricsMode === 'provided' ? request.lyrics!.trim() : null,
    },
  ]
  if (request.instrumentalVersion) {
    variants.push({
      variant: 'instrumental_master',
      capability: 'song_generation',
      prompt: buildFullSongPrompt(request, true),
      instrumentalOnly: true,
      vocalsRequested: false,
      lyrics: null,
    })
  }

  const spend = createPremiumSpendDecision({
    availableCredits: input.availableCredits,
    maxCredits: request.maxCredits,
    reserveCredits: request.reserveCredits,
    lines: [{
      role: 'full_song',
      modelId: input.selectedModel,
      quantity: variants.length,
      estimatedCreditsPerUnit: input.estimatedCreditsPerGeneration,
    }],
  })

  return {
    capability: 'song_generation',
    title: request.title?.trim() || 'Original AmarktAI production',
    selectedProvider: 'genx',
    selectedModel: input.selectedModel,
    selectedExecutorId: input.selectedExecutorId,
    durationSeconds: request.durationSeconds,
    adCutSeconds: request.adCutSeconds,
    masteringProfile: request.masteringProfile,
    structure: [...request.structure],
    variants,
    spend,
    confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND',
  }
}

export function assertSongPackageSpendConfirmed(plan: SongPackagePlan, confirmation: string): void {
  assertPremiumSpendConfirmed(plan.spend, confirmation)
}
