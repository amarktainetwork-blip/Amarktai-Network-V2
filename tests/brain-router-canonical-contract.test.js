import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_KEYS,
  CODING_ONLY_PROVIDERS,
  PROVIDER_KEYS,
  RUNTIME_EXECUTION_PROVIDERS,
  ROUTING_MODES,
  routeBrain,
} from '../packages/core/src/index.ts'

const ROOT = process.cwd()

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

describe('canonical provider routing recovery', () => {
  it('removes the old provider-routing skeleton source', () => {
    expect(fs.existsSync(path.join(ROOT, 'packages/core/src/provider-routing.ts'))).toBe(false)
    expect(source('packages/core/src/index.ts')).not.toContain('./provider-routing.js')
  })

  it('keeps provider policy exact', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    expect([...RUNTIME_EXECUTION_PROVIDERS]).toEqual(['genx', 'groq', 'together', 'deepinfra'])
    expect([...CODING_ONLY_PROVIDERS]).toEqual(['mimo'])
  })

  it('routes through Brain Router for every canonical capability without provider/model override exposure', () => {
    for (const capability of CAPABILITY_KEYS) {
      const decision = routeBrain({ capability, routingMode: 'balanced' })
      expect(decision.appFacingProviderOverride).toBe(false)
      expect(decision.appFacingModelOverride).toBe(false)
      expect(decision.truth).toContain('Brain Router v1')
    }
  })

  it('supports the canonical routing modes only', () => {
    expect([...ROUTING_MODES]).toEqual(['balanced', 'premium', 'fast', 'budget', 'experimental'])
  })

  it('worker provider executor imports routeBrain and not routeProvider', () => {
    const worker = source('apps/worker/src/providers/provider-executor.ts')
    expect(worker).toContain('routeBrain')
    expect(worker).not.toContain('routeProvider')
  })
})
