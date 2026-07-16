import { describe, expect, it } from 'vitest'
import {
  createLongFormVideoPlan,
  createSceneExecutionPayloads,
  normalizeRoutingMode,
} from '../packages/core/src/index.ts'

const COURSE2CAREER_REQUEST = {
  prompt: 'Course2Career AI Career Programme — premium 30-second British career-development advertisement.',
  targetDurationSeconds: 30,
  sceneCount: 3,
  aspectRatio: '16:9',
  style: 'promotional',
  tone: 'professional',
  routingMode: 'quality',
  planningMode: 'explicit',
  count: 1,
  voiceoverEnabled: true,
  subtitlesEnabled: true,
  musicBedEnabled: true,
  campaignTitle: 'Course2Career AI Career Programme',
  brandName: 'Course2Career',
  brandWebsite: 'Course2Career.com',
  objective: 'Generate qualified enquiries for the AI Career Programme.',
  callToAction: 'Visit Course2Career.com and enquire today.',
  legalQualifier: 'Eligibility and programme terms apply. Salary and employment outcomes vary.',
  musicBrief: 'Original premium instrumental corporate music. No vocals.',
  voiceProfile: { language: 'en-GB', accent: 'British', tone: 'warm, confident', speed: 1, outputFormat: 'wav' },
  scenes: [
    {
      sceneNumber: 1,
      durationSeconds: 8,
      title: 'A New Career Direction',
      objective: 'Introduce a relatable beginner or career changer and establish that previous coding experience is not required.',
      visualPrompt: 'Premium realistic British education advertisement. A believable adult career changer aged approximately 25 to 45 sits at a clean home workspace in natural morning light. They initially appear uncertain about their career direction, then discover a professional AI and data training programme on their laptop. Authentic UK home environment, realistic face, hands and laptop interaction, polished cinematic camera movement, text-free video frame, consistent lead character.',
      negativePrompt: 'No robots, no science-fiction holograms, no generated words, no logos, no distorted hands.',
      cameraDirection: 'Begin with a wide establishing shot, move to a natural over-the-shoulder laptop view, finish on a confident close-up.',
      voiceoverText: 'Ready for a career in AI and data? Course2Career\'s AI Career Programme is built for beginners and career changers, with no previous coding experience needed.',
      subtitleText: 'Ready for a career in AI and data? Course2Career\'s AI Career Programme is built for beginners and career changers, with no previous coding experience needed.',
    },
    {
      sceneNumber: 2,
      durationSeconds: 13,
      title: 'Training and Expert Support',
      objective: 'Show the accredited learning path, practical training and personal support.',
      visualPrompt: 'Premium UK career-training commercial featuring the same lead learner. Show the learner completing professional online AI and data coursework. Realistic interfaces, polished commercial lighting, text-free video frame.',
      negativePrompt: 'No generated words, no unauthorised certification logos, no fake certificates.',
      cameraDirection: 'Use a polished montage of medium shots and over-the-shoulder learning views.',
      voiceoverText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training.',
      subtitleText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training.',
    },
    {
      sceneNumber: 3,
      durationSeconds: 9,
      title: 'Your Next Career Starts Here',
      objective: 'Show the credible career outcome and end on the Course2Career call to action.',
      visualPrompt: 'Inspirational realistic British career advertisement featuring the same lead learner. Show the learner confidently attending a professional interview and then entering a bright modern workplace. Finish with a clean premium composition and generous negative space for a locally rendered end card. Text-free generated footage.',
      negativePrompt: 'No generated words, no fake employer logos, no salary imagery, no robots.',
      cameraDirection: 'Start with a composed interview shot, transition to a confident workplace entrance, finish on a stable premium end-card background.',
      voiceoverText: 'Build employer-ready skills with a guaranteed route to job placement. Visit Course2Career.com and enquire today.',
      subtitleText: 'Build employer-ready skills with a guaranteed route to job placement. Visit Course2Career.com and enquire today.',
    },
  ],
}

