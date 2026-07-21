import { describe, expect, it } from 'vitest'
import {
  createLongFormVideoPlan,
  validatePlanCompleteness,
  normalizeRoutingMode,
  isValidRoutingMode,
  validateLongFormVideoRequest,
  VALID_ROUTING_MODES,
  ROUTING_MODE_ALIASES,
} from '../packages/core/src/index.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(overrides = {}) {
  return {
    prompt: 'Test prompt for a premium video that is long enough to pass validation.',
    targetDurationSeconds: 30,
    sceneCount: 2,
    style: 'cinematic',
    tone: 'professional',
    voiceoverEnabled: false,
    subtitlesEnabled: false,
    musicBedEnabled: false,
    routingMode: 'balanced',
    ...overrides,
  }
}

function makeExplicitRequest(overrides = {}) {
  return {
    prompt: 'Course2Career AI Career Programme premium 30-second British career-development advertisement.',
    targetDurationSeconds: 30,
    sceneCount: 3,
    style: 'cinematic',
    tone: 'professional',
    routingMode: 'quality',
    planningMode: 'explicit',
    scenes: [
      {
        sceneNumber: 1,
        durationSeconds: 8,
        title: 'A New Career Direction',
        objective: 'Introduce a relatable beginner and establish that previous coding experience is not required.',
        visualPrompt: 'Premium realistic British education advertisement. A believable adult career changer aged approximately 25 to 45 sits at a clean home workspace in natural morning light. They initially appear uncertain about their career direction, then discover a professional AI and data training programme on their laptop. Authentic UK home environment, realistic face, hands and laptop interaction, polished cinematic camera movement, text-free video frame.',
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
        visualPrompt: 'Premium UK career-training commercial featuring the same lead learner, with consistent appearance and wardrobe. Show the learner completing professional online AI and data coursework, analysing a clean business data dashboard, working through practical exercises and speaking with a supportive expert tutor by video call. Realistic interfaces, modern British home-learning and professional environments, polished commercial lighting, text-free video frame.',
        negativePrompt: 'No generated words, no unauthorised certification logos, no fake certificates, no floating interfaces.',
        cameraDirection: 'Use a polished montage of medium shots, over-the-shoulder learning views, a tutor-call close-up and a smooth tracking shot.',
        voiceoverText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training, expert tutor support and recruitment guidance.',
        subtitleText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training, expert tutor support and recruitment guidance.',
      },
      {
        sceneNumber: 3,
        durationSeconds: 9,
        title: 'Your Next Career Starts Here',
        objective: 'Show the credible career outcome and end on the Course2Career call to action.',
        visualPrompt: 'Inspirational realistic British career advertisement featuring the same lead learner with consistent identity and wardrobe. Show the learner confidently attending a professional interview and then entering a bright modern workplace associated with data analysis, responsible AI operations and business technology. Finish with a clean premium composition and generous negative space for a locally rendered Course2Career end card. Credible achievement, professional commercial cinematography, realistic workplace, text-free generated footage.',
        negativePrompt: 'No generated words, no fake employer logos, no salary imagery, no guaranteed employment imagery, no robots.',
        cameraDirection: 'Start with a composed interview shot, transition to a confident workplace entrance, finish on a stable premium end-card background.',
        voiceoverText: 'Build employer-ready skills with a guaranteed route to job placement on completion, or your money back, subject to terms. Visit Course2Career.com and enquire today.',
        subtitleText: 'Build employer-ready skills with a guaranteed route to job placement on completion, or your money back, subject to terms. Visit Course2Career.com and enquire today.',
        overlays: [
          { id: 'overlay_cta_3', sceneNumber: 3, startSeconds: 4, endSeconds: 9, type: 'cta', text: 'Visit Course2Career.com and enquire today', position: 'bottom_center', emphasis: 'bold', legal: false },
          { id: 'overlay_legal_3', sceneNumber: 3, startSeconds: 0, endSeconds: 9, type: 'legal', text: 'Eligibility and programme terms apply. Salary and employment outcomes vary.', position: 'bottom_right', emphasis: 'normal', legal: true },
          { id: 'overlay_url_3', sceneNumber: 3, startSeconds: 4, endSeconds: 9, type: 'url', text: 'Course2Career.com', position: 'bottom_center', emphasis: 'bold', legal: false },
        ],
      },
    ],
    callToAction: 'Visit Course2Career.com and enquire today.',
    legalQualifier: 'Eligibility and programme terms apply. Salary and employment outcomes vary.',
    brandName: 'Course2Career',
    brandWebsite: 'Course2Career.com',
    ...overrides,
  }
}

