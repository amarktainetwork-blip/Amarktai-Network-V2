import { createHash } from 'node:crypto'
import {
  evaluateVoiceProfileRights,
  ReusableVoiceProfileSchema,
  type ReusableVoiceProfile,
} from '@amarktai/core/voice-avatar-platform'
import {
  GovernedTtsRequestSchema,
  validateGovernedTtsRequest,
  type GovernedTtsRequest,
} from '@amarktai/core/governed-tts'
import { voiceProfileArtifactId } from '@amarktai/core/voice-avatar-resources'
import { prisma } from '@amarktai/db'
import { resolveTogetherVoice } from '@amarktai/providers'
import type { WorkerJobData } from '../processors/job-processor.js'

export type GovernedTtsProvider = 'together' | 'genx'

export interface VoiceCatalogueCandidate {
  id: string
  voiceId: string
  provider: string
  model: string
  compatibleModels: string
  language: string
  locale: string
  accent: string
  style: string
  useCaseTags: string
  sourceType: string
  consentStatus: string
  enabled: boolean
}

export interface GovernedVoiceResolution {
  provider: GovernedTtsProvider
  model: string
  providerVoiceId: string
  providerVoiceReferenceHash: string
  source: 'verified_profile_catalogue' | 'verified_profile_binding' | 'network_catalogue' | 'together_model_default'
  voiceProfileId: string | null
  catalogueVoiceRecordId: string | null
  language: string
  locale: string
  intendedUse: GovernedTtsRequest['intendedUse']
}

export interface PublicGovernedVoiceEvidence {
  provider: GovernedTtsProvider
  model: string
  providerVoiceReferenceHash: string
  source: GovernedVoiceResolution['source']
  voiceProfileId: string | null
  catalogueVoiceRecordId: string | null
  language: string
  locale: string
  intendedUse: GovernedTtsRequest['intendedUse']
}

function safeJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function voiceSupportsModel(voice: VoiceCatalogueCandidate, selectedModel: string): boolean {
  const compatible = safeJsonStringArray(voice.compatibleModels)
  if (compatible.length > 0) return compatible.includes(selectedModel)
  return !voice.model.trim() || voice.model === selectedModel
}

function voiceMatchesRequest(voice: VoiceCatalogueCandidate, request: GovernedTtsRequest): boolean {
  if (!voice.enabled || voice.sourceType !== 'catalogue' || voice.consentStatus !== 'provider_catalogue') return false
  if (request.locale && normalized(voice.locale) !== normalized(request.locale)) return false
  if (request.language) {
    const language = normalized(request.language)
    const candidateLanguage = normalized(voice.language)
    const candidateLocale = normalized(voice.locale)
    if (candidateLanguage !== language && candidateLocale !== language && !candidateLocale.startsWith(`${language}-`)) return false
  }
  if (request.accent && !normalized(voice.accent).includes(normalized(request.accent))) return false
  if (request.style && !normalized(voice.style).includes(normalized(request.style))) return false
  const useCaseTags = safeJsonStringArray(voice.useCaseTags)
  if (useCaseTags.length > 0 && !useCaseTags.includes(request.intendedUse)) return false
  return true
}

function voiceScore(voice: VoiceCatalogueCandidate, selectedModel: string, request: GovernedTtsRequest): number {
  let score = 0
  if (voice.model === selectedModel) score += 16
  if (safeJsonStringArray(voice.compatibleModels).includes(selectedModel)) score += 12
  if (request.locale && normalized(voice.locale) === normalized(request.locale)) score += 8
  if (request.language && normalized(voice.language) === normalized(request.language)) score += 4
  if (request.accent && normalized(voice.accent) === normalized(request.accent)) score += 2
  if (request.style && normalized(voice.style) === normalized(request.style)) score += 2
  if (safeJsonStringArray(voice.useCaseTags).includes(request.intendedUse)) score += 1
  return score
}

