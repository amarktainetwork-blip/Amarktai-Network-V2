import { getRuntimeModelPolicyBlocker } from '@amarktai/core/model-family-policy'
import type { ProviderDiscoveryResult, ProviderKey } from '@amarktai/core'
import { discoverDeepInfraProviderModels } from './deepinfra.js'
import { discoverGenXProviderModels } from './genx.js'
import { discoverMimoProviderModels } from './mimo.js'
import { discoverTogetherProviderModels } from './together.js'
import type { DiscoveryAdapterOptions } from './common.js'

export interface ProviderModelDiscoveryRunOptions {
  live?: boolean
  apiKeys?: Partial<Record<ProviderKey, string>>
  genxBaseUrl?: string
  now?: string
}

function applyRuntimeModelFamilyPolicy(result: ProviderDiscoveryResult): ProviderDiscoveryResult {
  const excluded = result.models
    .map((model) => ({ model, blocker: getRuntimeModelPolicyBlocker(model.modelId) }))
    .filter((entry): entry is { model: typeof result.models[number]; blocker: NonNullable<ReturnType<typeof getRuntimeModelPolicyBlocker>> } => entry.blocker !== null)
  if (!excluded.length) return result
  const excludedIds = new Set(excluded.map((entry) => entry.model.modelId))
  const models = result.models.filter((model) => !excludedIds.has(model.modelId))
  const reasons = [...new Set(excluded.map((entry) => entry.blocker))]
  return {
    ...result,
    models,
    totalDiscovered: models.length,
    returnedModelCount: models.length,
    effectiveCatalogueCount: models.length,
    notes: [
      ...result.notes,
      `Runtime model-family policy excluded ${excluded.length} model(s): ${reasons.join(', ')}. Provider hosting does not override removed or coding-only model-family rules.`,
    ],
  }
}

export async function runProviderModelDiscovery(options: ProviderModelDiscoveryRunOptions = {}): Promise<ProviderDiscoveryResult[]> {
  const live = options.live === true
  const results = await Promise.all([
    discoverGenXProviderModels({ live, apiKey: options.apiKeys?.genx, baseUrl: options.genxBaseUrl, now: options.now }),
    discoverTogetherProviderModels({ live, apiKey: options.apiKeys?.together, now: options.now }),
    discoverMimoProviderModels({ live, apiKey: options.apiKeys?.mimo, now: options.now }),
    discoverDeepInfraProviderModels({ live, apiKey: options.apiKeys?.deepinfra, now: options.now }),
  ])
  return results.map(applyRuntimeModelFamilyPolicy)
}

export {
  discoverDeepInfraProviderModels,
  discoverGenXProviderModels,
  discoverMimoProviderModels,
  discoverTogetherProviderModels,
  type DiscoveryAdapterOptions,
}