// ── Canonical Routing Modes ───────────────────────────────────────────────────

describe('canonical routing modes', () => {
  it('defines exactly four canonical modes', () => {
    expect(VALID_ROUTING_MODES).toEqual(['balanced', 'quality', 'economy', 'fast'])
  })

  it('maps premium to quality alias', () => {
    expect(normalizeRoutingMode('premium')).toBe('quality')
    expect(isValidRoutingMode('premium')).toBe(true)
  })

  it('maps budget to economy alias', () => {
    expect(normalizeRoutingMode('budget')).toBe('economy')
    expect(isValidRoutingMode('budget')).toBe(true)
  })

  it('passes through canonical values unchanged', () => {
    for (const mode of VALID_ROUTING_MODES) {
      expect(normalizeRoutingMode(mode)).toBe(mode)
      expect(isValidRoutingMode(mode)).toBe(true)
    }
  })

  it('defaults to balanced for unknown values', () => {
    expect(normalizeRoutingMode('experimental')).toBe('balanced')
    expect(normalizeRoutingMode('invalid')).toBe('balanced')
    expect(normalizeRoutingMode(undefined)).toBe('balanced')
    expect(normalizeRoutingMode(42)).toBe('balanced')
  })

  it('rejects unknown values in isValidRoutingMode', () => {
    expect(isValidRoutingMode('experimental')).toBe(false)
    expect(isValidRoutingMode('invalid')).toBe(false)
  })

  it('normalizes aliases at the schema level', () => {
    const req = validateLongFormVideoRequest({
      prompt: 'Test prompt for routing mode validation at schema level.',
      targetDurationSeconds: 30,
      sceneCount: 2,
      routingMode: 'premium',
    })
    expect(req.routingMode).toBe('quality')
  })

  it('normalizes budget alias at the schema level', () => {
    const req = validateLongFormVideoRequest({
      prompt: 'Test prompt for routing mode validation at schema level.',
      targetDurationSeconds: 30,
      sceneCount: 2,
      routingMode: 'budget',
    })
    expect(req.routingMode).toBe('economy')
  })

  it('quality routing mode never silently becomes balanced', () => {
    const req = validateLongFormVideoRequest({
      prompt: 'Test prompt for routing mode validation at schema level.',
      targetDurationSeconds: 30,
      sceneCount: 2,
      routingMode: 'quality',
    })
    expect(req.routingMode).toBe('quality')
  })
})

// ── Explicit Scene Preservation ───────────────────────────────────────────────

describe('explicit planning mode', () => {
  it('preserves exact scene visual prompts', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.storyboard.scenes[0].visualPrompt).toContain('Premium realistic British education advertisement')
    expect(plan.storyboard.scenes[1].visualPrompt).toContain('Premium UK career-training commercial')
    expect(plan.storyboard.scenes[2].visualPrompt).toContain('Inspirational realistic British career advertisement')
  })

  it('preserves exact voiceover text', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.storyboard.scenes[0].voiceoverText).toContain('Ready for a career in AI and data')
    expect(plan.storyboard.scenes[1].voiceoverText).toContain('Complete six accredited CompTIA courses')
    expect(plan.storyboard.scenes[2].voiceoverText).toContain('Build employer-ready skills')
  })

  it('preserves exact subtitle text', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.storyboard.scenes[0].subtitleText).toContain('Ready for a career in AI and data')
    expect(plan.storyboard.scenes[2].subtitleText).toContain('Visit Course2Career.com')
  })

  it('preserves exact CTA', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.callToAction).toBe('Visit Course2Career.com and enquire today.')
  })

  it('preserves exact legal qualifier', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.legalQualifier).toBe('Eligibility and programme terms apply. Salary and employment outcomes vary.')
  })

  it('preserves exact overlays', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    const scene3Overlays = plan.storyboard.scenes[2].overlays ?? []
    expect(scene3Overlays.some((o) => o.text.includes('Course2Career.com'))).toBe(true)
    expect(scene3Overlays.some((o) => o.legal === true)).toBe(true)
  })

  it('preserves exact durations', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.storyboard.scenes[0].durationSeconds).toBe(8)
    expect(plan.storyboard.scenes[1].durationSeconds).toBe(13)
    expect(plan.storyboard.scenes[2].durationSeconds).toBe(9)
    expect(plan.totalDurationSeconds).toBe(30)
  })

  it('preserves exact brand website', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.brandWebsite).toBe('Course2Career.com')
  })

  it('preserves routing mode as quality', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.routingMode).toBe('quality')
  })

  it('sets providerCallsStarted to false', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.providerCallsStarted).toBe(false)
  })

  it('sets planningMode to explicit', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.planningMode).toBe('explicit')
  })

  it('generates a version hash', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.versionHash).toBeTruthy()
    expect(plan.versionHash.length).toBe(16)
  })

  it('produces deterministic version hash for same input', () => {
    const plan1 = createLongFormVideoPlan(makeExplicitRequest())
    const plan2 = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan1.versionHash).toBe(plan2.versionHash)
  })
})

