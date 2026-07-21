import { z } from 'zod'

export const RIGHTS_SENSITIVE_MEDIA_CAPABILITIES = [
  'voice_clone',
  'voice_conversion',
  'lip_sync',
  'avatar_generation',
] as const

export type RightsSensitiveMediaCapability = (typeof RIGHTS_SENSITIVE_MEDIA_CAPABILITIES)[number]

export const VOICE_AVATAR_BLOCKED_EXECUTION_FIELDS = [
  'appSlug',
  'provider',
  'model',
  'route',
  'executorId',
  'endpoint',
  'apiKey',
  'providerVoiceId',
  'providerAvatarId',
] as const

export const VOICE_AVATAR_USE_SCOPES = [
  'narration',
  'conversational_agent',
  'marketing',
  'education',
  'accessibility',
  'customer_support',
  'avatar_performance',
  'internal_production',
] as const

export type VoiceAvatarUseScope = (typeof VOICE_AVATAR_USE_SCOPES)[number]

export const VOICE_PROFILE_STATUSES = ['draft', 'verified', 'revoked', 'archived'] as const
export const AVATAR_PROFILE_STATUSES = ['draft', 'verified', 'revoked', 'archived'] as const
export const RIGHTS_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'revoked', 'expired'] as const
export const RIGHTS_DECISIONS = ['verified', 'rejected', 'revoked'] as const

const IsoDateTimeSchema = z.string().datetime({ offset: true })
const ArtifactIdSchema = z.string().uuid()
const ProfileIdSchema = z.string().uuid()
const NonEmptyStringArraySchema = z.array(z.string().trim().min(1)).min(1).max(100)
const UseScopeArraySchema = z.array(z.enum(VOICE_AVATAR_USE_SCOPES)).min(1).max(VOICE_AVATAR_USE_SCOPES.length)

export const ProfileRightsDecisionSchema = z.object({
  decision: z.enum(RIGHTS_DECISIONS),
  verifierReference: z.string().trim().min(1).max(300),
  decidedAt: IsoDateTimeSchema,
  notes: z.string().max(5_000).default(''),
}).strict()

export type ProfileRightsDecision = z.infer<typeof ProfileRightsDecisionSchema>

export const HumanConsentEvidenceSchema = z.object({
  version: z.literal(1),
  subjectReference: z.string().trim().min(1).max(300),
  rightsHolderReference: z.string().trim().min(1).max(300),
  subjectAgeConfirmedAdult: z.literal(true),
  identityVerificationArtifactId: ArtifactIdSchema,
  consentArtifactId: ArtifactIdSchema,
  sourceRecordingConsentArtifactId: ArtifactIdSchema.optional(),
  permittedUses: UseScopeArraySchema,
  commercialUseAllowed: z.boolean(),
  syntheticDisclosureRequired: z.boolean().default(true),
  revocable: z.literal(true),
  declaredAt: IsoDateTimeSchema,
  verifiedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.optional(),
  verifierReference: z.string().trim().min(1).max(300),
  jurisdictions: NonEmptyStringArraySchema.max(50),
  notes: z.string().max(5_000).default(''),
}).strict().superRefine((value, context) => {
  if (new Date(value.verifiedAt).getTime() < new Date(value.declaredAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['verifiedAt'], message: 'verifiedAt cannot precede declaredAt' })
  }
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= new Date(value.verifiedAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiresAt must be after verifiedAt' })
  }
})

export type HumanConsentEvidence = z.infer<typeof HumanConsentEvidenceSchema>

export const VoiceSourceSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('provider_catalogue'),
    catalogueVoiceId: z.string().trim().min(1).max(300),
  }).strict(),
  z.object({
    sourceType: z.literal('user_recording'),
    sourceAudioArtifactIds: z.array(ArtifactIdSchema).min(1).max(20),
  }).strict(),
  z.object({
    sourceType: z.literal('synthetic_design'),
    designPrompt: z.string().trim().min(3).max(4_000),
  }).strict(),
  z.object({
    sourceType: z.literal('voice_remix'),
    parentVoiceProfileId: ProfileIdSchema,
    remixInstructions: z.string().trim().min(3).max(4_000),
  }).strict(),
])

