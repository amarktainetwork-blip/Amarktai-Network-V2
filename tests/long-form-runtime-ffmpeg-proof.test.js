/**
 * Long-Form Runtime FFmpeg Proof Tests
 * 
 * Verifies that the long-form runtime proof script exists,
 * runs without provider keys, and validates ffmpeg availability.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  check,
  createProofState,
  runProof,
} from '../scripts/proof-long-form-runtime.mjs'

const ROOT = process.cwd()

describe('Long-Form Runtime FFmpeg Proof', () => {
  describe('Proof script exists', () => {
    it('proof-long-form-runtime.mjs exists', () => {
      const scriptPath = path.join(ROOT, 'scripts/proof-long-form-runtime.mjs')
      expect(fs.existsSync(scriptPath)).toBe(true)
    })

    it('package.json has proof:long-form-runtime script', () => {
      const packageJsonPath = path.join(ROOT, 'package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      expect(packageJson.scripts['proof:long-form-runtime']).toBe('node scripts/proof-long-form-runtime.mjs')
    })

    it('package.json has optional strict runtime proof script', () => {
      const packageJsonPath = path.join(ROOT, 'package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      expect(packageJson.scripts['proof:long-form-runtime:strict']).toBe('node scripts/proof-long-form-runtime.mjs --strict-runtime')
    })
  })

  describe('Proof script async check harness', () => {
    it('awaits async checks before passing them', async () => {
      const state = createProofState(() => {})

      await check(state, 'async pass', async () => {
        await Promise.resolve()
        return true
      })

      expect(state.passed).toBe(1)
      expect(state.failed).toBe(0)
    })

    it('async check failure increments failed count', async () => {
      const state = createProofState(() => {})

      await check(state, 'async fail', async () => {
        await Promise.resolve()
        return false
      })

      expect(state.passed).toBe(0)
      expect(state.failed).toBe(1)
    })

    it('does not pass Promise objects blindly', async () => {
      const state = createProofState(() => {})
      const pending = check(state, 'promise resolves false', () => Promise.resolve(false))

      expect(state.passed).toBe(0)
      expect(state.failed).toBe(0)

      await pending

      expect(state.passed).toBe(0)
      expect(state.failed).toBe(1)
    })

    it('catches async rejections as failed checks', async () => {
      const state = createProofState(() => {})

      await check(state, 'async reject', async () => {
        throw new Error('intentional async failure')
      })

      expect(state.passed).toBe(0)
      expect(state.failed).toBe(1)
      expect(state.results[0].error).toContain('intentional async failure')
    })
  })

  describe('Proof script import and ffmpeg mode safety', () => {
    it('does not dynamically import TypeScript source files', () => {
      const scriptPath = path.join(ROOT, 'scripts/proof-long-form-runtime.mjs')
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).not.toMatch(/import\([^)]*\.ts/)
      expect(content).not.toContain("import('./apps/api/src/lib/long-form-assembly.ts')")
      expect(content).not.toContain("import('./packages/core/src/config.ts')")
    })

    it('default proof passes when local ffmpeg is missing but Docker API stage installs ffmpeg', async () => {
      const state = await runProof({
        root: ROOT,
        strictRuntime: false,
        log: () => {},
        runCommand: () => {
          throw new Error('ffmpeg missing in local Windows shell')
        },
      })

      expect(state.failed).toBe(0)
      expect(state.warnings).toBeGreaterThanOrEqual(1)
      expect(state.results.some((result) => result.status === 'warn' && result.name === 'local ffmpeg missing')).toBe(true)
    })

    it('strict runtime proof fails when ffmpeg is missing', async () => {
      const state = await runProof({
        root: ROOT,
        strictRuntime: true,
        log: () => {},
        runCommand: () => {
          throw new Error('ffmpeg missing in strict runtime')
        },
      })

      expect(state.failed).toBeGreaterThan(0)
      expect(state.results.some((result) => result.status === 'fail' && result.name.includes('strict runtime mode'))).toBe(true)
    })

    it('proof script does not require provider keys', () => {
      const scriptPath = path.join(ROOT, 'scripts/proof-long-form-runtime.mjs')
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).not.toContain('GROQ_API_KEY')
      expect(content).not.toContain('TOGETHER_API_KEY')
      expect(content).not.toContain('GENX_API_KEY')
      expect(content).not.toContain('DEEPINFRA_API_KEY')
    })

    it('proof script does not make live provider calls', () => {
      const scriptPath = path.join(ROOT, 'scripts/proof-long-form-runtime.mjs')
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).not.toContain('https://api.together.xyz')
      expect(content).not.toContain('https://api.groq.com')
      expect(content).not.toContain('https://query.genx.sh')
      expect(content).not.toContain('https://api.deepinfra.com')
    })
  })

  describe('Proof script runs without provider keys', () => {
    it('assembly module does not require GROQ_API_KEY', () => {
      const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts')
      const content = fs.readFileSync(modulePath, 'utf-8')
      // Check that the module doesn't access process.env.GROQ_API_KEY
      expect(content).not.toContain('process.env.GROQ_API_KEY')
    })

    it('assembly module does not require TOGETHER_API_KEY', () => {
      const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts')
      const content = fs.readFileSync(modulePath, 'utf-8')
      // Check that the module doesn't access process.env.TOGETHER_API_KEY
      expect(content).not.toContain('process.env.TOGETHER_API_KEY')
    })

    it('assembly module does not require GENX_API_KEY', () => {
      const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts')
      const content = fs.readFileSync(modulePath, 'utf-8')
      // Check that the module doesn't access process.env.GENX_API_KEY
      expect(content).not.toContain('process.env.GENX_API_KEY')
    })

    it('assembly module does not make live provider calls', () => {
      const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts')
      const content = fs.readFileSync(modulePath, 'utf-8')
      // Should not contain direct API calls to providers (fetch calls to provider URLs)
      expect(content).not.toContain('fetch(\'https://api.together.xyz')
      expect(content).not.toContain('fetch(\'https://api.groq.com')
      expect(content).not.toContain('fetch(\'https://query.genx.sh')
    })
  })

  describe('Docker/runtime config installs ffmpeg', () => {
    it('Dockerfile installs ffmpeg in api stage', () => {
      const dockerfilePath = path.join(ROOT, 'Dockerfile')
      const content = fs.readFileSync(dockerfilePath, 'utf-8')
      
      // Check that ffmpeg is installed in the api stage
      const apiStageMatch = content.match(/FROM production-base AS api[\s\S]*?(?=FROM|$)/)
      expect(apiStageMatch).not.toBeNull()
      
      const apiStage = apiStageMatch[0]
      expect(apiStage).toContain('ffmpeg')
    })

    it('Dockerfile uses Debian-safe ffmpeg install', () => {
      const dockerfilePath = path.join(ROOT, 'Dockerfile')
      const content = fs.readFileSync(dockerfilePath, 'utf-8')
      
      // Should use apt-get install with --no-install-recommends
      expect(content).toContain('apt-get install')
      expect(content).toContain('--no-install-recommends')
      expect(content).toContain('ffmpeg')
      
      // Should clean up apt lists
      expect(content).toContain('rm -rf /var/lib/apt/lists/*')
    })
  })

  describe('checkFfmpegAvailable is used by routes', () => {
    it('status route uses checkFfmpegAvailable', () => {
      const routePath = path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts')
      const content = fs.readFileSync(routePath, 'utf-8')
      expect(content).toContain('checkFfmpegAvailable')
    })

    it('assembly route uses checkFfmpegAvailable', () => {
      const routePath = path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts')
      const content = fs.readFileSync(routePath, 'utf-8')
      
      // Check that the file contains both the assemble route and checkFfmpegAvailable
      expect(content).toContain('/api/admin/long-form-video/assemble')
      expect(content).toContain('checkFfmpegAvailable')
    })
  })

  describe('fullMultimediaReady remains false', () => {
    it('audit reports fullMultimediaReady false', () => {
      const auditScriptPath = path.join(ROOT, 'scripts/audit-build-completion-map.mjs')
      const content = fs.readFileSync(auditScriptPath, 'utf-8')
      expect(content).toContain('fullMultimediaReady: false')
    })

    it('music_generation capability is not executable', async () => {
      const { routeBrain } = await import('../packages/core/src/index.ts')
      
      const decision = routeBrain({
        capability: 'music_generation',
        routingMode: 'balanced',
      })
      
      expect(decision.executionAllowed).toBe(false)
    })
  })

  describe('music_generation remains pending', () => {
    it('music provider client is not implemented', async () => {
      const { MODEL_CATALOGUE } = await import('../packages/core/src/index.ts')
      
      const musicModels = MODEL_CATALOGUE.filter(m => 
        m.capabilities.includes('music_generation') && m.executable
      )
      
      expect(musicModels.length).toBe(0)
    })

    it('music worker executor does not exist', () => {
      const workerExecutorPath = path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts')
      const content = fs.readFileSync(workerExecutorPath, 'utf-8')
      
      // Should not have music-specific executor
      expect(content).not.toContain('executeMusicGeneration')
      expect(content).not.toContain('musicGeneration')
    })
  })

  describe('no providers added', () => {
    it('PROVIDER_KEYS remains exactly 5', async () => {
      const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
      
      expect(PROVIDER_KEYS).toHaveLength(5)
      expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    })

    it('no banned providers in PROVIDER_KEYS', async () => {
      const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
      
      const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
      banned.forEach(provider => {
        expect(PROVIDER_KEYS).not.toContain(provider)
      })
    })
  })

  describe('adult remains on hold', () => {
    it('adult capabilities remain blocked', async () => {
      const { routeBrain } = await import('../packages/core/src/index.ts')
      
      const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
      
      for (const cap of adultCaps) {
        const decision = routeBrain({
          capability: cap,
          routingMode: 'balanced',
        })
        
        expect(decision.executionAllowed).toBe(false)
      }
    })

    it('no adult models in executable catalogue', async () => {
      const { MODEL_CATALOGUE } = await import('../packages/core/src/index.ts')
      
      const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
      
      const adultModels = MODEL_CATALOGUE.filter(m => 
        m.capabilities.some(cap => adultCaps.includes(cap)) && m.executable
      )
      
      expect(adultModels.length).toBe(0)
    })
  })

  describe('Audit distinguishes ffmpeg availability', () => {
    it('audit reports ffmpegAvailableLocal', () => {
      const auditScriptPath = path.join(ROOT, 'scripts/audit-build-completion-map.mjs')
      const content = fs.readFileSync(auditScriptPath, 'utf-8')
      expect(content).toContain('ffmpegAvailableLocal')
    })

    it('audit reports ffmpegExpectedInRuntime', () => {
      const auditScriptPath = path.join(ROOT, 'scripts/audit-build-completion-map.mjs')
      const content = fs.readFileSync(auditScriptPath, 'utf-8')
      expect(content).toContain('ffmpegExpectedInRuntime')
    })

    it('audit separates pipeline readiness from actual readiness', () => {
      const auditScriptPath = path.join(ROOT, 'scripts/audit-build-completion-map.mjs')
      const content = fs.readFileSync(auditScriptPath, 'utf-8')
      
      expect(content).toContain('videoOnlyAssemblyPipelineReady')
      expect(content).toContain('videoOnlyReady')
    })
  })
})
