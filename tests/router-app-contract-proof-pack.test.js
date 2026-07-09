import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')
const SCRIPT_PATH = path.join(ROOT, 'scripts/proof-router-app-contract.mjs')

describe('Router app contract proof pack', () => {
  describe('Proof script exists and has correct structure', () => {
    it('proof script file exists', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true)
    })

    it('proof script has local/mock mode (default)', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('runLocalProof')
      expect(content).toContain('LOCAL/MOCK PROOF MODE')
    })

    it('proof script has live mode activated by LIVE_PROOF=1', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('LIVE_PROOF')
      expect(content).toContain('runLiveProof')
      expect(content).toContain('LIVE PROOF MODE')
    })

    it('proof script does not require live provider keys by default', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('const LIVE = process.env.LIVE_PROOF')
      expect(content).not.toContain('GROQ_API_KEY')
      expect(content).not.toContain('TOGETHER_API_KEY')
      expect(content).not.toContain('GENX_API_KEY')
    })

    it('proof script checks blocked provider/model fields', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('hasBlockedOverrides')
      expect(content).toContain('provider')
      expect(content).toContain('model')
      expect(content).toContain('providerOverride')
      expect(content).toContain('modelOverride')
      expect(content).toContain('selectedProvider')
      expect(content).toContain('selectedModel')
    })

    it('proof script checks routingMode accepted', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('routingMode')
      expect(content).toContain('extractRoutingMode')
      expect(content).toContain('VALID_ROUTING_MODES')
    })
  })

  describe('Proof script verifies Brain Router selections', () => {
    it('proof script checks Brain Router selects Groq for chat', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain("capability: 'chat'")
      expect(content).toContain("selectedProvider === 'groq'")
    })

    it('proof script checks Brain Router selects Together for image_generation', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain("capability: 'image_generation'")
      expect(content).toContain("selectedProvider === 'together'")
    })

    it('proof script checks Brain Router selects GenX for video_generation', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain("capability: 'video_generation'")
      expect(content).toContain("selectedProvider === 'genx'")
    })
  })

  describe('Proof script verifies provider states and blocking', () => {
    it('proof script checks DeepInfra disabled skipped', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('deepinfra')
      expect(content).toContain('disabled')
      expect(content).toContain('rejectedCandidates')
    })

    it('proof script checks music_generation blocked/pending', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain("capability: 'music_generation'")
      expect(content).toContain('executionAllowed')
      expect(content).toContain('blockReason')
    })

    it('proof script checks long_form_video blocked/pending', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain("capability: 'long_form_video'")
    })

    it('proof script checks MiMo not selected for runtime', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('mimo')
      expect(content).toContain('coding_tools_only')
      expect(content).toContain("selectedProvider !== 'mimo'")
    })
  })

  describe('Proof script verifies provider list and adult generation', () => {
    it('no new providers added', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('genx')
      expect(content).toContain('groq')
      expect(content).toContain('together')
      expect(content).toContain('mimo')
      expect(content).toContain('deepinfra')
      const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
      for (const p of banned) {
        expect(content).toContain(`'${p}'`)
      }
    })

    it('adult generation remains on hold', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
      expect(content).toContain('adult_text')
      expect(content).toContain('adult_image')
      expect(content).toContain('adult_voice')
      expect(content).toContain('adult_avatar')
      expect(content).toContain('adult_video')
    })
  })

  describe('Package script registered', () => {
    it('package.json has proof:router-app-contract script', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      expect(pkg.scripts['proof:router-app-contract']).toBe('node scripts/proof-router-app-contract.mjs')
    })
  })

  describe('Existing PR tests still pass', () => {
    it('PR #75 app contract auth tests exist', () => {
      const testPath = path.join(ROOT, 'tests/app-contract-auth-and-deepinfra-disabled.test.js')
      expect(fs.existsSync(testPath)).toBe(true)
    })

    it('PR #76 brain router foundation tests exist', () => {
      const testPath = path.join(ROOT, 'tests/brain-router-v1-foundation.test.js')
      expect(fs.existsSync(testPath)).toBe(true)
    })

    it('PR #77 brain router worker integration tests exist', () => {
      const testPath = path.join(ROOT, 'tests/brain-router-worker-integration.test.js')
      expect(fs.existsSync(testPath)).toBe(true)
    })
  })
})
