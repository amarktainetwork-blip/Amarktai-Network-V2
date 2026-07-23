import { describe, expect, it } from 'vitest'
import { CAPABILITY_ACTIVATION_BLOCKERS, getCapabilityActivationBlocker } from '../packages/core/src/capability-activation-blockers.ts'
import { normalizeEffectiveRuntimeTruth } from '../packages/core/src/effective-runtime-truth.ts'
import { getRuntimeTruth } from '../packages/core/src/runtime-truth.ts'

const EXPECTED_ACTIVATION_BLOCKERS = [
  'object_detection',
  'image_segmentation',
  'depth_estimation',
  'keypoint_detection',
  'zero_shot_object_detection',
  'mask_generation',
  'visual_document_retrieval',
  'video_classification',
  'audio_classification',
  'voice_activity_detection',
  'voice_clone',
  'voice_conversion',
  'text_to_audio',
  'lip_sync',
  'avatar_generation',
] as const

describe('capability activation blockers', () => {
  it('covers only the non-deferred capabilities that need live schema or internal executor activation', () => {
    expect(CAPABILITY_ACTIVATION_BLOCKERS.map((item) => item.capability)).toEqual(EXPECTED_ACTIVATION_BLOCKERS)
    expect(new Set(CAPABILITY_ACTIVATION_BLOCKERS.map((item) => item.blockerCode)).size).toBe(CAPABILITY_ACTIVATION_BLOCKERS.length)
    expect(CAPABILITY_ACTIVATION_BLOCKERS.every((item) => item.requiredEvidence.length >= 4)).toBe(true)
    expect(CAPABILITY_ACTIVATION_BLOCKERS.some((item) => item.capability.startsWith('adult_'))).toBe(false)
    expect(CAPABILITY_ACTIVATION_BLOCKERS.some((item) => item.capability === 'text_to_3d' || item.capability === 'image_to_3d')).toBe(false)
  })

  it('projects precise blockers without claiming executors, release candidacy, or live proof', () => {
    const truth = normalizeEffectiveRuntimeTruth(getRuntimeTruth())
    for (const capability of EXPECTED_ACTIVATION_BLOCKERS) {
      const blocker = getCapabilityActivationBlocker(capability)!
      const row = truth.capabilities.find((item) => item.capability === capability)!
      const readiness = truth.releaseReadiness.find((item) => item.capability === capability)!
      const activationReason = `activation:${blocker.blockerCode}`

      expect(row.classification).toBe('BLOCKED')
      expect(row.executableNow).toBe(false)
      expect(row.liveProven).toBe(false)
      expect(row.remainingWork).toEqual([activationReason])
      expect(row.blockedReasons).toContain(activationReason)
      expect(row.operationalState).toBe(blocker.stage === 'staging_live_discovery' ? 'account_access_required' : 'contract_unknown')
      expect(readiness.releaseCandidate).toBe(false)
      expect(readiness.executorPresent).toBe(false)
      expect(readiness.readyForDashboardExecution).toBe(false)
      expect(readiness.blockedReasons).toEqual([activationReason])
      expect(truth.releaseCandidateCapabilities).not.toContain(capability)
    }
  })

  it('does not disturb canonical internal executor truth', () => {
    const truth = normalizeEffectiveRuntimeTruth(getRuntimeTruth())
    const imageUpscale = truth.capabilities.find((item) => item.capability === 'image_upscale')!
    expect(imageUpscale.executorRegistered).toBe(true)
    expect(imageUpscale.executorRegistrationIds).toContain('internal:internal.ffmpeg.image-upscale')
    expect(imageUpscale.eligibleProviders).toEqual([])
    expect(imageUpscale.eligibleModels).toEqual([])
  })
})
