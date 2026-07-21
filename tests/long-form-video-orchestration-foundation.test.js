import { describe, it, expect } from 'vitest'
import {
  LongFormVideoRequestSchema,
  LongFormVideoPlanSchema,
  validateLongFormVideoRequest,
  createLongFormVideoPlan,
  getExecutorRegistrations,
  getRuntimeTruth,
  PROVIDER_KEYS,
  hasBlockedOverrides
} from '@amarktai/core'

describe('Long-Form Video Orchestration Foundation', () => {
  describe('Schema exports', () => {
    it('exports LongFormVideoRequestSchema', () => {
      expect(LongFormVideoRequestSchema).toBeDefined()
    })

    it('exports LongFormVideoPlanSchema', () => {
      expect(LongFormVideoPlanSchema).toBeDefined()
    })

    it('exports validateLongFormVideoRequest', () => {
      expect(validateLongFormVideoRequest).toBeDefined()
      expect(typeof validateLongFormVideoRequest).toBe('function')
    })

  })

  describe('Request validation', () => {
    it('validates valid request', () => {
      const request = {
        prompt: 'A documentary about space exploration',
        targetDurationSeconds: 120,
        sceneCount: 5,
        aspectRatio: '16:9',
        style: 'documentary',
        tone: 'informative'
      }
      const validated = validateLongFormVideoRequest(request)
      expect(validated.prompt).toBe(request.prompt)
      expect(validated.targetDurationSeconds).toBe(120)
      expect(validated.sceneCount).toBe(5)
    })

    it('rejects request with duration too short', () => {
      const request = {
        prompt: 'Test',
        targetDurationSeconds: 10,
        sceneCount: 5
      }
      expect(() => validateLongFormVideoRequest(request)).toThrow()
    })

    it('rejects request with duration too long', () => {
      const request = {
        prompt: 'Test',
        targetDurationSeconds: 1000,
        sceneCount: 5
      }
      expect(() => validateLongFormVideoRequest(request)).toThrow()
    })

    it('rejects request with scene count too low', () => {
      const request = {
        prompt: 'Test',
        targetDurationSeconds: 120,
        sceneCount: 1
      }
      expect(() => validateLongFormVideoRequest(request)).toThrow()
    })

    it('rejects request with scene count too high', () => {
      const request = {
        prompt: 'Test',
        targetDurationSeconds: 120,
        sceneCount: 25
      }
      expect(() => validateLongFormVideoRequest(request)).toThrow()
    })

    it('applies default values', () => {
      const request = {
        prompt: 'Test prompt',
        targetDurationSeconds: 60,
        sceneCount: 3
      }
      const validated = validateLongFormVideoRequest(request)
      expect(validated.aspectRatio).toBe('16:9')
      expect(validated.style).toBe('cinematic')
      expect(validated.tone).toBe('professional')
      expect(validated.voiceoverEnabled).toBe(false)
      expect(validated.subtitlesEnabled).toBe(false)
      expect(validated.musicBedEnabled).toBe(false)
    })
  })

  describe('Plan creation', () => {
    it('creates plan with correct structure', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'A documentary about space',
        targetDurationSeconds: 120,
        sceneCount: 5
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.id).toBeDefined()
      expect(plan.prompt).toBe(request.prompt)
      expect(plan.totalDurationSeconds).toBe(120)
      expect(plan.storyboard).toBeDefined()
      expect(plan.storyboard.scenes).toHaveLength(5)
      expect(plan.renderSteps).toBeDefined()
      expect(plan.artifactPlan).toBeDefined()
      expect(plan.missingDependencies).toBeDefined()
      expect(plan.executableNow).toBe(false)
      expect(plan.perSceneVideoGenerationPossible).toBe(true)
      expect(plan.finalAssemblyReady).toBe(false)
    })

    it('splits target duration correctly across scenes', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for duration splitting',
        targetDurationSeconds: 120,
        sceneCount: 5
      })
      const plan = createLongFormVideoPlan(request)
      
      const totalSceneDuration = plan.storyboard.scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0
      )
      expect(totalSceneDuration).toBe(120)
      
      // Each scene should have 24 seconds (120 / 5)
      plan.storyboard.scenes.forEach(scene => {
        expect(scene.durationSeconds).toBe(24)
      })
    })

    it('creates requested scene count', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for scene count validation',
        targetDurationSeconds: 100,
        sceneCount: 5
      })
      const plan = createLongFormVideoPlan(request)
      expect(plan.storyboard.scenes).toHaveLength(5)
    })

    it('includes visualPrompt per scene', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Space documentary about exploration',
        targetDurationSeconds: 60,
        sceneCount: 3
      })
      const plan = createLongFormVideoPlan(request)
      
      plan.storyboard.scenes.forEach(scene => {
        expect(scene.visualPrompt).toBeDefined()
        expect(scene.visualPrompt.length).toBeGreaterThan(0)
      })
    })

    it('includes render steps', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for render steps validation',
        targetDurationSeconds: 60,
        sceneCount: 3
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.renderSteps.length).toBeGreaterThan(0)
      
      // Should have scene generation steps
      const sceneSteps = plan.renderSteps.filter(s => s.type === 'scene_generation')
      expect(sceneSteps).toHaveLength(3)
      
      // Should have final assembly step
      const assemblyStep = plan.renderSteps.find(s => s.type === 'final_assembly')
      expect(assemblyStep).toBeDefined()
    })

    it('marks final assembly blocked', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for assembly blocking validation',
        targetDurationSeconds: 60,
        sceneCount: 3
      })
      const plan = createLongFormVideoPlan(request)
      
      const assemblyStep = plan.renderSteps.find(s => s.type === 'final_assembly')
      expect(assemblyStep.status).toBe('blocked')
      expect(assemblyStep.blockedReason).toBeDefined()
    })

    it('lists ffmpeg/stitching missing', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for ffmpeg missing validation',
        targetDurationSeconds: 60,
        sceneCount: 3
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.missingDependencies).toContain('ffmpeg/stitching')
    })

    it('lists voiceover as ready when enabled', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for voiceover missing validation',
        targetDurationSeconds: 60,
        sceneCount: 3,
        voiceoverEnabled: true
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.missingDependencies).not.toContain('voiceover_backend')
      
      const voiceoverStep = plan.renderSteps.find(s => s.type === 'voiceover_generation')
      expect(voiceoverStep).toBeDefined()
      expect(voiceoverStep.status).toBe('ready')
    })

    it('lists subtitles as ready when enabled', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for subtitles missing validation',
        targetDurationSeconds: 60,
        sceneCount: 3,
        subtitlesEnabled: true
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.missingDependencies).not.toContain('subtitle_backend')
      
      const subtitleStep = plan.renderSteps.find(s => s.type === 'subtitle_generation')
      expect(subtitleStep).toBeDefined()
      expect(subtitleStep.status).toBe('ready')
    })

    it('lists music bed as ready when enabled', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for music bed missing validation',
        targetDurationSeconds: 60,
        sceneCount: 3,
        musicBedEnabled: true
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.missingDependencies).not.toContain('music_bed_backend')
      
      const musicStep = plan.renderSteps.find(s => s.type === 'music_bed_generation')
      expect(musicStep).toBeDefined()
      expect(musicStep.status).toBe('ready')
    })

    it('does not list voiceover/subtitles/music when disabled', () => {
      const request = validateLongFormVideoRequest({
        prompt: 'Test prompt for disabled features validation',
        targetDurationSeconds: 60,
        sceneCount: 3,
        voiceoverEnabled: false,
        subtitlesEnabled: false,
        musicBedEnabled: false
      })
      const plan = createLongFormVideoPlan(request)
      
      expect(plan.missingDependencies).not.toContain('voiceover_backend')
      expect(plan.missingDependencies).not.toContain('subtitle_backend')
      expect(plan.missingDependencies).not.toContain('music_bed_backend')
    })
  })

  describe('Capability status', () => {
    it('long_form_video remains not fully executable', () => {
      const truth = getRuntimeTruth().capabilities.find(item => item.capability === 'long_form_video')
      expect(truth.executableNow).toBe(false)
    })

    it('final long_form_video has no direct provider executor', () => {
      expect(getExecutorRegistrations('long_form_video')).toEqual([])
    })

    it('video_generation retains the GenX short-clip executor', () => {
      expect(getExecutorRegistrations('video_generation').map(entry => entry.provider)).toEqual(['genx'])
    })
  })

  describe('Provider/model override blocking', () => {
    it('no provider/model override allowed', () => {
      expect(hasBlockedOverrides({ provider: 'genx' })).toBe('provider')
      expect(hasBlockedOverrides({ model: 'seedance-v1-fast' })).toBe('model')
      expect(hasBlockedOverrides({ providerOverride: 'genx' })).toBe('providerOverride')
      expect(hasBlockedOverrides({ modelOverride: 'seedance' })).toBe('modelOverride')
    })

    it('clean request passes', () => {
      expect(hasBlockedOverrides({ prompt: 'Test', capability: 'long_form_video' })).toBeNull()
    })
  })

  describe('Provider list integrity', () => {
    it('no new providers added', () => {
      expect(PROVIDER_KEYS).toEqual(['genx', 'together', 'mimo', 'deepinfra'])
      expect(PROVIDER_KEYS).toHaveLength(4)
    })

    it('no banned providers', () => {
      const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
      banned.forEach(provider => {
        expect(PROVIDER_KEYS).not.toContain(provider)
      })
    })
  })

  describe('Adult generation remains on hold', () => {
    it('adult capabilities remain blocked', () => {
      const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
      const truth = getRuntimeTruth()
      adultCaps.forEach(cap => {
        expect(truth.capabilities.find(item => item.capability === cap)?.classification).toBe('POLICY_RESTRICTED')
      })
    })
  })

  describe('Phase 1 foundation verification', () => {
    it('binds foundation claims to the callable schema and planner', () => {
      expect(LongFormVideoRequestSchema).toBeDefined()
      expect(LongFormVideoPlanSchema).toBeDefined()
      expect(typeof createLongFormVideoPlan).toBe('function')
    })

    it('keeps per-scene execution support tied to a real executor registration', () => {
      expect(getExecutorRegistrations('video_generation')).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: 'genx', handlerName: 'executeGenxVideo' }),
      ]))
    })

    it('does not invent API component evidence in core-only runtime truth', () => {
      const longForm = getRuntimeTruth().capabilities.find(item => item.capability === 'long_form_video')
      expect(longForm.plannerReady).toBe(false)
      expect(longForm.videoOnlyAssemblyReady).toBe(false)
      expect(longForm.fullMultimediaReady).toBe(false)
      expect(longForm.executableNow).toBe(false)
    })
  })
})
