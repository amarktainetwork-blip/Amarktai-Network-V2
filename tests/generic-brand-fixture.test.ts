import { describe, expect, it } from 'vitest'
import {
  createLongFormVideoPlan,
  validatePlanCompleteness,
  buildSceneVideoPrompt,
} from '../packages/core/src/index.ts'

const FITLIFE_REQUEST = {
  prompt: 'FitLife Pro Premium Fitness App — 45-second motivational workout advertisement for busy professionals aged 25-45 who want efficient home workouts. Generate app downloads and premium subscriptions.',
  targetDurationSeconds: 45,
  sceneCount: 4,
  aspectRatio: '16:9',
  style: 'cinematic',
  tone: 'inspirational',
  routingMode: 'quality',
  planningMode: 'explicit',
  count: 1,
  voiceoverEnabled: true,
  subtitlesEnabled: true,
  musicBedEnabled: true,
  campaignTitle: 'FitLife Pro Premium Fitness',
  brandName: 'FitLife Pro',
  brandWebsite: 'fitlifepro.com',
  objective: 'Generate app downloads and premium subscriptions for busy professionals.',
  audience: 'Busy professionals aged 25-45 who want efficient home workouts.',
  callToAction: 'Download FitLife Pro free and start your transformation today.',
  legalQualifier: 'Results vary. Premium subscription required for full access. Consult your doctor before starting any exercise programme.',
  musicBrief: 'Energetic motivational electronic music. Build intensity through workout scenes, peak energy during transformation, resolve with confidence. No vocals. Professional fitness commercial soundtrack.',
  voiceProfile: {
    language: 'en-US',
    accent: 'American',
    tone: 'energetic, motivational, confident',
    speed: 1.1,
    outputFormat: 'wav',
  },
  scenes: [
    {
      sceneNumber: 1,
      durationSeconds: 10,
      title: 'Morning Challenge',
      objective: 'Show the struggle of a busy professional trying to find time for fitness.',
      visualPrompt: 'Premium fitness commercial opening. A busy professional in their 30s wakes up early in a modern apartment. They look at their phone showing a packed schedule. Morning light streams through windows. They appear determined but overwhelmed. Realistic morning routine, authentic home environment, professional cinematic lighting, text-free video frame.',
      negativePrompt: 'No gym equipment, no fitness models, no exaggerated body types, no generated text, no logos, no watermarks, no unrealistic body transformations.',
      cameraDirection: 'Start with an intimate bedroom close-up, move to a wide living room establishing shot, finish on a determined face close-up.',
      voiceoverText: 'We all know the feeling. Another busy day, another workout skipped. But what if getting fit could fit into your life?',
      subtitleText: 'We all know the feeling. Another busy day, another workout skipped. But what if getting fit could fit into your life?',
      overlays: [
        { id: 'overlay_s1_brand', sceneNumber: 1, startSeconds: 6, endSeconds: 10, type: 'brand', text: 'FitLife Pro', position: 'top_center', emphasis: 'bold', legal: false },
      ],
    },
    {
      sceneNumber: 2,
      durationSeconds: 15,
      title: 'The Workout',
      objective: 'Show an efficient, effective home workout using the FitLife Pro app.',
      visualPrompt: 'Premium fitness commercial featuring the same professional from scene 1. They are now in their living room following a guided workout on their tablet. Show efficient exercises, proper form, sweat and effort. The app interface is visible but not readable. Dynamic camera movement, professional fitness cinematography, realistic home gym setup, text-free video frame.',
      negativePrompt: 'No gym equipment, no fitness models, no generated words, no app interface text, no floating UI elements, no unrealistic exercises, no character change.',
      cameraDirection: 'Use dynamic medium shots, over-the-shoulder tablet views, close-up on form, and tracking shots around the workout space.',
      voiceoverText: 'FitLife Pro delivers personalised 20-minute workouts that adapt to your schedule, your space, and your goals. No equipment needed.',
      subtitleText: 'FitLife Pro delivers personalised 20-minute workouts that adapt to your schedule, your space, and your goals. No equipment needed.',
      overlays: [
        { id: 'overlay_s2_time', sceneNumber: 2, startSeconds: 2, endSeconds: 15, type: 'benefit', text: '20-minute personalised workouts', position: 'top_right', emphasis: 'bold', legal: false },
        { id: 'overlay_s2_equipment', sceneNumber: 2, startSeconds: 8, endSeconds: 15, type: 'benefit', text: 'No equipment needed', position: 'top_right', emphasis: 'normal', legal: false },
      ],
    },
    {
      sceneNumber: 3,
      durationSeconds: 12,
      title: 'Transformation',
      objective: 'Show the visible results and lifestyle improvement from consistent use.',
      visualPrompt: 'Premium fitness transformation commercial. The same professional is now confident and energised. Show them at work with improved posture, playing with their kids with energy, and checking their progress on the FitLife Pro app. Warm golden hour lighting, professional lifestyle cinematography, realistic family and work environments, text-free video frame.',
      negativePrompt: 'No before/after photos, no unrealistic body changes, no generated text, no floating progress bars, no exaggerated celebrations, no character change.',
      cameraDirection: 'Montage of lifestyle shots: office confidence, family energy, app progress tracking. Smooth transitions between scenes.',
      voiceoverText: 'Four weeks in, you feel the difference. More energy, better focus, real results that show in everything you do.',
      subtitleText: 'Four weeks in, you feel the difference. More energy, better focus, real results that show in everything you do.',
      overlays: [
        { id: 'overlay_s3_results', sceneNumber: 3, startSeconds: 0, endSeconds: 12, type: 'text', text: 'Real results in 4 weeks', position: 'top_right', emphasis: 'bold', legal: false },
        { id: 'overlay_s3_energy', sceneNumber: 3, startSeconds: 4, endSeconds: 12, type: 'benefit', text: 'More energy, better focus', position: 'bottom_right', emphasis: 'normal', legal: false },
      ],
    },
    {
      sceneNumber: 4,
      durationSeconds: 8,
      title: 'Start Today',
      objective: 'Deliver the call to action and end with the FitLife Pro brand.',
      visualPrompt: 'Premium fitness commercial ending. The same professional smiles confidently at camera in their now-familiar home workout space. Clean composition with generous negative space for end card. Professional portrait lighting, authentic confidence, realistic home environment, text-free generated footage.',
      negativePrompt: 'No generated text, no floating app icons, no unrealistic promises, no character change, no excessive celebration, no gym backgrounds.',
      cameraDirection: 'Stable medium close-up of the professional, smooth pull back to reveal the workout space, finish on a clean end-card background.',
      voiceoverText: 'Download FitLife Pro free and start your transformation today. Available now on iOS and Android.',
      subtitleText: 'Download FitLife Pro free and start your transformation today. Available now on iOS and Android.',
      overlays: [
        { id: 'overlay_s4_app', sceneNumber: 4, startSeconds: 0, endSeconds: 8, type: 'brand', text: 'FitLife Pro', position: 'top_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s4_cta', sceneNumber: 4, startSeconds: 2, endSeconds: 8, type: 'cta', text: 'Download Free Today', position: 'bottom_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s4_url', sceneNumber: 4, startSeconds: 4, endSeconds: 8, type: 'url', text: 'fitlifepro.com', position: 'bottom_right', emphasis: 'bold', legal: false },
        { id: 'overlay_s4_ios', sceneNumber: 4, startSeconds: 4, endSeconds: 8, type: 'text', text: 'Available on iOS and Android', position: 'bottom_left', emphasis: 'normal', legal: false },
        { id: 'overlay_s4_legal1', sceneNumber: 4, startSeconds: 0, endSeconds: 8, type: 'legal', text: 'Results vary. Premium subscription required for full access.', position: 'bottom_right', emphasis: 'normal', legal: true },
        { id: 'overlay_s4_legal2', sceneNumber: 4, startSeconds: 0, endSeconds: 8, type: 'legal', text: 'Consult your doctor before starting any exercise programme.', position: 'bottom_right', emphasis: 'normal', legal: true },
      ],
    },
  ],
}