export const ReusableVoiceProfileSchema = z.object({
  version: z.literal(1),
  voiceProfileId: ProfileIdSchema,
  appSlug: z.string().trim().min(1).max(200),
  status: z.enum(VOICE_PROFILE_STATUSES),
  displayName: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).default(''),
  source: VoiceSourceSchema,
  language: z.string().trim().min(2).max(20),
  locale: z.string().trim().min(2).max(30).optional(),
  styleTags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  permittedUses: UseScopeArraySchema,
  rightsStatus: z.enum(RIGHTS_VERIFICATION_STATUSES),
  rightsDecision: ProfileRightsDecisionSchema.optional(),
  consentEvidence: HumanConsentEvidenceSchema.optional(),
  previewArtifactId: ArtifactIdSchema.optional(),
  providerBinding: z.object({
    provider: z.string().trim().min(1).max(100),
    providerVoiceId: z.string().trim().min(1).max(500),
    selectedModel: z.string().trim().min(1).max(500).optional(),
    boundAt: IsoDateTimeSchema,
  }).strict().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.optional(),
  revocationReason: z.string().max(2_000).optional(),
}).strict().superRefine((value, context) => {
  const humanDerived = value.source.sourceType === 'user_recording'
  if (humanDerived && !value.consentEvidence) {
    context.addIssue({ code: 'custom', path: ['consentEvidence'], message: 'Human-derived voice profiles require verified consent evidence' })
  }
  if (value.status === 'verified' && value.rightsStatus !== 'verified') {
    context.addIssue({ code: 'custom', path: ['rightsStatus'], message: 'Verified voice profiles require verified rights status' })
  }
  if (value.rightsStatus === 'verified' && value.rightsDecision?.decision !== 'verified') {
    context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Verified voice rights require a durable verified decision' })
  }
  if (value.rightsStatus === 'rejected' && value.rightsDecision?.decision !== 'rejected') {
    context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Rejected voice rights require a durable rejected decision' })
  }
  if (value.status === 'revoked' || value.rightsStatus === 'revoked') {
    if (!value.revokedAt) context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked voice profiles require revokedAt' })
    if (value.rightsDecision?.decision !== 'revoked') context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Revoked voice profiles require a durable revoked decision' })
  }
  if (value.providerBinding && value.status === 'draft') {
    context.addIssue({ code: 'custom', path: ['providerBinding'], message: 'Draft voice profiles cannot expose a provider binding' })
  }
})

export type ReusableVoiceProfile = z.infer<typeof ReusableVoiceProfileSchema>

export const AvatarSourceSchema = z.discriminatedUnion('subjectType', [
  z.object({
    subjectType: z.literal('synthetic'),
    portraitArtifactId: ArtifactIdSchema,
    creationEvidenceArtifactId: ArtifactIdSchema,
  }).strict(),
  z.object({
    subjectType: z.literal('human_likeness'),
    portraitArtifactId: ArtifactIdSchema,
    consentEvidence: HumanConsentEvidenceSchema,
  }).strict(),
])

export const ReusableAvatarProfileSchema = z.object({
  version: z.literal(1),
  avatarProfileId: ProfileIdSchema,
  appSlug: z.string().trim().min(1).max(200),
  status: z.enum(AVATAR_PROFILE_STATUSES),
  displayName: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).default(''),
  source: AvatarSourceSchema,
  permittedUses: UseScopeArraySchema,
  rightsStatus: z.enum(RIGHTS_VERIFICATION_STATUSES),
  rightsDecision: ProfileRightsDecisionSchema.optional(),
  defaultVoiceProfileId: ProfileIdSchema.optional(),
  styleTags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  previewArtifactId: ArtifactIdSchema.optional(),
  providerBinding: z.object({
    provider: z.string().trim().min(1).max(100),
    providerAvatarId: z.string().trim().min(1).max(500),
    selectedModel: z.string().trim().min(1).max(500).optional(),
    boundAt: IsoDateTimeSchema,
  }).strict().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.optional(),
  revocationReason: z.string().max(2_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'verified' && value.rightsStatus !== 'verified') {
    context.addIssue({ code: 'custom', path: ['rightsStatus'], message: 'Verified avatar profiles require verified rights status' })
  }
  if (value.rightsStatus === 'verified' && value.rightsDecision?.decision !== 'verified') {
    context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Verified avatar rights require a durable verified decision' })
  }
  if (value.rightsStatus === 'rejected' && value.rightsDecision?.decision !== 'rejected') {
    context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Rejected avatar rights require a durable rejected decision' })
  }
  if (value.status === 'revoked' || value.rightsStatus === 'revoked') {
    if (!value.revokedAt) context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked avatar profiles require revokedAt' })
    if (value.rightsDecision?.decision !== 'revoked') context.addIssue({ code: 'custom', path: ['rightsDecision'], message: 'Revoked avatar profiles require a durable revoked decision' })
  }
  if (value.providerBinding && value.status === 'draft') {
    context.addIssue({ code: 'custom', path: ['providerBinding'], message: 'Draft avatar profiles cannot expose a provider binding' })
  }
})

export type ReusableAvatarProfile = z.infer<typeof ReusableAvatarProfileSchema>

