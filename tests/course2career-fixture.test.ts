import { describe, expect, it } from 'vitest'
import {
  createLongFormVideoPlan,
  validatePlanCompleteness,
  buildSceneVideoPrompt,
} from '../packages/core/src/index.ts'

const COURSE2CAREER_REQUEST = {
  prompt: 'Course2Career AI Career Programme — premium 30-second British career-development advertisement for UK adults, beginners and career changers who want to enter AI and data careers without requiring previous coding experience. Generate qualified enquiries for the AI Career Programme.',
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
  audience: 'UK adults, beginners and career changers who want to enter AI and data careers without previous coding experience.',
  callToAction: 'Visit Course2Career.com and enquire today.',
  legalQualifier: 'Eligibility and programme terms apply. Salary and employment outcomes vary.',
  musicBrief: 'Original premium instrumental corporate music. Begin warm and thoughtful, build confidence during the training scene and finish with an uplifting but credible conclusion. No vocals. Do not imitate an existing song or artist.',
  voiceProfile: {
    language: 'en-GB',
    accent: 'British',
    tone: 'warm, confident, professional commercial delivery',
    speed: 1,
    outputFormat: 'wav',
  },
  scenes: [
    {
      sceneNumber: 1,
      durationSeconds: 8,
      title: 'A New Career Direction',
      objective: 'Introduce a relatable beginner or career changer and establish that previous coding experience is not required.',
      visualPrompt: 'Premium realistic British education advertisement. A believable adult career changer aged approximately 25 to 45 sits at a clean home workspace in natural morning light. They initially appear uncertain about their career direction, then discover a professional AI and data training programme on their laptop. Their expression shifts naturally from uncertainty to confidence and motivation. Authentic UK home environment, restrained technology imagery, realistic face, hands and laptop interaction, polished cinematic camera movement, text-free video frame, consistent lead character.',
      negativePrompt: 'No robots, no science-fiction holograms, no cyberpunk neon, no generated words, no logos, no certificates, no distorted hands, no duplicate people, no exaggerated facial expressions.',
      cameraDirection: 'Begin with a wide establishing shot, move to a natural over-the-shoulder laptop view, finish on a confident close-up.',
      voiceoverText: 'Ready for a career in AI and data? Course2Career\'s AI Career Programme is built for beginners and career changers, with no previous coding experience needed.',
      subtitleText: 'Ready for a career in AI and data? Course2Career\'s AI Career Programme is built for beginners and career changers, with no previous coding experience needed.',
      overlays: [
        { id: 'overlay_s1_benefit1', sceneNumber: 1, startSeconds: 3, endSeconds: 8, type: 'benefit', text: 'Start a career in AI and data', position: 'bottom_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s1_benefit2', sceneNumber: 1, startSeconds: 3, endSeconds: 8, type: 'benefit', text: 'No previous coding experience required', position: 'bottom_right', emphasis: 'normal', legal: false },
      ],
    },
    {
      sceneNumber: 2,
      durationSeconds: 13,
      title: 'Training and Expert Support',
      objective: 'Show the accredited learning path, practical training and personal support.',
      visualPrompt: 'Premium UK career-training commercial featuring the same lead learner, with consistent appearance and wardrobe. Show the learner completing professional online AI and data coursework, analysing a clean business data dashboard, working through practical exercises and speaking with a supportive expert tutor by video call. Show clear progress, concentration and increasing confidence. Realistic interfaces, modern British home-learning and professional environments, polished commercial lighting, dynamic but credible camera movement, text-free video frame.',
      negativePrompt: 'No generated words, no unauthorised certification logos, no fake certificates, no employer logos, no floating interfaces, no robots, no duplicated screens, no distorted laptop, no character identity change.',
      cameraDirection: 'Use a polished montage of medium shots, over-the-shoulder learning views, a tutor-call close-up and a smooth tracking shot across the working environment.',
      voiceoverText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training, expert tutor support and recruitment guidance.',
      subtitleText: 'Complete six accredited CompTIA courses, including Data Plus and DataX, with 120 to 150 hours of training, expert tutor support and recruitment guidance.',
      overlays: [
        { id: 'overlay_s2_courses', sceneNumber: 2, startSeconds: 2, endSeconds: 13, type: 'text', text: '6 accredited CompTIA courses', position: 'top_right', emphasis: 'bold', legal: false },
        { id: 'overlay_s2_hours', sceneNumber: 2, startSeconds: 4, endSeconds: 13, type: 'text', text: '120\u2013150 training hours', position: 'top_right', emphasis: 'normal', legal: false },
        { id: 'overlay_s2_vouchers', sceneNumber: 2, startSeconds: 6, endSeconds: 13, type: 'text', text: 'Data+ and DataX exam vouchers included', position: 'top_right', emphasis: 'normal', legal: false },
        { id: 'overlay_s2_support', sceneNumber: 2, startSeconds: 8, endSeconds: 13, type: 'text', text: 'Expert tutor and recruitment support', position: 'top_right', emphasis: 'normal', legal: false },
      ],
    },
    {
      sceneNumber: 3,
      durationSeconds: 9,
      title: 'Your Next Career Starts Here',
      objective: 'Show the credible career outcome and end on the Course2Career call to action.',
      visualPrompt: 'Inspirational realistic British career advertisement featuring the same lead learner with consistent identity and wardrobe. Show the learner confidently attending a professional interview and then entering a bright modern workplace associated with data analysis, responsible AI operations and business technology. Finish with a clean premium composition and generous negative space for a locally rendered Course2Career end card. Credible achievement, professional commercial cinematography, realistic workplace, text-free generated footage.',
      negativePrompt: 'No generated words, no fake employer logos, no salary imagery, no guaranteed employment imagery, no robots, no holograms, no identity change, no distorted people, no excessive celebration.',
      cameraDirection: 'Start with a composed interview shot, transition to a confident workplace entrance, finish on a stable premium end-card background with clean negative space.',
      voiceoverText: 'Build employer-ready skills with a guaranteed route to job placement on completion, or your money back, subject to terms. Visit Course2Career.com and enquire today.',
      subtitleText: 'Build employer-ready skills with a guaranteed route to job placement on completion, or your money back, subject to terms. Visit Course2Career.com and enquire today.',
      overlays: [
        { id: 'overlay_s3_programme', sceneNumber: 3, startSeconds: 0, endSeconds: 9, type: 'brand', text: 'AI Career Programme', position: 'top_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s3_guarantee', sceneNumber: 3, startSeconds: 0, endSeconds: 9, type: 'text', text: 'Guaranteed Route to Job Placement or your money back', position: 'center', emphasis: 'highlight', legal: false },
        { id: 'overlay_s3_price', sceneNumber: 3, startSeconds: 2, endSeconds: 9, type: 'price', text: 'From \u00a32,499', position: 'bottom_left', emphasis: 'bold', legal: false },
        { id: 'overlay_s3_finance', sceneNumber: 3, startSeconds: 2, endSeconds: 9, type: 'text', text: 'Finance available', position: 'bottom_left', emphasis: 'normal', legal: false },
        { id: 'overlay_s3_url', sceneNumber: 3, startSeconds: 4, endSeconds: 9, type: 'url', text: 'Course2Career.com', position: 'bottom_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s3_cta', sceneNumber: 3, startSeconds: 4, endSeconds: 9, type: 'cta', text: 'Enquire Now', position: 'bottom_center', emphasis: 'bold', legal: false },
        { id: 'overlay_s3_legal1', sceneNumber: 3, startSeconds: 0, endSeconds: 9, type: 'legal', text: 'Eligibility and programme terms apply', position: 'bottom_right', emphasis: 'normal', legal: true },
        { id: 'overlay_s3_legal2', sceneNumber: 3, startSeconds: 0, endSeconds: 9, type: 'legal', text: 'Salary and employment outcomes vary', position: 'bottom_right', emphasis: 'normal', legal: true },
      ],
    },
  ],
}