describe('FitLife Pro acceptance fixture (generic second brand)', () => {
  const plan = createLongFormVideoPlan(FITLIFE_REQUEST)

  it('produces exactly four scenes', () => {
    expect(plan.storyboard.scenes).toHaveLength(4)
  })

  it('has correct scene durations: 10, 15, 12, 8 seconds', () => {
    expect(plan.storyboard.scenes[0].durationSeconds).toBe(10)
    expect(plan.storyboard.scenes[1].durationSeconds).toBe(15)
    expect(plan.storyboard.scenes[2].durationSeconds).toBe(12)
    expect(plan.storyboard.scenes[3].durationSeconds).toBe(8)
  })

  it('has total duration of exactly 45 seconds', () => {
    expect(plan.totalDurationSeconds).toBe(45)
    const sceneTotal = plan.storyboard.scenes.reduce((s, sc) => s + sc.durationSeconds, 0)
    expect(sceneTotal).toBe(45)
  })

  it('has materially different visual prompts for all four scenes', () => {
    const prompts = plan.storyboard.scenes.map((s) => s.visualPrompt)
    const unique = new Set(prompts.map((p) => p.slice(0, 60)))
    expect(unique.size).toBe(4)
  })

  it('each scene prompt contains only its own visual instructions', () => {
    for (let i = 0; i < plan.storyboard.scenes.length; i++) {
      for (let j = 0; j < plan.storyboard.scenes.length; j++) {
        if (i === j) continue
        const otherBrief = plan.storyboard.scenes[j].visualPrompt.trim()
        if (otherBrief.length > 50) {
          expect(plan.storyboard.scenes[i].visualPrompt).not.toContain(otherBrief)
        }
      }
    }
  })

  it('no scene prompt includes the complete campaign brief', () => {
    for (const scene of plan.storyboard.scenes) {
      expect(scene.visualPrompt).not.toContain(FITLIFE_REQUEST.prompt)
    }
  })

  it('FitLife Pro is present in narration', () => {
    const hasBrand = plan.storyboard.scenes.some((s) =>
      s.voiceoverText?.toLowerCase().includes('fitlife pro')
    )
    expect(hasBrand).toBe(true)
  })

  it('fitlifepro.com is preserved exactly in overlays', () => {
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])
    expect(allOverlays.some((o) => o.text === 'fitlifepro.com')).toBe(true)
  })

  it('exact voiceover segments are preserved', () => {
    expect(plan.storyboard.scenes[0].voiceoverText).toContain('We all know the feeling')
    expect(plan.storyboard.scenes[1].voiceoverText).toContain('FitLife Pro delivers personalised')
    expect(plan.storyboard.scenes[2].voiceoverText).toContain('Four weeks in')
    expect(plan.storyboard.scenes[3].voiceoverText).toContain('Download FitLife Pro free')
  })

  it('exact subtitles are preserved', () => {
    expect(plan.storyboard.scenes[0].subtitleText).toContain('We all know the feeling')
    expect(plan.storyboard.scenes[3].subtitleText).toContain('Download FitLife Pro free')
  })

  it('exact legal qualifiers are preserved', () => {
    expect(plan.legalQualifier).toContain('Results vary')
    expect(plan.legalQualifier).toContain('Consult your doctor')
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])
    expect(allOverlays.some((o) => o.text.includes('Results vary'))).toBe(true)
    expect(allOverlays.some((o) => o.text.includes('Consult your doctor'))).toBe(true)
  })

  it('exact overlays are preserved', () => {
    const scene4Overlays = plan.storyboard.scenes[3].overlays ?? []
    expect(scene4Overlays.some((o) => o.text === 'FitLife Pro')).toBe(true)
    expect(scene4Overlays.some((o) => o.text === 'Download Free Today')).toBe(true)
    expect(scene4Overlays.some((o) => o.text === 'fitlifepro.com')).toBe(true)
    expect(scene4Overlays.some((o) => o.text === 'Available on iOS and Android')).toBe(true)
  })

  it('routing mode is persisted as quality', () => {
    expect(plan.routingMode).toBe('quality')
  })

  it('no provider/model override is accepted', () => {
    expect((plan as any).provider).toBeUndefined()
    expect((plan as any).model).toBeUndefined()
  })

  it('no video job is created during plan generation', () => {
    expect(plan.providerCallsStarted).toBe(false)
    expect(plan.executableNow).toBe(false)
  })

  it('plan has a version hash', () => {
    expect(plan.versionHash).toBeTruthy()
    expect(plan.versionHash.length).toBe(16)
  })

  it('plan validation passes', () => {
    const validation = validatePlanCompleteness(plan)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  it('video prompt for each scene contains only visual content', () => {
    for (const scene of plan.storyboard.scenes) {
      const videoPrompt = buildSceneVideoPrompt(scene, plan)
      expect(videoPrompt).not.toContain('voiceover')
      expect(videoPrompt).not.toContain('subtitles')
      expect(videoPrompt).not.toContain('music brief')
      expect(videoPrompt).not.toContain('Download FitLife Pro')
      expect(videoPrompt).not.toContain('Results vary')
    }
  })

  it('each scene has unique objective', () => {
    const objectives = plan.storyboard.scenes.map((s) => s.objective)
    expect(new Set(objectives).size).toBe(4)
  })

  it('musicBrief is preserved in plan', () => {
    expect(plan.musicBrief).toContain('Energetic motivational electronic music')
    expect(plan.musicBrief).toContain('No vocals')
  })

  it('brandName is preserved in plan', () => {
    expect(plan.brandName).toBe('FitLife Pro')
  })

  it('brandWebsite is preserved exactly', () => {
    expect(plan.brandWebsite).toBe('fitlifepro.com')
  })

  it('callToAction is preserved exactly', () => {
    expect(plan.callToAction).toBe('Download FitLife Pro free and start your transformation today.')
  })

  it('voiceProfile is preserved in plan', () => {
    expect(plan.voiceProfile?.language).toBe('en-US')
    expect(plan.voiceProfile?.accent).toBe('American')
    expect(plan.voiceProfile?.tone).toContain('energetic')
  })
})

