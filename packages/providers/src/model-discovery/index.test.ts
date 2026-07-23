import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderDiscoveryResult, ProviderKey } from '@amarktai/core'

vi.mock('./genx.js', () => ({ discoverGenXProviderModels: vi.fn() }))
vi.mock('./together.js', () => ({ discoverTogetherProviderModels: vi.fn() }))
vi.mock('./mimo.js', () => ({ discoverMimoProviderModels: vi.fn() }))
vi.mock('./deepinfra.js', () => ({ discoverDeepInfraProviderModels: vi.fn() }))

import { discoverGenXProviderModels } from './genx.js'
import { discoverTogetherProviderModels } from './together.js'
import { discoverMimoProviderModels } from './mimo.js'
import { discoverDeepInfraProviderModels } from './deepinfra.js'
import { runProviderModelDiscovery } from './index.js'

function result(provider: ProviderKey, modelIds: string[]): ProviderDiscoveryResult {
  return {
    provider,
    mode: 'live_model_list',
    source: 'live_endpoint',
    models: modelIds.map((modelId) => ({ modelId }) as ProviderDiscoveryResult['models'][number]),
    totalDiscovered: modelIds.length,
    liveDiscoveryAttempted: true,
    liveDiscoverySkipped: false,
    endpointSource: 'fixture',
    error: null,
    discoveredAt: '2026-07-22T20:00:00.000Z',
    notes: [],
  }
}

beforeEach(() => {
  vi.mocked(discoverGenXProviderModels).mockResolvedValue(result('genx', []))
  vi.mocked(discoverTogetherProviderModels).mockResolvedValue(result('together', ['Qwen/Qwen3-235B', 'meta-llama/Llama-3.3-70B-Instruct']))
  vi.mocked(discoverMimoProviderModels).mockResolvedValue(result('mimo', ['XiaomiMiMo/MiMo-V2.5']))
  vi.mocked(discoverDeepInfraProviderModels).mockResolvedValue(result('deepinfra', [
    'Qwen/Qwen3-TTS',
    'XiaomiMiMo/MiMo-V2.5-tts',
    'hexgrad/Kokoro-82M',
  ]))
})

describe('runProviderModelDiscovery runtime policy', () => {
  it('removes Qwen and MiMo model families regardless of hosting provider', async () => {
    const results = await runProviderModelDiscovery({ live: true })
    const together = results.find((entry) => entry.provider === 'together')!
    const deepinfra = results.find((entry) => entry.provider === 'deepinfra')!
    const mimo = results.find((entry) => entry.provider === 'mimo')!

    expect(together.models.map((model) => model.modelId)).toEqual(['meta-llama/Llama-3.3-70B-Instruct'])
    expect(deepinfra.models.map((model) => model.modelId)).toEqual(['hexgrad/Kokoro-82M'])
    expect(mimo.models).toEqual([])
    expect(deepinfra.notes.join(' ')).toContain('removed_model_family_qwen')
    expect(deepinfra.notes.join(' ')).toContain('coding_only_model_family_mimo')
    expect(deepinfra.totalDiscovered).toBe(1)
    expect(deepinfra.effectiveCatalogueCount).toBe(1)
  })
})