const VoiceCloneRequestSchema = z.object({
  capability: z.literal('voice_clone'),
  displayName: z.string().trim().min(1).max(200),
  sourceAudioArtifactIds: z.array(ArtifactIdSchema).min(1).max(20),
  language: z.string().trim().min(2).max(20),
  locale: z.string().trim().min(2).max(30).optional(),
  intendedUses: UseScopeArraySchema,
  consentEvidence: HumanConsentEvidenceSchema,
  previewText: z.string().trim().min(1).max(5_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

const VoiceConversionRequestSchema = z.object({
  capability: z.literal('voice_conversion'),
  sourceAudioArtifactId: ArtifactIdSchema,
  targetVoiceProfileId: ProfileIdSchema,
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES),
  preserveTiming: z.boolean().default(true),
  outputFormat: z.enum(['wav', 'mp3', 'flac', 'ogg']).default('wav'),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

const LipSyncRequestSchema = z.object({
  capability: z.literal('lip_sync'),
  avatarProfileId: ProfileIdSchema.optional(),
  sourceImageArtifactId: ArtifactIdSchema.optional(),
  sourceVideoArtifactId: ArtifactIdSchema.optional(),
  audioArtifactId: ArtifactIdSchema,
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('9:16'),
  maxDurationSeconds: z.number().positive().max(300),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, context) => {
  const visualSources = [value.avatarProfileId, value.sourceImageArtifactId, value.sourceVideoArtifactId].filter(Boolean)
  if (visualSources.length !== 1) {
    context.addIssue({ code: 'custom', path: ['avatarProfileId'], message: 'Exactly one avatar, image or video source is required' })
  }
})

const AvatarGenerationRequestSchema = z.object({
  capability: z.literal('avatar_generation'),
  avatarProfileId: ProfileIdSchema.optional(),
  portraitArtifactId: ArtifactIdSchema.optional(),
  voiceProfileId: ProfileIdSchema.optional(),
  audioArtifactId: ArtifactIdSchema.optional(),
  script: z.string().trim().min(1).max(50_000).optional(),
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('9:16'),
  maxDurationSeconds: z.number().positive().max(300),
  captions: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, context) => {
  if (Boolean(value.avatarProfileId) === Boolean(value.portraitArtifactId)) {
    context.addIssue({ code: 'custom', path: ['avatarProfileId'], message: 'Exactly one avatarProfileId or portraitArtifactId is required' })
  }
  const audioModes = [value.audioArtifactId, value.script].filter(Boolean)
  if (audioModes.length !== 1) {
    context.addIssue({ code: 'custom', path: ['audioArtifactId'], message: 'Exactly one audioArtifactId or script is required' })
  }
  if (value.script && !value.voiceProfileId) {
    context.addIssue({ code: 'custom', path: ['voiceProfileId'], message: 'voiceProfileId is required when generating speech from script' })
  }
})

export const VoiceAvatarExecutionRequestSchema = z.discriminatedUnion('capability', [
  VoiceCloneRequestSchema,
  VoiceConversionRequestSchema,
  LipSyncRequestSchema,
  AvatarGenerationRequestSchema,
])

export type VoiceAvatarExecutionRequest = z.infer<typeof VoiceAvatarExecutionRequestSchema>

export interface VoiceAvatarRightsDecision {
  allowed: boolean
  reasons: string[]
}

export function hasVoiceAvatarBlockedOverrides(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return VOICE_AVATAR_BLOCKED_EXECUTION_FIELDS.find((field) => Object.prototype.hasOwnProperty.call(record, field)) ?? null
}

export function evaluateVoiceProfileRights(input: {
  profile: ReusableVoiceProfile
  intendedUse: VoiceAvatarUseScope
  now?: Date
}): VoiceAvatarRightsDecision {
  const reasons: string[] = []
  const now = input.now ?? new Date()
  if (input.profile.status !== 'verified') reasons.push(`Voice profile status is ${input.profile.status}`)
  if (input.profile.rightsStatus !== 'verified') reasons.push(`Voice rights status is ${input.profile.rightsStatus}`)
  if (!input.profile.permittedUses.includes(input.intendedUse)) reasons.push(`Use '${input.intendedUse}' is not permitted`)
  const consent = input.profile.consentEvidence
  if (input.profile.source.sourceType === 'user_recording' && !consent) reasons.push('Human-derived voice consent evidence is missing')
  if (consent?.expiresAt && new Date(consent.expiresAt).getTime() <= now.getTime()) reasons.push('Voice consent evidence has expired')
  if (input.profile.revokedAt) reasons.push('Voice profile has been revoked')
  return { allowed: reasons.length === 0, reasons }
}

export function evaluateAvatarProfileRights(input: {
  profile: ReusableAvatarProfile
  intendedUse: VoiceAvatarUseScope
  now?: Date
}): VoiceAvatarRightsDecision {
  const reasons: string[] = []
  const now = input.now ?? new Date()
  if (input.profile.status !== 'verified') reasons.push(`Avatar profile status is ${input.profile.status}`)
  if (input.profile.rightsStatus !== 'verified') reasons.push(`Avatar rights status is ${input.profile.rightsStatus}`)
  if (!input.profile.permittedUses.includes(input.intendedUse)) reasons.push(`Use '${input.intendedUse}' is not permitted`)
  if (input.profile.source.subjectType === 'human_likeness') {
    const consent = input.profile.source.consentEvidence
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= now.getTime()) reasons.push('Avatar consent evidence has expired')
  }
  if (input.profile.revokedAt) reasons.push('Avatar profile has been revoked')
  return { allowed: reasons.length === 0, reasons }
}
