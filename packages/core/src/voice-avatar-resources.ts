import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  AvatarSourceSchema,
  HumanConsentEvidenceSchema,
  VoiceSourceSchema,
  VOICE_AVATAR_USE_SCOPES,
  type ReusableAvatarProfile,
  type ReusableVoiceProfile,
} from './voice-avatar-platform.js'

const ArtifactIdSchema = z.string().uuid()
const ProfileIdSchema = z.string().uuid()
const UseScopeArraySchema = z.array(z.enum(VOICE_AVATAR_USE_SCOPES)).min(1).max(VOICE_AVATAR_USE_SCOPES.length)
const StyleTagsSchema = z.array(z.string().trim().min(1).max(100)).max(30).default([])

function profileArtifactId(kind: 'voice' | 'avatar', appSlug: string, profileId: string): string {
  const digest = createHash('sha256').update(`${kind}:${appSlug}:${profileId}`).digest('hex').slice(0, 40)
  return `${kind}-profile-${digest}`
}

export function voiceProfileArtifactId(appSlug: string, voiceProfileId: string): string {
  return profileArtifactId('voice', appSlug, voiceProfileId)
}

export function avatarProfileArtifactId(appSlug: string, avatarProfileId: string): string {
  return profileArtifactId('avatar', appSlug, avatarProfileId)
}

const VoiceProfileWritableFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).default(''),
  source: VoiceSourceSchema,
  language: z.string().trim().min(2).max(20),
  locale: z.string().trim().min(2).max(30).optional(),
  styleTags: StyleTagsSchema,
  permittedUses: UseScopeArraySchema,
  consentEvidence: HumanConsentEvidenceSchema.optional(),
  previewArtifactId: ArtifactIdSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.source.sourceType === 'user_recording' && !value.consentEvidence) {
    context.addIssue({ code: 'custom', path: ['consentEvidence'], message: 'Human-derived voice profiles require consent evidence' })
  }
})

export const VoiceProfileCreateRequestSchema = VoiceProfileWritableFieldsSchema
export const VoiceProfileUpdateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
  source: VoiceSourceSchema.optional(),
  language: z.string().trim().min(2).max(20).optional(),
  locale: z.string().trim().min(2).max(30).nullable().optional(),
  styleTags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  permittedUses: UseScopeArraySchema.optional(),
  consentEvidence: HumanConsentEvidenceSchema.nullable().optional(),
  previewArtifactId: ArtifactIdSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one voice profile field is required')

const AvatarProfileWritableFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).default(''),
  source: AvatarSourceSchema,
  permittedUses: UseScopeArraySchema,
  defaultVoiceProfileId: ProfileIdSchema.optional(),
  styleTags: StyleTagsSchema,
  previewArtifactId: ArtifactIdSchema.optional(),
}).strict()

export const AvatarProfileCreateRequestSchema = AvatarProfileWritableFieldsSchema
export const AvatarProfileUpdateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
  source: AvatarSourceSchema.optional(),
  permittedUses: UseScopeArraySchema.optional(),
  defaultVoiceProfileId: ProfileIdSchema.nullable().optional(),
  styleTags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  previewArtifactId: ArtifactIdSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one avatar profile field is required')

export const VoiceAvatarProfileDecisionRequestSchema = z.object({
  decision: z.enum(['verified', 'rejected', 'revoked']),
  notes: z.string().max(5_000).default(''),
}).strict()

export const VoiceAvatarProfileDecisionSchema = VoiceAvatarProfileDecisionRequestSchema.extend({
  verifierReference: z.string().trim().min(1).max(300),
}).strict()

export type VoiceProfileCreateRequest = z.infer<typeof VoiceProfileCreateRequestSchema>
export type VoiceProfileUpdateRequest = z.infer<typeof VoiceProfileUpdateRequestSchema>
export type AvatarProfileCreateRequest = z.infer<typeof AvatarProfileCreateRequestSchema>
export type AvatarProfileUpdateRequest = z.infer<typeof AvatarProfileUpdateRequestSchema>
export type VoiceAvatarProfileDecisionRequest = z.infer<typeof VoiceAvatarProfileDecisionRequestSchema>
export type VoiceAvatarProfileDecision = z.infer<typeof VoiceAvatarProfileDecisionSchema>

export function voiceProfileArtifactReferences(profile: Pick<ReusableVoiceProfile, 'source' | 'consentEvidence' | 'previewArtifactId'>): Array<{
  artifactId: string
  role: 'source_audio' | 'identity_verification' | 'consent' | 'source_recording_consent' | 'preview'
  expectedTypes: readonly string[]
}> {
  const refs: Array<{ artifactId: string; role: 'source_audio' | 'identity_verification' | 'consent' | 'source_recording_consent' | 'preview'; expectedTypes: readonly string[] }> = []
  if (profile.source.sourceType === 'user_recording') {
    for (const artifactId of profile.source.sourceAudioArtifactIds) refs.push({ artifactId, role: 'source_audio', expectedTypes: ['audio'] })
  }
  if (profile.consentEvidence) {
    refs.push({ artifactId: profile.consentEvidence.identityVerificationArtifactId, role: 'identity_verification', expectedTypes: ['document', 'image', 'video'] })
    refs.push({ artifactId: profile.consentEvidence.consentArtifactId, role: 'consent', expectedTypes: ['document', 'audio', 'video'] })
    if (profile.consentEvidence.sourceRecordingConsentArtifactId) {
      refs.push({ artifactId: profile.consentEvidence.sourceRecordingConsentArtifactId, role: 'source_recording_consent', expectedTypes: ['document', 'audio', 'video'] })
    }
  }
  if (profile.previewArtifactId) refs.push({ artifactId: profile.previewArtifactId, role: 'preview', expectedTypes: ['audio'] })
  return refs
}

export function avatarProfileArtifactReferences(profile: Pick<ReusableAvatarProfile, 'source' | 'previewArtifactId'>): Array<{
  artifactId: string
  role: 'portrait' | 'creation_evidence' | 'identity_verification' | 'consent' | 'source_recording_consent' | 'preview'
  expectedTypes: readonly string[]
}> {
  const refs: Array<{ artifactId: string; role: 'portrait' | 'creation_evidence' | 'identity_verification' | 'consent' | 'source_recording_consent' | 'preview'; expectedTypes: readonly string[] }> = [
    { artifactId: profile.source.portraitArtifactId, role: 'portrait', expectedTypes: ['image'] },
  ]
  if (profile.source.subjectType === 'synthetic') {
    refs.push({ artifactId: profile.source.creationEvidenceArtifactId, role: 'creation_evidence', expectedTypes: ['document', 'image'] })
  } else {
    const consent = profile.source.consentEvidence
    refs.push({ artifactId: consent.identityVerificationArtifactId, role: 'identity_verification', expectedTypes: ['document', 'image', 'video'] })
    refs.push({ artifactId: consent.consentArtifactId, role: 'consent', expectedTypes: ['document', 'audio', 'video'] })
    if (consent.sourceRecordingConsentArtifactId) {
      refs.push({ artifactId: consent.sourceRecordingConsentArtifactId, role: 'source_recording_consent', expectedTypes: ['document', 'audio', 'video'] })
    }
  }
  if (profile.previewArtifactId) refs.push({ artifactId: profile.previewArtifactId, role: 'preview', expectedTypes: ['image', 'video'] })
  return refs
}