export function selectCatalogueVoice(input: {
  voices: VoiceCatalogueCandidate[]
  provider: GovernedTtsProvider
  selectedModel: string
  request: GovernedTtsRequest
}): VoiceCatalogueCandidate | null {
  return input.voices
    .filter((voice) => voice.provider === input.provider)
    .filter((voice) => voiceSupportsModel(voice, input.selectedModel))
    .filter((voice) => voiceMatchesRequest(voice, input.request))
    .sort((left, right) => {
      const scoreDifference = voiceScore(right, input.selectedModel, input.request) - voiceScore(left, input.selectedModel, input.request)
      return scoreDifference || left.voiceId.localeCompare(right.voiceId)
    })[0] ?? null
}

export function readGovernedTtsRequest(payload: WorkerJobData): GovernedTtsRequest {
  const version = payload.metadata?.governedTtsContractVersion
  const metadataRequest = payload.metadata?.governedTtsRequest
  if (version === 1 && metadataRequest && typeof metadataRequest === 'object' && !Array.isArray(metadataRequest)) {
    return GovernedTtsRequestSchema.parse(metadataRequest)
  }

  if (payload.executionProfile === 'internal_dashboard') {
    const validation = validateGovernedTtsRequest(payload.prompt, payload.input ?? {})
    if (validation.success && validation.data) return validation.data
    throw new Error(validation.error ?? 'Internal governed TTS request is invalid')
  }

  throw new Error('Governed TTS metadata is missing or invalid')
}

function assertProfileRequestCompatibility(profile: ReusableVoiceProfile, request: GovernedTtsRequest): void {
  if (request.locale && normalized(profile.locale) !== normalized(request.locale)) {
    throw new Error(`Voice profile '${profile.voiceProfileId}' does not support locale '${request.locale}'`)
  }
  if (request.language) {
    const language = normalized(request.language)
    const profileLanguage = normalized(profile.language)
    const profileLocale = normalized(profile.locale)
    if (profileLanguage !== language && profileLocale !== language && !profileLocale.startsWith(`${language}-`)) {
      throw new Error(`Voice profile '${profile.voiceProfileId}' does not support language '${request.language}'`)
    }
  }
}

function voiceReferenceHash(provider: GovernedTtsProvider, providerVoiceId: string): string {
  return createHash('sha256').update(`${provider}:${providerVoiceId}`).digest('hex').slice(0, 24)
}

function resolved(input: Omit<GovernedVoiceResolution, 'providerVoiceReferenceHash'>): GovernedVoiceResolution {
  return {
    ...input,
    providerVoiceReferenceHash: voiceReferenceHash(input.provider, input.providerVoiceId),
  }
}

async function readVerifiedProfile(appSlug: string, voiceProfileId: string, request: GovernedTtsRequest): Promise<ReusableVoiceProfile> {
  const artifact = await prisma.artifact.findFirst({
    where: {
      id: voiceProfileArtifactId(appSlug, voiceProfileId),
      appSlug,
      type: 'document',
      subType: 'voice_profile',
      status: 'completed',
    },
  })
  if (!artifact) throw new Error(`Voice profile '${voiceProfileId}' was not found for the authenticated app`)

  let profile: ReusableVoiceProfile
  try {
    profile = ReusableVoiceProfileSchema.parse(JSON.parse(artifact.metadata))
  } catch {
    throw new Error(`Voice profile '${voiceProfileId}' is invalid`)
  }
  const rights = evaluateVoiceProfileRights({ profile, intendedUse: request.intendedUse })
  if (!rights.allowed) throw new Error(`Voice profile '${voiceProfileId}' is not usable: ${rights.reasons.join('; ')}`)
  assertProfileRequestCompatibility(profile, request)
  return profile
}