// ── Automatic Planning Mode ───────────────────────────────────────────────────

describe('automatic planning mode', () => {
  it('generates unique scene objectives', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 3 }))
    const objectives = plan.storyboard.scenes.map((s) => s.objective)
    expect(new Set(objectives).size).toBe(3)
  })

  it('generates unique visual prompts', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 3 }))
    const prompts = plan.storyboard.scenes.map((s) => s.visualPrompt)
    const unique = new Set(prompts.map((p) => p.slice(0, 50)))
    expect(unique.size).toBe(3)
  })

  it('does not copy the full parent prompt into any scene', () => {
    const longPrompt = 'This is a very long campaign prompt that describes an entire marketing campaign in detail with many words and specifics about the brand.'
    const plan = createLongFormVideoPlan(makeRequest({ prompt: longPrompt, sceneCount: 3 }))
    for (const scene of plan.storyboard.scenes) {
      expect(scene.visualPrompt).not.toBe(longPrompt)
      expect(scene.visualPrompt).not.toContain(longPrompt)
    }
  })

  it('does not generate narration containing production instructions', () => {
    const plan = createLongFormVideoPlan(makeRequest({ voiceoverEnabled: true, sceneCount: 3 }))
    for (const scene of plan.storyboard.scenes) {
      if (scene.voiceoverText) {
        expect(scene.voiceoverText).not.toMatch(/professional narration for scene \d/)
        expect(scene.voiceoverText).not.toContain('create a video')
        expect(scene.voiceoverText).not.toContain('voiceover')
        expect(scene.voiceoverText).not.toContain('subtitles')
      }
    }
  })

  it('distributes duration correctly', () => {
    const plan = createLongFormVideoPlan(makeRequest({ targetDurationSeconds: 30, sceneCount: 3 }))
    const total = plan.storyboard.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)
    expect(total).toBe(30)
  })

  it('generates negative prompts for each scene', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 2 }))
    for (const scene of plan.storyboard.scenes) {
      expect(scene.negativePrompt).toBeTruthy()
      expect(scene.negativePrompt.length).toBeGreaterThan(10)
    }
  })

  it('generates camera directions for each scene', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 3 }))
    for (const scene of plan.storyboard.scenes) {
      expect(scene.cameraDirection).toBeTruthy()
    }
  })

  it('sets planningMode to automatic', () => {
    const plan = createLongFormVideoPlan(makeRequest())
    expect(plan.planningMode).toBe('automatic')
  })
})

// ── Duplicate and Near-Duplicate Rejection ────────────────────────────────────

describe('duplicate scene rejection', () => {
  it('rejects duplicate scene objectives in explicit mode', () => {
    expect(() => createLongFormVideoPlan(makeExplicitRequest({
      scenes: [
        { sceneNumber: 1, durationSeconds: 15, title: 'Scene 1', objective: 'Same objective', visualPrompt: 'First unique visual prompt for scene one that is long enough.', voiceoverText: 'First voiceover.' },
        { sceneNumber: 2, durationSeconds: 15, title: 'Scene 2', objective: 'Same objective', visualPrompt: 'Second unique visual prompt for scene two that is long enough.', voiceoverText: 'Second voiceover.' },
      ],
    }))).toThrow('Each scene must have a unique objective')
  })

  it('rejects near-duplicate visual prompts in explicit mode', () => {
    const sharedPrompt = 'This is the exact same visual prompt that is shared between two scenes and is long enough to trigger detection.'
    expect(() => createLongFormVideoPlan(makeExplicitRequest({
      scenes: [
        { sceneNumber: 1, durationSeconds: 15, title: 'Scene 1', objective: 'First objective', visualPrompt: sharedPrompt, voiceoverText: 'First voiceover.' },
        { sceneNumber: 2, durationSeconds: 15, title: 'Scene 2', objective: 'Second objective', visualPrompt: sharedPrompt, voiceoverText: 'Second voiceover.' },
      ],
    }))).toThrow('visual prompt contains Scene')
  })
})

