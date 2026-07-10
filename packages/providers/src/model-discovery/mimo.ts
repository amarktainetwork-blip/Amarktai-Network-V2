import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, modelFromProviderRecord, skippedResult, type DiscoveryAdapterOptions } from './common.js'

export async function discoverMimoProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const mimoModel = modelFromProviderRecord({
    provider: 'mimo',
    modelId: 'mimo-v1',
    displayName: 'MiMo V1',
    rawProviderType: 'coding_tools_only',
    endpointSource: 'repo_policy_coding_tools_only',
    lastDiscoveredAt: timestamp,
    source: 'static_repo',
    providerClientExists: false,
    workerExecutorExists: false,
    endpointShapeKnown: false,
    requestShapeKnown: false,
    responseShapeKnown: false,
  })
  mimoModel.executableNow = false
  mimoModel.blockedReason = 'MiMo remains coding_tools_only and must not be runtime-selected.'
  const models = [mimoModel]
  return skippedResult('mimo', 'coding_tools_only_policy', models, ['MiMo discovery records policy truth only. No runtime backend client is exported.'])
}
