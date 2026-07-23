import { z } from 'zod'
import { VOICE_AVATAR_USE_SCOPES } from './voice-avatar-platform.js'

export const GOVERNED_TTS_BLOCKED_FIELDS = [
  'voice',
  'providerVoiceId',
  'provider',
  'model',
  'route',
  'executorId',
  'endpoint',
  'apiKey',
] as const

export const GovernedTtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(50_000).optional(),
  voiceProfileId: z.string().uuid().optional(),
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES).default('narration'),
  speed: z.number().min(0.5).max(5).default(1),
  outputFormat: z.enum(['wav', 'mp3', 'flac', 'ogg']).default('wav'),
  language: z.string().trim().min(2).max(20).optional(),
  locale: z.string().trim().min(2).max(30).optional(),
  accent: z.string().trim().min(1).max(100).optional(),
  style: z.string().trim().min(1).max(200).optional(),
}).strict()

export type GovernedTtsRequest = z.infer<typeof GovernedTtsRequestSchema>

export interface GovernedTtsValidation {
  success: boolean
  data?: GovernedTtsRequest
  error?: string
  issues?: Array<{ path: string; message: string }>
}

export function hasGovernedTtsBlockedField(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return GOVERNED_TTS_BLOCKED_FIELDS.find((field) => Object.prototype.hasOwnProperty.call(record, field)) ?? null
}

export function validateGovernedTtsRequest(
  prompt: string,
  input: Record<string, unknown>,
): GovernedTtsValidation {
  const blocked = hasGovernedTtsBlockedField(input)
  if (blocked) {
    return {
      success: false,
      error: `Invalid tts request: input.${blocked} is not allowed. Voice selection is owned by the AmarktAI Network.`,
      issues: [{ path: blocked, message: 'Provider voice and execution authority are Network-owned' }],
    }
  }

  const request = { ...input }
  if (request.text === undefined) request.text = prompt
  const parsed = GovernedTtsRequestSchema.safeParse(request)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return {
      success: false,
      error: `Invalid tts request: ${issues.map((issue) => `${issue.path || 'input'} ${issue.message}`).join('; ')}`,
      issues,
    }
  }
  return { success: true, data: parsed.data }
}