// ── Duration Validation ───────────────────────────────────────────────────────

describe('exact duration totals', () => {
  it('rejects when scene durations do not match target', () => {
    expect(() => createLongFormVideoPlan(makeExplicitRequest({
      scenes: [
        { sceneNumber: 1, durationSeconds: 10, title: 'Scene 1', objective: 'First objective', visualPrompt: 'First unique visual prompt for scene one that is long enough.', voiceoverText: 'First voiceover.' },
        { sceneNumber: 2, durationSeconds: 10, title: 'Scene 2', objective: 'Second objective', visualPrompt: 'Second unique visual prompt for scene two that is long enough.', voiceoverText: 'Second voiceover.' },
      ],
    }))).toThrow('Scene durations total 20 but target is 30')
  })
})

// ── CTA and Legal Preservation ────────────────────────────────────────────────

describe('CTA and legal qualifier preservation', () => {
  it('preserves CTA in plan', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.callToAction).toBe('Visit Course2Career.com and enquire today.')
  })

  it('preserves legal qualifier in plan', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.legalQualifier).toBe('Eligibility and programme terms apply. Salary and employment outcomes vary.')
  })
})

// ── URL Preservation ──────────────────────────────────────────────────────────

describe('exact URL preservation', () => {
  it('preserves brand website exactly', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    expect(plan.brandWebsite).toBe('Course2Career.com')
  })
})

// ── Plan-Only Zero Media Queue ────────────────────────────────────────────────

describe('plan-only zero media queue', () => {
  it('sets providerCallsStarted to false', () => {
    const plan = createLongFormVideoPlan(makeRequest())
    expect(plan.providerCallsStarted).toBe(false)
  })

  it('sets reasonIfBlocked indicating approval required', () => {
    const plan = createLongFormVideoPlan(makeRequest())
    expect(plan.reasonIfBlocked).toContain('approval')
  })

  it('does not create any queue jobs', () => {
    const plan = createLongFormVideoPlan(makeRequest())
    expect(plan.executableNow).toBe(false)
  })
})

// ── Plan Validation ───────────────────────────────────────────────────────────

describe('plan completeness validation', () => {
  it('validates a complete plan', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    const result = validatePlanCompleteness(plan)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects duplicate objectives', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 2 }))
    plan.storyboard.scenes[1] = { ...plan.storyboard.scenes[0], sceneNumber: 2 }
    const result = validatePlanCompleteness(plan)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate scene objectives'))).toBe(true)
  })

  it('detects duplicate visual prompts', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 2 }))
    plan.storyboard.scenes[1] = { ...plan.storyboard.scenes[0], sceneNumber: 2, objective: 'Different objective' }
    plan.storyboard.scenes[1].visualPrompt = plan.storyboard.scenes[0].visualPrompt
    const result = validatePlanCompleteness(plan)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })

  it('detects when scene prompt contains full parent prompt', () => {
    const plan = createLongFormVideoPlan(makeRequest({ sceneCount: 2 }))
    plan.prompt = 'This is a very long parent prompt that should not appear in any scene visual prompt at all.'
    plan.storyboard.scenes[0].visualPrompt = plan.prompt
    const result = validatePlanCompleteness(plan)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('full parent prompt'))).toBe(true)
  })
})

// ── Regression: Old Placeholder Behavior ──────────────────────────────────────

describe('regression: old placeholder behavior cannot be produced', () => {
  it('never produces "Scene N: Create a premium 30-second British career-developm" style subtitles', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    for (const scene of plan.storyboard.scenes) {
      if (scene.subtitleText) {
        expect(scene.subtitleText).not.toMatch(/^Scene \d: Create a premium/)
      }
    }
  })

  it('never produces narration like "professional narration for scene N: [full prompt]"', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    for (const scene of plan.storyboard.scenes) {
      if (scene.voiceoverText) {
        expect(scene.voiceoverText).not.toMatch(/professional narration for scene \d/)
      }
    }
  })

  it('never copies the full parent prompt into visual prompts', () => {
    const longPrompt = 'This is a complete campaign brief with many details about the brand, audience, objectives, legal requirements, pricing, and call to action that would previously have been copied into every scene.'
    const plan = createLongFormVideoPlan(makeRequest({ prompt: longPrompt, sceneCount: 3 }))
    for (const scene of plan.storyboard.scenes) {
      expect(scene.visualPrompt).not.toContain(longPrompt)
    }
  })
})

