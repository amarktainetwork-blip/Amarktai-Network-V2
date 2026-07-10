import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, modelFromProviderRecord, skippedResult, type DiscoveryAdapterOptions } from './common.js'

export async function discoverMimoProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const mimoModel = modelFromProviderRecord({
    provider: 'mimo',
    modelId: 'mimo-v2.5-pro',
    displayName: 'MiMo V2.5 Pro',
    rawProviderType: 'coding_tools_only',
    category: 'text',
    endpointSource: 'MiMo official docs fallback only',
    lastDiscoveredAt: timestamp,
    source: 'docs_fallback',
    discoverySource: 'docs_fallback',
    providerClientExists: false,
    workerExecutorExists: false,
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    policyRestrictedByApp: true,
    policyBlockedReason: 'coding_agent_only_not_backend_runtime',
    transportProfile: 'docs_only_policy_restricted',
  })
  mimoModel.executableNow = false
  mimoModel.blockedReason = 'MiMo remains coding_tools_only and must not be runtime-selected.'
  const models = [mimoModel]
  return skippedResult('mimo', 'coding_tools_only_policy', models, ['MiMo discovery records policy truth only. No runtime backend client is exported.'])
}
