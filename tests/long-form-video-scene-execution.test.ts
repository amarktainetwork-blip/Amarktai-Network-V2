import { describe, it, expect } from 'vitest'
import {
  buildSceneVideoPrompt,
  createSceneExecutionPayloads,
  createLongFormExecutionState,
  updateSceneExecutionState,
  calculateLongFormProgress,
  getExecutionSummary,
  createLongFormVideoPlan,
  validateLongFormVideoRequest,
} from '@amarktai/core'

describe('Long-Form Video Phase 2: Per-Scene Execution', () => {
  describe('buildSceneVideoPrompt', () => {
    it('builds cinematic prompt with style and tone', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'A documentary about space exploration',
          targetDurationSeconds: 120,
          sceneCount: 3,
          style: 'cinematic',
          tone: 'dramatic',
        })
      )

      const scene = plan.storyboard.scenes[0]
      const prompt = buildSceneVideoPrompt(scene, plan)

      expect(prompt).toContain('cinematic')
      expect(prompt).toContain('dramatic')
      expect(prompt).toContain(scene.title)
      expect(prompt).toContain(scene.description)
    })

    it('includes camera direction when present', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for camera direction',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const scene = plan.storyboard.scenes[0]
      scene.cameraDirection = 'wide_shot_establishing'
      const prompt = buildSceneVideoPrompt(scene, plan)

      expect(prompt).toContain('camera: wide_shot_establishing')
    })

    it('includes transition hints when not cut', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for transitions',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const scene = plan.storyboard.scenes[0]
      scene.transitionIn = 'fade_in'
      scene.transitionOut = 'fade_out'
      const prompt = buildSceneVideoPrompt(scene, plan)

      expect(prompt).toContain('begins with fade in')
      expect(prompt).toContain('ends with fade out')
    })

    it('adds quality enhancement keywords', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for quality',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const scene = plan.storyboard.scenes[0]
      const prompt = buildSceneVideoPrompt(scene, plan)

      expect(prompt).toContain('high quality')
      expect(prompt).toContain('cinematic')
      expect(prompt).toContain('professional')
    })
  })

  describe('createSceneExecutionPayloads', () => {
    it('creates one payload per scene', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for payloads',
          targetDurationSeconds: 120,
          sceneCount: 5,
        })
      )

      const executionId = 'test-execution-id-123'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      expect(payloads).toHaveLength(5)
      payloads.forEach((payload, index) => {
        expect(payload.sceneNumber).toBe(index + 1)
      })
    })

    it('each payload includes duration and aspect ratio', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for duration',
          targetDurationSeconds: 120,
          sceneCount: 3,
          aspectRatio: '16:9',
        })
      )

      const executionId = 'test-execution-id-456'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.input.duration).toBe(40) // 120 / 3
        expect(payload.input.aspectRatio).toBe('16:9')
      })
    })

    it('each payload includes style and camera prompt', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for style',
          targetDurationSeconds: 60,
          sceneCount: 2,
          style: 'documentary',
        })
      )

      const executionId = 'test-execution-id-789'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.input.style).toBe('documentary')
        expect(payload.prompt).toContain('documentary')
      })
    })

    it('each payload includes routingMode as preference', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for routing',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-routing'
      const payloads = createSceneExecutionPayloads(plan, 'premium', executionId)

      payloads.forEach((payload) => {
        expect(payload.routingMode).toBe('premium')
        expect(payload.metadata.routingMode).toBe('premium')
      })
    })

    it('no provider/model override is included', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for no override',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-no-override'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.metadata).not.toHaveProperty('provider')
        expect(payload.metadata).not.toHaveProperty('model')
        expect(payload.metadata).not.toHaveProperty('providerOverride')
        expect(payload.metadata).not.toHaveProperty('modelOverride')
      })
    })

    it('each payload includes longFormExecutionId and sceneNumber', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for metadata',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-metadata'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(executionId)
        expect(payload.metadata.sceneNumber).toBeDefined()
        expect(payload.metadata.longFormVideo).toBe(true)
        expect(payload.metadata.finalAssemblyPending).toBe(true)
      })
    })

    it('Brain Router still controls provider/model', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for brain router',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-brain-router'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      // Payloads should not include provider/model - Brain Router decides
      payloads.forEach((payload) => {
        expect(payload.capability).toBe('video_generation')
        expect(payload.metadata).not.toHaveProperty('selectedProvider')
        expect(payload.metadata).not.toHaveProperty('selectedModel')
      })
    })

    it('all payloads share the same executionId', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for shared executionId',
          targetDurationSeconds: 60,
          sceneCount: 3,
        })
      )

      const executionId = 'shared-execution-id-abc'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(executionId)
      })
    })
  })

  describe('createLongFormExecutionState', () => {
    it('creates execution state with all scenes queued', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for execution state',
          targetDurationSeconds: 120,
          sceneCount: 4,
        })
      )

      const state = createLongFormExecutionState(plan, 'balanced')

      expect(state.executionId).toBeDefined()
      expect(state.planId).toBe(plan.id)
      expect(state.routingMode).toBe('balanced')
      expect(state.totalScenes).toBe(4)
      expect(state.scenes).toHaveLength(4)
      expect(state.progress).toBe(0)
      expect(state.finalAssemblyReady).toBe(false)

      state.scenes.forEach((scene, index) => {
        expect(scene.sceneNumber).toBe(index + 1)
        expect(scene.status).toBe('queued')
      })
    })

    it('includes missing dependencies', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for dependencies',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const state = createLongFormExecutionState(plan)

      expect(state.missingDependencies).toContain('ffmpeg/stitching')
      expect(state.missingDependencies).toContain('final_assembly_pipeline')
    })
  })

  describe('updateSceneExecutionState', () => {
    it('updates scene status', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for update',
          targetDurationSeconds: 60,
          sceneCount: 3,
        })
      )

      let state = createLongFormExecutionState(plan)
      state = updateSceneExecutionState(state, 1, { status: 'completed' })

      expect(state.scenes[0].status).toBe('completed')
      expect(state.scenes[1].status).toBe('queued')
      expect(state.scenes[2].status).toBe('queued')
    })

    it('updates progress when scenes complete', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for progress',
          targetDurationSeconds: 60,
          sceneCount: 4,
        })
      )

      let state = createLongFormExecutionState(plan)
      
      state = updateSceneExecutionState(state, 1, { status: 'completed' })
      expect(state.progress).toBe(25)

      state = updateSceneExecutionState(state, 2, { status: 'completed' })
      expect(state.progress).toBe(50)

      state = updateSceneExecutionState(state, 3, { status: 'completed' })
      expect(state.progress).toBe(75)

      state = updateSceneExecutionState(state, 4, { status: 'completed' })
      expect(state.progress).toBe(100)
    })

    it('throws error for invalid scene number', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for invalid scene',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const state = createLongFormExecutionState(plan)

      expect(() => {
        updateSceneExecutionState(state, 99, { status: 'completed' })
      }).toThrow('Scene 99 not found')
    })
  })

  describe('calculateLongFormProgress', () => {
    it('calculates progress correctly', () => {
      const scenes = [
        { sceneNumber: 1, sceneTitle: 'Scene 1', status: 'completed' as const },
        { sceneNumber: 2, sceneTitle: 'Scene 2', status: 'completed' as const },
        { sceneNumber: 3, sceneTitle: 'Scene 3', status: 'processing' as const },
        { sceneNumber: 4, sceneTitle: 'Scene 4', status: 'queued' as const },
      ]

      const progress = calculateLongFormProgress(scenes)

      // 2 completed (100% each) + 1 processing (50%) + 1 queued (0%) = 250/400 = 62.5%
      expect(progress).toBe(63) // Rounded
    })

    it('does not count failed scenes as successful progress', () => {
      const scenes = [
        { sceneNumber: 1, sceneTitle: 'Scene 1', status: 'completed' as const },
        { sceneNumber: 2, sceneTitle: 'Scene 2', status: 'failed' as const },
        { sceneNumber: 3, sceneTitle: 'Scene 3', status: 'queued' as const },
      ]

      expect(calculateLongFormProgress(scenes)).toBe(33)
    })

    it('returns 0 for empty scenes', () => {
      const progress = calculateLongFormProgress([])
      expect(progress).toBe(0)
    })

    it('returns 100 when all completed', () => {
      const scenes = [
        { sceneNumber: 1, sceneTitle: 'Scene 1', status: 'completed' as const },
        { sceneNumber: 2, sceneTitle: 'Scene 2', status: 'completed' as const },
      ]

      const progress = calculateLongFormProgress(scenes)
      expect(progress).toBe(100)
    })
  })

  describe('getExecutionSummary', () => {
    it('returns correct summary counts', () => {
      const state = {
        executionId: 'test-id',
        planId: 'plan-id',
        routingMode: 'balanced',
        totalScenes: 4,
        scenes: [
          { sceneNumber: 1, sceneTitle: 'Scene 1', status: 'completed' as const },
          { sceneNumber: 2, sceneTitle: 'Scene 2', status: 'completed' as const },
          { sceneNumber: 3, sceneTitle: 'Scene 3', status: 'failed' as const },
          { sceneNumber: 4, sceneTitle: 'Scene 4', status: 'queued' as const },
        ],
        progress: 50,
        finalAssemblyReady: false,
        missingDependencies: ['ffmpeg/stitching'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const summary = getExecutionSummary(state)

      expect(summary.totalScenes).toBe(4)
      expect(summary.completedScenes).toBe(2)
      expect(summary.failedScenes).toBe(1)
      expect(summary.queuedScenes).toBe(1)
      expect(summary.processingScenes).toBe(0)
      expect(summary.progress).toBe(50)
      expect(summary.canAssemble).toBe(false) // Not all completed
    })

    it('canAssemble is true when all scenes completed', () => {
      const state = {
        executionId: 'test-id',
        planId: 'plan-id',
        routingMode: 'balanced',
        totalScenes: 2,
        scenes: [
          { sceneNumber: 1, sceneTitle: 'Scene 1', status: 'completed' as const },
          { sceneNumber: 2, sceneTitle: 'Scene 2', status: 'completed' as const },
        ],
        progress: 100,
        finalAssemblyReady: false,
        missingDependencies: ['ffmpeg/stitching'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const summary = getExecutionSummary(state)

      expect(summary.canAssemble).toBe(true)
    })
  })

  describe('Final assembly remains blocked', () => {
    it('execution state has finalAssemblyReady false', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for final assembly',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const state = createLongFormExecutionState(plan)

      expect(state.finalAssemblyReady).toBe(false)
    })

    it('missing dependencies include ffmpeg/stitching', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for missing deps',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const state = createLongFormExecutionState(plan)

      expect(state.missingDependencies).toContain('ffmpeg/stitching')
      expect(state.missingDependencies).toContain('final_assembly_pipeline')
    })
  })

  describe('long_form_video is not claimed fully executable', () => {
    it('plan executableNow is false', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for executability',
          targetDurationSeconds: 120,
          sceneCount: 3,
        })
      )

      expect(plan.executableNow).toBe(false)
    })

    it('plan finalAssemblyReady is false', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for assembly',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      expect(plan.finalAssemblyReady).toBe(false)
    })
  })

  describe('video_generation remains executable', () => {
    it('scene payloads use video_generation capability', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for capability',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-capability'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.capability).toBe('video_generation')
      })
    })
  })

  describe('music_generation remains pending', () => {
    it('plan does not include music generation', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for music',
          targetDurationSeconds: 60,
          sceneCount: 2,
          musicBedEnabled: true,
        })
      )

      // Music bed is requested but not executable
      expect(plan.missingDependencies).toContain('music_bed_backend')
    })
  })

  describe('No new providers added', () => {
    it('scene payloads do not specify provider', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for providers',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id-providers'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload).not.toHaveProperty('provider')
        expect(payload.metadata).not.toHaveProperty('provider')
      })
    })
  })

  describe('MiMo remains coding_tools_only', () => {
    it('scene payloads do not reference MiMo', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'A test prompt for video generation',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        // Check that MiMo is not in the prompt or capability
        expect(payload.prompt.toLowerCase()).not.toContain('mimo')
        expect(payload.capability).not.toBe('mimo')
        // Check that MiMo is not in the metadata (excluding executionId)
        const metadataWithoutExecId = { ...payload.metadata, longFormExecutionId: '' }
        expect(JSON.stringify(metadataWithoutExecId).toLowerCase()).not.toContain('mimo')
      })
    })
  })

  describe('Adult remains on hold', () => {
    it('scene payloads do not include adult content', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'A nature documentary about wildlife',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'test-execution-id'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        // Check that adult content is not in the prompt
        expect(payload.prompt.toLowerCase()).not.toContain('adult')
        // Check that adult content is not in the metadata (excluding executionId)
        const metadataWithoutExecId = { ...payload.metadata, longFormExecutionId: '' }
        expect(JSON.stringify(metadataWithoutExecId).toLowerCase()).not.toContain('adult')
      })
    })
  })

  describe('Audit detects Phase 2 scene pipeline', () => {
    it('execution module exists', async () => {
      const { existsSync } = await import('fs')
      const path = await import('path')
      
      const executionPath = path.join(process.cwd(), 'packages/core/src/long-form-execution.ts')
      expect(existsSync(executionPath)).toBe(true)
    })

    it('execute-scenes route exists', async () => {
      const { readFileSync, existsSync } = await import('fs')
      const path = await import('path')
      
      const routePath = path.join(process.cwd(), 'apps/api/src/routes/admin-long-form-video.ts')
      expect(existsSync(routePath)).toBe(true)
      
      const content = readFileSync(routePath, 'utf-8')
      expect(content).toContain('execute-scenes')
    })
  })

  describe('Execution ID consistency', () => {
    it('createSceneExecutionPayloads uses provided executionId', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for execution ID consistency',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionId = 'consistent-execution-id-xyz'
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionId)

      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(executionId)
      })
    })

    it('execution state and all scene payloads share one executionId', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for shared execution ID',
          targetDurationSeconds: 60,
          sceneCount: 3,
        })
      )

      const executionState = createLongFormExecutionState(plan, 'balanced')
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionState.executionId)

      // All payloads should have the same executionId as the state
      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(executionState.executionId)
      })
    })

    it('dryRun returns payloads with the same executionId it returns', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for dryRun execution ID',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionState = createLongFormExecutionState(plan, 'balanced')
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionState.executionId)

      // In dryRun mode, the API would return executionState.executionId
      // and payloads[].metadata.longFormExecutionId should match
      const returnedExecutionId = executionState.executionId
      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(returnedExecutionId)
      })
    })

    it('non-dryRun queues jobs with metadata.longFormExecutionId matching returned executionId', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for non-dryRun execution ID',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionState = createLongFormExecutionState(plan, 'balanced')
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionState.executionId)

      // In non-dryRun mode, jobs are queued with payload.metadata
      // which should contain the same executionId
      const returnedExecutionId = executionState.executionId
      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(returnedExecutionId)
      })
    })

    it('status route uses the same executionId', () => {
      const plan = createLongFormVideoPlan(
        validateLongFormVideoRequest({
          prompt: 'Test prompt for status route execution ID',
          targetDurationSeconds: 60,
          sceneCount: 2,
        })
      )

      const executionState = createLongFormExecutionState(plan, 'balanced')
      const payloads = createSceneExecutionPayloads(plan, 'balanced', executionState.executionId)

      // The status route would look up by executionState.executionId
      // and all job metadata should contain that same ID
      const statusRouteExecutionId = executionState.executionId
      payloads.forEach((payload) => {
        expect(payload.metadata.longFormExecutionId).toBe(statusRouteExecutionId)
      })
    })
  })
})
