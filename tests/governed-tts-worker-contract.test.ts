import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GovernedTtsRequestSchema } from '../packages/core/src/governed-tts.ts'
import {
  publicGovernedVoiceEvidence,
  readGovernedTtsRequest,
  selectCatalogueVoice,
  voiceSupportsModel,
  type GovernedVoiceResolution,
  type VoiceCatalogueCandidate,
} from '../apps/worker/src/providers/governed-voice-resolver.ts'
import type { WorkerJobData } from '../apps/worker/src/processors/job-processor.ts'

const resolverSource = readFileSync(new URL('../apps/worker/src/providers/governed-voice-resolver.ts', import.meta.url), 'utf8')
const registrationSource = readFileSync(new URL('../apps/worker/src/providers/governed-tts-handler-registration.ts', import.meta.url), 'utf8')
const fixtureExecutorSource = readFileSync(new URL('../apps/worker/src/providers/release-fixture-executor.ts', import.meta.url), 'utf8')
const fixtureBootstrapSource = readFileSync(new URL('../apps/api/src/lib/release-fixture-mode.ts', import.meta.url), 'utf8')
const workerSource = readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url), 'utf8')

function voice(overrides: Partial<VoiceCatalogueCandidate> = {}): VoiceCatalogueCandidate {
  return {
    id: 'voice-row-1',
    voiceId: 'provider-voice-a',
    provider: 'together',
    model: '',
    compatibleModels: JSON.stringify(['canopylabs/orpheus-3b-0.1-ft']),
    language: 'en',
    locale: 'en-ZA',
    accent: 'south-african',
    style: 'warm professional',
    useCaseTags: JSON.stringify(['marketing', 'narration']),
    sourceType: 'catalogue',
    consentStatus: 'provider_catalogue',
    enabled: true,
    ...overrides,
  }
}

function payload(overrides: Partial<WorkerJobData> = {}): WorkerJobData {
  return {
    jobId: 'job-1',
    appSlug: 'marketing-app',
    capability: 'tts',
    prompt: 'Speak the approved message.',
    traceId: 'trace-1',
    input: {},
    metadata: {},
    executionProfile: 'external_app',
    ...overrides,
  }
}

describe('governed TTS catalogue selection', () => {
  const request = GovernedTtsRequestSchema.parse({
    text: 'Speak.',
    intendedUse: 'marketing',
    language: 'en',
    locale: 'en-ZA',
    accent: 'south-african',
    style: 'warm',
  })

  it('selects an enabled provider/model/use-compatible catalogue voice', () => {
    const selected = selectCatalogueVoice({
      voices: [
        voice({ voiceId: 'wrong-provider', provider: 'genx' }),
        voice({ voiceId: 'wrong-model', compatibleModels: JSON.stringify(['other-model']) }),
        voice({ voiceId: 'wrong-use', useCaseTags: JSON.stringify(['education']) }),
        voice({ voiceId: 'selected' }),
      ],
      provider: 'together',
      selectedModel: 'canopylabs/orpheus-3b-0.1-ft',
      request,
    })
    expect(selected?.voiceId).toBe('selected')
  })

  it('ranks exact model and locale evidence deterministically', () => {
    const selected = selectCatalogueVoice({
      voices: [
        voice({ id: 'b', voiceId: 'zeta', model: '', locale: 'en-ZA' }),
        voice({ id: 'a', voiceId: 'alpha', model: 'canopylabs/orpheus-3b-0.1-ft', locale: 'en-ZA' }),
      ],
      provider: 'together',
      selectedModel: 'canopylabs/orpheus-3b-0.1-ft',
      request,
    })
    expect(selected?.voiceId).toBe('alpha')
    expect(voiceSupportsModel(selected!, 'canopylabs/orpheus-3b-0.1-ft')).toBe(true)
  })

  it('fails closed when catalogue rights or availability are not verified', () => {
    for (const candidate of [
      voice({ enabled: false }),
      voice({ sourceType: 'user_recording' }),
      voice({ consentStatus: 'pending' }),
    ]) {
      expect(selectCatalogueVoice({
        voices: [candidate],
        provider: 'together',
        selectedModel: 'canopylabs/orpheus-3b-0.1-ft',
        request,
      })).toBeNull()
    }
  })
})