async function resolveProfileVoice(input: {
  appSlug: string
  provider: GovernedTtsProvider
  selectedModel: string
  request: GovernedTtsRequest
}): Promise<GovernedVoiceResolution> {
  const voiceProfileId = input.request.voiceProfileId!
  const profile = await readVerifiedProfile(input.appSlug, voiceProfileId, input.request)

  if (profile.source.sourceType === 'provider_catalogue') {
    const catalogue = await prisma.voiceLibrary.findUnique({ where: { voiceId: profile.source.catalogueVoiceId } })
    if (!catalogue) throw new Error(`Catalogue voice '${profile.source.catalogueVoiceId}' was not found`)
    const selected = selectCatalogueVoice({
      voices: [catalogue],
      provider: input.provider,
      selectedModel: input.selectedModel,
      request: input.request,
    })
    if (!selected) throw new Error(`Catalogue voice '${profile.source.catalogueVoiceId}' is not compatible with ${input.provider}/${input.selectedModel}`)
    return resolved({
      provider: input.provider,
      model: input.selectedModel,
      providerVoiceId: selected.voiceId,
      source: 'verified_profile_catalogue',
      voiceProfileId,
      catalogueVoiceRecordId: selected.id,
      language: profile.language,
      locale: profile.locale ?? '',
      intendedUse: input.request.intendedUse,
    })
  }

  const binding = profile.providerBinding
  if (!binding) throw new Error(`Voice profile '${voiceProfileId}' has no verified provider binding`)
  if (binding.provider !== input.provider) {
    throw new Error(`Voice profile '${voiceProfileId}' is bound to '${binding.provider}', not '${input.provider}'`)
  }
  if (binding.selectedModel && binding.selectedModel !== input.selectedModel) {
    throw new Error(`Voice profile '${voiceProfileId}' is not bound to model '${input.selectedModel}'`)
  }
  if (input.provider === 'genx') {
    const registered = await prisma.voiceLibrary.findUnique({ where: { voiceId: binding.providerVoiceId } })
    if (!registered || registered.provider !== 'genx' || !registered.enabled || !voiceSupportsModel(registered, input.selectedModel)) {
      throw new Error(`Voice profile '${voiceProfileId}' is not registered for the current GenX transport and model`)
    }
  }
  return resolved({
    provider: input.provider,
    model: input.selectedModel,
    providerVoiceId: binding.providerVoiceId,
    source: 'verified_profile_binding',
    voiceProfileId,
    catalogueVoiceRecordId: null,
    language: profile.language,
    locale: profile.locale ?? '',
    intendedUse: input.request.intendedUse,
  })
}

export async function resolveGovernedVoice(input: {
  payload: WorkerJobData
  provider: GovernedTtsProvider
  selectedModel: string
}): Promise<{ request: GovernedTtsRequest; resolution: GovernedVoiceResolution }> {
  const request = readGovernedTtsRequest(input.payload)
  if (request.voiceProfileId) {
    return {
      request,
      resolution: await resolveProfileVoice({
        appSlug: input.payload.appSlug,
        provider: input.provider,
        selectedModel: input.selectedModel,
        request,
      }),
    }
  }

  const voices = await prisma.voiceLibrary.findMany({
    where: {
      enabled: true,
      provider: input.provider,
      sourceType: 'catalogue',
      consentStatus: 'provider_catalogue',
    },
  })
  const selected = selectCatalogueVoice({ voices, provider: input.provider, selectedModel: input.selectedModel, request })
  if (selected) {
    return {
      request,
      resolution: resolved({
        provider: input.provider,
        model: input.selectedModel,
        providerVoiceId: selected.voiceId,
        source: 'network_catalogue',
        voiceProfileId: null,
        catalogueVoiceRecordId: selected.id,
        language: selected.language,
        locale: selected.locale,
        intendedUse: request.intendedUse,
      }),
    }
  }

  if (input.provider === 'together') {
    const providerVoiceId = resolveTogetherVoice(input.selectedModel)
    return {
      request,
      resolution: resolved({
        provider: input.provider,
        model: input.selectedModel,
        providerVoiceId,
        source: 'together_model_default',
        voiceProfileId: null,
        catalogueVoiceRecordId: null,
        language: request.language ?? 'en',
        locale: request.locale ?? '',
        intendedUse: request.intendedUse,
      }),
    }
  }

  throw new Error(`No verified ${input.provider} voice is compatible with model '${input.selectedModel}' and the requested outcome`)
}

export function publicGovernedVoiceEvidence(resolution: GovernedVoiceResolution): PublicGovernedVoiceEvidence {
  const { providerVoiceId: _providerVoiceId, ...evidence } = resolution
  return evidence
}