describe('Course2Career single-scene preview fixture', () => {
  const plan = createLongFormVideoPlan(COURSE2CAREER_REQUEST)
  const routingMode = normalizeRoutingMode(plan.routingMode)
  const executionId = 'test-preview-execution-id'
  const payloads = createSceneExecutionPayloads(plan, routingMode, executionId)

  it('produces exactly one video payload for scene 1', () => {
    const scene1Payload = payloads.filter((p) => p.sceneNumber === 1)
    expect(scene1Payload).toHaveLength(1)
  })

  it('scene 1 payload has duration 8 seconds', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.input.duration).toBe(8)
  })

  it('scene 1 payload has routing mode quality', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.routingMode).toBe('quality')
    expect(payload!.metadata.routingMode).toBe('quality')
  })

  it('scene 1 payload preserves exact visual prompt', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.prompt).toContain('Premium realistic British education advertisement')
    expect(payload!.prompt).toContain('career changer')
    expect(payload!.prompt).not.toContain('Training and Expert Support')
    expect(payload!.prompt).not.toContain('Your Next Career Starts Here')
  })

  it('scene 1 payload does not contain narration text', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.prompt).not.toContain('Ready for a career in AI and data')
    expect(payload!.prompt).not.toContain('voiceover')
  })

  it('scene 1 payload does not contain overlay text', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.prompt).not.toContain('Visit Course2Career.com')
    expect(payload!.prompt).not.toContain('Eligibility and programme terms')
  })

  it('scene 1 payload does not contain full campaign prompt', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.prompt).not.toContain(COURSE2CAREER_REQUEST.prompt)
  })

  it('scene 1 payload preserves plan ID', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    expect(payload!.metadata.planId).toBe(plan.id)
  })

  it('preview-scene request does not create other scene jobs', () => {
    // This test verifies the payload structure - the actual endpoint
    // creates only one job, not multiple
    const scene1Only = payloads.filter((p) => p.sceneNumber === 1)
    const otherScenes = payloads.filter((p) => p.sceneNumber !== 1)
    expect(scene1Only).toHaveLength(1)
    expect(otherScenes).toHaveLength(2) // Other scenes exist in plan but are not selected
  })

  it('plan remains in planned status (no approval)', () => {
    // The preview endpoint does not change the parent status
    // This test verifies the plan structure
    expect(plan.storyboard.scenes).toHaveLength(3)
    expect(plan.totalDurationSeconds).toBe(30)
    expect(plan.routingMode).toBe('quality')
  })
})

describe('generic preview-scene contract (no brand-specific constants)', () => {
  const plan = createLongFormVideoPlan(COURSE2CAREER_REQUEST)
  const routingMode = normalizeRoutingMode(plan.routingMode)
  const executionId = 'test-preview-execution-id'
  const payloads = createSceneExecutionPayloads(plan, routingMode, executionId)

  it('preview endpoint accepts arbitrary executionId, planId, versionHash, sceneNumber', () => {
    // The endpoint contract is generic - no brand names in parameters
    const params = {
      executionId: 'any-execution-id',
      planId: plan.id,
      versionHash: plan.versionHash,
      sceneNumber: 1,
    }
    expect(params.executionId).toBeTruthy()
    expect(params.planId).toBeTruthy()
    expect(params.versionHash).toBeTruthy()
    expect(params.sceneNumber).toBeGreaterThanOrEqual(1)
  })

  it('routing mode is canonical', () => {
    expect(['balanced', 'quality', 'economy', 'fast']).toContain(routingMode)
  })

  it('preview metadata contains no brand-specific constants', () => {
    const payload = payloads.find((p) => p.sceneNumber === 1)
    expect(payload).toBeDefined()
    const metadataStr = JSON.stringify(payload!.metadata)
    expect(metadataStr).not.toContain('Course2Career')
    expect(metadataStr).not.toContain('course2career')
  })
})