// ── Course2Career Acceptance Fixture ──────────────────────────────────────────

describe('Course2Career acceptance fixture', () => {
  const plan = createLongFormVideoPlan(COURSE2CAREER_REQUEST)

  it('produces exactly three scenes', () => {
    expect(plan.storyboard.scenes).toHaveLength(3)
  })

  it('has correct scene durations: 8, 13, 9 seconds', () => {
    expect(plan.storyboard.scenes[0].durationSeconds).toBe(8)
    expect(plan.storyboard.scenes[1].durationSeconds).toBe(13)
    expect(plan.storyboard.scenes[2].durationSeconds).toBe(9)
  })

  it('has total duration of exactly 30 seconds', () => {
    expect(plan.totalDurationSeconds).toBe(30)
    const sceneTotal = plan.storyboard.scenes.reduce((s, sc) => s + sc.durationSeconds, 0)
    expect(sceneTotal).toBe(30)
  })

  it('has materially different visual prompts for all three scenes', () => {
    const prompts = plan.storyboard.scenes.map((s) => s.visualPrompt)
    const unique = new Set(prompts.map((p) => p.slice(0, 60)))
    expect(unique.size).toBe(3)
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
      expect(scene.visualPrompt).not.toContain(COURSE2CAREER_REQUEST.prompt)
    }
  })

  it('no scene visual prompt contains pricing, CTA, subtitles or legal copy', () => {
    for (const scene of plan.storyboard.scenes) {
      const vp = scene.visualPrompt.toLowerCase()
      expect(vp).not.toContain('\u00a32,499')
      expect(vp).not.toContain('visit course2career.com')
      expect(vp).not.toContain('eligibility and programme terms')
      expect(vp).not.toContain('salary and employment outcomes')
    }
  })

  it('Course2Career is present in narration', () => {
    const hasBrand = plan.storyboard.scenes.some((s) =>
      s.voiceoverText?.toLowerCase().includes('course2career')
    )
    expect(hasBrand).toBe(true)
  })

  it('Course2Career.com is preserved exactly in overlays', () => {
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])
    expect(allOverlays.some((o) => o.text === 'Course2Career.com')).toBe(true)
  })

  it('exact voiceover segments are preserved', () => {
    expect(plan.storyboard.scenes[0].voiceoverText).toContain('Ready for a career in AI and data')
    expect(plan.storyboard.scenes[1].voiceoverText).toContain('Complete six accredited CompTIA courses')
    expect(plan.storyboard.scenes[2].voiceoverText).toContain('Build employer-ready skills')
  })

  it('exact subtitles are preserved', () => {
    expect(plan.storyboard.scenes[0].subtitleText).toContain('Ready for a career in AI and data')
    expect(plan.storyboard.scenes[2].subtitleText).toContain('Visit Course2Career.com and enquire today')
  })

  it('exact legal qualifiers are preserved', () => {
    expect(plan.legalQualifier).toBe('Eligibility and programme terms apply. Salary and employment outcomes vary.')
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])
    expect(allOverlays.some((o) => o.text.includes('Eligibility and programme terms apply'))).toBe(true)
    expect(allOverlays.some((o) => o.text.includes('Salary and employment outcomes vary'))).toBe(true)
  })

  it('exact overlays are preserved', () => {
    const scene3Overlays = plan.storyboard.scenes[2].overlays ?? []
    expect(scene3Overlays.some((o) => o.text === 'AI Career Programme')).toBe(true)
    expect(scene3Overlays.some((o) => o.text === 'Guaranteed Route to Job Placement or your money back')).toBe(true)
    expect(scene3Overlays.some((o) => o.text === 'From \u00a32,499')).toBe(true)
    expect(scene3Overlays.some((o) => o.text === 'Finance available')).toBe(true)
    expect(scene3Overlays.some((o) => o.text === 'Course2Career.com')).toBe(true)
    expect(scene3Overlays.some((o) => o.text === 'Enquire Now')).toBe(true)
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

  it('sets providerCallsStarted to false explicitly', () => {
    expect(plan.providerCallsStarted).toBe(false)
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
      expect(videoPrompt).not.toContain('\u00a32,499')
      expect(videoPrompt).not.toContain('Visit Course2Career.com and enquire today')
      expect(videoPrompt).not.toContain('Eligibility and programme terms')
    }
  })

  it('each scene has unique objective', () => {
    const objectives = plan.storyboard.scenes.map((s) => s.objective)
    expect(new Set(objectives).size).toBe(3)
  })

  it('musicBrief is preserved in plan', () => {
    expect(plan.musicBrief).toContain('Original premium instrumental corporate music')
    expect(plan.musicBrief).toContain('No vocals')
  })

  it('brandName is preserved in plan', () => {
    expect(plan.brandName).toBe('Course2Career')
  })
})