// ── Overlay Timeline Validation ───────────────────────────────────────────────

describe('overlay timeline validation', () => {
  it('rejects overlays that reference wrong scene', () => {
    expect(() => createLongFormVideoPlan(makeExplicitRequest({
      scenes: [
        {
          sceneNumber: 1, durationSeconds: 8, title: 'Scene 1', objective: 'First objective',
          visualPrompt: 'First unique visual prompt for scene one that is long enough.',
          voiceoverText: 'First voiceover text.',
          overlays: [{ id: 'bad', sceneNumber: 2, startSeconds: 0, endSeconds: 5, type: 'text', text: 'Wrong scene', position: 'bottom_center', emphasis: 'normal', legal: false }],
        },
        { sceneNumber: 2, durationSeconds: 13, title: 'Scene 2', objective: 'Second objective', visualPrompt: 'Second unique visual prompt for scene two that is long enough.', voiceoverText: 'Second voiceover text.' },
        { sceneNumber: 3, durationSeconds: 9, title: 'Scene 3', objective: 'Third objective', visualPrompt: 'Third unique visual prompt for scene three that is long enough.', voiceoverText: 'Third voiceover text.' },
      ],
    }))).toThrow('references scene 2 but is defined in scene 1')
  })

  it('rejects overlays that exceed scene duration', () => {
    expect(() => createLongFormVideoPlan(makeExplicitRequest({
      scenes: [
        {
          sceneNumber: 1, durationSeconds: 8, title: 'Scene 1', objective: 'First objective',
          visualPrompt: 'First unique visual prompt for scene one that is long enough.',
          voiceoverText: 'First voiceover text.',
          overlays: [{ id: 'toolong', sceneNumber: 1, startSeconds: 0, endSeconds: 20, type: 'text', text: 'Too long', position: 'bottom_center', emphasis: 'normal', legal: false }],
        },
        { sceneNumber: 2, durationSeconds: 13, title: 'Scene 2', objective: 'Second objective', visualPrompt: 'Second unique visual prompt for scene two that is long enough.', voiceoverText: 'Second voiceover text.' },
        { sceneNumber: 3, durationSeconds: 9, title: 'Scene 3', objective: 'Third objective', visualPrompt: 'Third unique visual prompt for scene three that is long enough.', voiceoverText: 'Third voiceover text.' },
      ],
    }))).toThrow('end time 20s exceeds scene 1 duration 8s')
  })
})

// ── Provider/Model Override Rejection ─────────────────────────────────────────

describe('provider/model override rejection', () => {
  it('the plan schema does not accept provider or model fields', () => {
    const plan = createLongFormVideoPlan(makeRequest())
    expect((plan as any).provider).toBeUndefined()
    expect((plan as any).model).toBeUndefined()
    expect((plan as any).selectedProvider).toBeUndefined()
    expect((plan as any).selectedModel).toBeUndefined()
  })
})

// ── Voiceover Narration Validation ────────────────────────────────────────────

describe('narration validation', () => {
  it('automatic voiceover does not contain planning instructions', () => {
    const plan = createLongFormVideoPlan(makeRequest({ voiceoverEnabled: true, sceneCount: 3 }))
    for (const scene of plan.storyboard.scenes) {
      if (scene.voiceoverText) {
        const lower = scene.voiceoverText.toLowerCase()
        expect(lower).not.toContain('scene 1')
        expect(lower).not.toContain('scene 2')
        expect(lower).not.toContain('scene 3')
        expect(lower).not.toContain('create a video')
        expect(lower).not.toContain('voiceover')
        expect(lower).not.toContain('subtitles')
        expect(lower).not.toContain('music brief')
      }
    }
  })
})

// ── Clean Video Prompts ──────────────────────────────────────────────────────

describe('clean video prompts', () => {
  it('video prompts do not contain narration, subtitle, pricing, CTA or legal text', () => {
    const plan = createLongFormVideoPlan(makeExplicitRequest())
    for (const scene of plan.storyboard.scenes) {
      const prompt = scene.visualPrompt.toLowerCase()
      expect(prompt).not.toContain('visit course2career.com')
      expect(prompt).not.toContain('eligibility and programme terms')
      expect(prompt).not.toContain('£2,499')
    }
  })
})