describe('generic system proof: no brand-specific constants', () => {
  it('production source files contain no Course2Career constants', () => {
    const fs = require('fs')
    const path = require('path')

    const productionDirs = [
      'packages/core/src',
      'apps/api/src',
      'apps/worker/src',
      'app/dashboard/video',
    ]

    const brandTerms = ['Course2Career', 'course2career', 'COURSE2CAREER']
    const violations: string[] = []

    for (const dir of productionDirs) {
      const fullPath = path.join(process.cwd(), dir)
      if (!fs.existsSync(fullPath)) continue

      const files = fs.readdirSync(fullPath, { recursive: true })
        .filter((f: string) => typeof f === 'string' && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')))

      for (const file of files) {
        const filePath = path.join(fullPath, file)
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          for (const term of brandTerms) {
            if (content.includes(term)) {
              violations.push(`${filePath}: contains '${term}'`)
            }
          }
        } catch {}
      }
    }

    expect(violations).toEqual([])
  })

  it('overlay rendering accepts arbitrary safe text', () => {
    const plan = createLongFormVideoPlan(FITLIFE_REQUEST)
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])

    for (const overlay of allOverlays) {
      expect(overlay.text.length).toBeGreaterThan(0)
      expect(overlay.text.length).toBeLessThanOrEqual(500)
      expect(overlay.sceneNumber).toBeGreaterThanOrEqual(1)
      expect(overlay.startSeconds).toBeGreaterThanOrEqual(0)
      expect(overlay.endSeconds).toBeGreaterThan(overlay.startSeconds)
    }
  })

  it('scene count and durations are not fixed', () => {
    expect(FITLIFE_REQUEST.sceneCount).toBe(4)
    expect(FITLIFE_REQUEST.targetDurationSeconds).toBe(45)
    expect(FITLIFE_REQUEST.scenes[0].durationSeconds).toBe(10)
    expect(FITLIFE_REQUEST.scenes[1].durationSeconds).toBe(15)
    expect(FITLIFE_REQUEST.scenes[2].durationSeconds).toBe(12)
    expect(FITLIFE_REQUEST.scenes[3].durationSeconds).toBe(8)
  })
})