describe('governed TTS worker request authority', () => {
  it('requires server-owned governed metadata for external app jobs', () => {
    expect(() => readGovernedTtsRequest(payload())).toThrow('Governed TTS metadata is missing or invalid')
    const request = readGovernedTtsRequest(payload({
      metadata: {
        governedTtsContractVersion: 1,
        governedTtsRequest: { text: 'Approved.', intendedUse: 'narration', speed: 1, outputFormat: 'wav' },
      },
    }))
    expect(request.text).toBe('Approved.')
    expect(request.intendedUse).toBe('narration')
  })

  it('allows safe internal outcome fields but never raw provider voice authority', () => {
    expect(readGovernedTtsRequest(payload({
      executionProfile: 'internal_dashboard',
      input: { language: 'en', style: 'warm', outputFormat: 'wav' },
    }))).toMatchObject({ text: 'Speak the approved message.', language: 'en', style: 'warm' })

    expect(() => readGovernedTtsRequest(payload({
      executionProfile: 'internal_dashboard',
      input: { voice: 'tara' },
    }))).toThrow('input.voice is not allowed')
  })

  it('never exposes the internal provider voice identifier in public evidence', () => {
    const resolution: GovernedVoiceResolution = {
      provider: 'together',
      model: 'canopylabs/orpheus-3b-0.1-ft',
      providerVoiceId: 'tara',
      providerVoiceReferenceHash: '1234567890abcdef12345678',
      source: 'together_model_default',
      voiceProfileId: null,
      catalogueVoiceRecordId: null,
      language: 'en',
      locale: '',
      intendedUse: 'narration',
    }
    const evidence = publicGovernedVoiceEvidence(resolution)
    expect(evidence).not.toHaveProperty('providerVoiceId')
    expect(evidence.providerVoiceReferenceHash).toHaveLength(24)
  })
})

describe('governed TTS persisted profile and handler contract', () => {
  it('loads only an exact same-app completed profile artifact and rechecks current rights', () => {
    expect(resolverSource).toContain('id: voiceProfileArtifactId(appSlug, voiceProfileId)')
    expect(resolverSource).toContain('appSlug,')
    expect(resolverSource).toContain("type: 'document'")
    expect(resolverSource).toContain("subType: 'voice_profile'")
    expect(resolverSource).toContain("status: 'completed'")
    expect(resolverSource).toContain('ReusableVoiceProfileSchema.parse')
    expect(resolverSource).toContain('evaluateVoiceProfileRights({ profile, intendedUse: request.intendedUse })')
  })

  it('requires selected-provider/model compatibility and defaults only for Together', () => {
    expect(resolverSource).toContain("binding.provider !== input.provider")
    expect(resolverSource).toContain('binding.selectedModel !== input.selectedModel')
    expect(resolverSource).toContain("input.provider === 'genx'")
    expect(resolverSource).toContain('is not registered for the current GenX transport and model')
    expect(resolverSource).toContain("if (input.provider === 'together')")
    expect(resolverSource).toContain('resolveTogetherVoice(input.selectedModel)')
    expect(resolverSource).not.toContain("input.provider === 'deepinfra'")
  })

  it('wraps only the existing Together and GenX handlers and activates them at worker startup', () => {
    expect(registrationSource).toContain("const togetherLegacy = EXECUTOR_HANDLERS['together.tts']")
    expect(registrationSource).toContain("const genxLegacy = EXECUTOR_HANDLERS['genx.tts']")
    expect(registrationSource).toContain("EXECUTOR_HANDLERS['together.tts'] = createGovernedTtsHandler('together', togetherLegacy)")
    expect(registrationSource).toContain("EXECUTOR_HANDLERS['genx.tts'] = createGovernedTtsHandler('genx', genxLegacy)")
    expect(registrationSource).not.toContain("EXECUTOR_HANDLERS['deepinfra.tts']")
    expect(workerSource).toContain("import './providers/governed-tts-handler-registration.js'")
  })

  it('runs deterministic fixture TTS through the governed resolver with a fixture-only catalogue voice', () => {
    expect(fixtureExecutorSource).toContain("if (capability === 'tts')")
    expect(fixtureExecutorSource).toContain('await resolveGovernedVoice')
    expect(fixtureExecutorSource).toContain('publicGovernedVoiceEvidence')
    expect(fixtureExecutorSource).toContain('governedTtsVoice')
    expect(fixtureBootstrapSource).toContain("voiceId: 'fixture-genx-narrator-v1'")
    expect(fixtureBootstrapSource).toContain("evidenceSource: 'local_fixture'")
    expect(fixtureBootstrapSource).toContain('liveProviderProof: false')
  })

  it('persists safe voice evidence before spend and sanitizes provider voice IDs from artifacts', () => {
    expect(registrationSource.indexOf('await persistVoiceResolution')).toBeLessThan(registrationSource.indexOf('await legacyHandler'))
    expect(registrationSource).toContain('delete metadata.voice')
    expect(registrationSource).toContain('delete metadata.voiceProfileId')
    expect(registrationSource).toContain('governedTtsVoice: evidence')
    expect(registrationSource).toContain('providerVoiceReferenceHash')
    expect(registrationSource).not.toContain('governedTtsVoice: resolution')
  })
})
