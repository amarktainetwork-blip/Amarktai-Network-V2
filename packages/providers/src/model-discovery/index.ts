import type { ProviderDiscoveryResult, ProviderKey } from '@amarktai/core'
import { discoverDeepInfraProviderModels } from './deepinfra.js'
import { discoverGenXProviderModels } from './genx.js'
import { discoverGroqProviderModels } from './groq.js'
import { discoverMimoProviderModels } from './mimo.js'
import { discoverTogetherProviderModels } from './together.js'
import type { DiscoveryAdapterOptions } from './common.js'

export interface ProviderModelDiscoveryRunOptions {
  live?: boolean
  apiKeys?: Partial<Record<ProviderKey, string>>
  genxBaseUrl?: string
  now?: string
}

export async function runProviderModelDiscovery(options: ProviderModelDiscoveryRunOptions = {}): Promise<ProviderDiscoveryResult[]> {
  const live = options.live === true
  return Promise.all([
    discoverGenXProviderModels({ live, apiKey: options.apiKeys?.genx, baseUrl: options.genxBaseUrl, now: options.now }),
    discoverGroqProviderModels({ live, apiKey: options.apiKeys?.groq, now: options.now }),
    discoverTogetherProviderModels({ live, apiKey: options.apiKeys?.together, now: options.now }),
    discoverMimoProviderModels({ live, apiKey: options.apiKeys?.mimo, now: options.now }),
    discoverDeepInfraProviderModels({ live, apiKey: options.apiKeys?.deepinfra, now: options.now }),
  ])
}

export {
  discoverDeepInfraProviderModels,
  discoverGenXProviderModels,
  discoverGroqProviderModels,
  discoverMimoProviderModels,
  discoverTogetherProviderModels,
  type DiscoveryAdapterOptions,
}
