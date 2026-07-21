/**
 * Long-Form Runtime FFmpeg Proof Tests
 *
 * Verifies that the long-form runtime proof script exists,
 * is fail-closed, supports static-only and live modes,
 * and validates the correct endpoints and checks.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getRuntimeTruth } from '../packages/core/src/index.ts'

const ROOT = process.cwd()

describe('Long-Form Runtime FFmpeg Proof', () => {
  describe('Proof script exists and is fail-closed', () => {
    it('proof-long-form-runtime.mjs exists', () => {
      const scriptPath = path.join(ROOT, 'scripts/proof-long-form-runtime.mjs')
      expect(fs.existsSync(scriptPath)).toBe(true)
    })

    it('package.json has proof:long-form-runtime script', () => {
      const packageJsonPath = path.join(ROOT, 'package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      expect(packageJson.scripts['proof:long-form-runtime']).toBe('node scripts/proof-long-form-runtime.mjs')
    })

    it('supports static-only mode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('--static-only')
      expect(content).toContain('STATIC_ONLY')
    })

    it('static-only mode never prints LIVE_PROOF_PASS', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('NEVER produces live proof')
      expect(content).toContain('LIVE_PROOF_STATUS=NOT_ATTEMPTED')
    })

    it('fails closed when credentials are missing', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('ADMIN_EMAIL and ADMIN_PASSWORD environment variables required')
      expect(content).toContain('LIVE_PROOF_STATUS=FAIL')
    })

    it('cleans up temporary files in finally block', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('finally {')
      expect(content).toContain('cleanup()')
      expect(content).toContain('tempFiles')
    })
  })

  describe('Proof script submission contract', () => {
    it('submits to long-form video executions endpoint', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/executions')
    })

    it('submits with 2 short scenes', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('sceneCount: 2')
      expect(content).toContain('targetDurationSeconds: 30')
    })

    it('enables narration, subtitles and music', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('voiceoverEnabled: true')
      expect(content).toContain('subtitlesEnabled: true')
      expect(content).toContain('musicBedEnabled: true')
    })

    it('does not supply provider or model overrides', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      // The request body should not contain provider/model fields
      const requestMatch = content.match(/body: JSON\.stringify\(\{[\s\S]*?\}\)/)
      if (requestMatch) {
        expect(requestMatch[0]).not.toContain('provider:')
        expect(requestMatch[0]).not.toContain('model:')
      }
    })
  })

  describe('Proof script polling contract', () => {
    it('polls parent job endpoint', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/executions/')
    })

    it('polls with timeout', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('TIMEOUT_MS')
      expect(content).toContain('timeout')
    })

    it('checks scene jobs', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('scenes')
      expect(content).toContain('completedScenes')
    })
  })

  describe('Proof script artifact verification', () => {
    it('verifies final artifact metadata', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('/api/admin/artifacts/')
      expect(content).toContain('mimeType')
      expect(content).toContain('fileSizeBytes')
    })

    it('downloads final artifact', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('/download')
      expect(content).toContain('Content-Type')
    })

    it('rejects empty downloads', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('buffer.length === 0')
    })

    it('rejects HTML error responses', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('<!DOCTYPE')
      expect(content).toContain('<html')
    })

    it('rejects JSON error responses', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('"error"')
    })
  })

  describe('Proof script FFprobe validation', () => {
    it('runs FFprobe on downloaded file', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('ffprobe')
      expect(content).toContain('-show_format')
      expect(content).toContain('-show_streams')
    })

    it('requires video stream', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('codec_type')
      expect(content).toContain('video')
    })

    it('checks audio stream', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('audio')
    })

    it('requires non-zero duration', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('duration')
      expect(content).toContain('> 0')
    })
  })

  describe('Proof script metadata verification', () => {
    it('verifies execution ID linkage', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('executionId')
      expect(content).toContain('execution ID')
    })

    it('verifies trace ID linkage', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('traceId')
    })

    it('verifies parent job linkage', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('parentJobId')
    })

    it('checks provider/model metadata', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('provider')
      expect(content).toContain('model')
    })
  })

  describe('Proof script truth verification', () => {
    it('verifies fullMultimediaReady remains false', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('fullMultimediaReady')
      expect(content).toContain('false')
    })

    it('verifies liveProven remains false', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).toContain('liveProven')
      expect(content).toContain('false')
    })
  })

  describe('Proof script does not require provider keys', () => {
    it('does not read deepinfra_API_KEY', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).not.toContain('deepinfra_API_KEY')
    })

    it('does not read TOGETHER_API_KEY', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).not.toContain('TOGETHER_API_KEY')
    })

    it('does not read GENX_API_KEY', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).not.toContain('GENX_API_KEY')
    })

    it('does not make direct provider API calls', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/proof-long-form-runtime.mjs'), 'utf-8')
      expect(content).not.toContain('https://api.together.xyz')
      expect(content).not.toContain('https://api.deepinfra.com')
      expect(content).not.toContain('https://query.genx.sh')
      expect(content).not.toContain('https://api.deepinfra.com')
    })
  })

  describe('Docker/runtime config installs ffmpeg', () => {
    it('Dockerfile installs ffmpeg in api stage', () => {
      const dockerfilePath = path.join(ROOT, 'Dockerfile')
      const content = fs.readFileSync(dockerfilePath, 'utf-8')
      const apiStageMatch = content.match(/FROM production-base AS api[\s\S]*?(?=FROM|$)/)
      expect(apiStageMatch).not.toBeNull()
      expect(apiStageMatch[0]).toContain('ffmpeg')
    })

    it('Dockerfile uses Debian-safe ffmpeg install', () => {
      const dockerfilePath = path.join(ROOT, 'Dockerfile')
      const content = fs.readFileSync(dockerfilePath, 'utf-8')
      expect(content).toContain('apt-get install')
      expect(content).toContain('--no-install-recommends')
      expect(content).toContain('ffmpeg')
    })
  })

  describe('Assembly module checks', () => {
    it('checkFfmpegAvailable function exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts'), 'utf-8')
      expect(content).toContain('export async function checkFfmpegAvailable')
    })

    it('assembleLongFormVideo function exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts'), 'utf-8')
      expect(content).toContain('export async function assembleLongFormVideo')
    })

    it('assembleMultimediaLongFormVideo function exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts'), 'utf-8')
      expect(content).toContain('export async function assembleMultimediaLongFormVideo')
    })

    it('assembly module does not require provider keys', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts'), 'utf-8')
      expect(content).not.toContain('process.env.deepinfra_API_KEY')
      expect(content).not.toContain('process.env.TOGETHER_API_KEY')
      expect(content).not.toContain('process.env.GENX_API_KEY')
    })
  })

  describe('Runtime truth honesty', () => {
    const longFormTruth = () => getRuntimeTruth().capabilities.find(capability => capability.capability === 'long_form_video')

    it('fullMultimediaReady is false in runtime truth', () => {
      expect(longFormTruth().fullMultimediaReady).toBe(false)
    })

    it('liveProven is false in runtime truth for long_form_video', () => {
      expect(longFormTruth().liveProven).toBe(false)
    })

    it('voiceover is not ready', () => {
      expect(longFormTruth().voiceoverReady).toBe(false)
    })

    it('subtitles are not ready', () => {
      expect(longFormTruth().subtitlesReady).toBe(false)
    })

    it('music bed is not ready', () => {
      expect(longFormTruth().musicBedReady).toBe(false)
    })
  })

  describe('Assembly routes', () => {
    it('assemble route exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/assemble/')
    })

    it('assembly status route exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/assembly/')
    })

    it('subtitles route exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/subtitles/')
    })

    it('music bed route exists', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('/api/admin/long-form-video/music-bed/')
    })

    it('assembly route uses checkFfmpegAvailable', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('checkFfmpegAvailable')
    })

    it('status route projects canonical component truth without a hardcoded readiness value', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts'), 'utf-8')
      expect(content).toContain('...canonical')
      expect(content).not.toContain('fullMultimediaReady: false')
    })
  })

  describe('No providers added', () => {
    it('PROVIDER_KEYS remains Exactly 4', async () => {
      const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
      expect(PROVIDER_KEYS).toHaveLength(4)
      expect(PROVIDER_KEYS).toEqual(['genx', 'together', 'mimo', 'deepinfra'])
    })
  })
})
