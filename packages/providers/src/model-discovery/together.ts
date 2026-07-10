import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const TOGETHER_MODELS_ENDPOINT = 'https://api.together.xyz/v1/models'

export async function discoverTogetherProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell', rawProviderType: 'image', endpointSource: 'repo_static_together_client', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: true, workerExecutorExists: true, batchSupported: true }),
    modelFromProviderRecord({ provider: 'together', modelId: 'togethercomputer/m2-bert-80M-32k-retrieval', displayName: 'M2-BERT 80M 32K Retrieval', rawProviderType: 'embedding', endpointSource: 'repo_static_embeddings_client', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: true, workerExecutorExists: false, batchSupported: true }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('together', TOGETHER_MODELS_ENDPOINT, staticModels, ['Together live discovery uses GET /v1/models only when --live and TOGETHER_API_KEY are present.'])
  }

  try {
    const records = await fetchModelList(TOGETHER_MODELS_ENDPOINT, options.apiKey)
    const models = records
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => {
        const rawType = stringField(record, ['type', 'object', 'display_type'])
        const modelId = stringField(record, ['id', 'model', 'name'])
        const isImage = `${rawType} ${modelId}`.toLowerCase().includes('image') || modelId.toLowerCase().includes('flux')
        return modelFromProviderRecord({
          provider: 'together',
          modelId,
          displayName: stringField(record, ['display_name', 'name', 'id'], modelId),
          rawProviderType: rawType,
          endpointSource: TOGETHER_MODELS_ENDPOINT,
          lastDiscoveredAt: timestamp,
          source: 'live_discovered',
          providerClientExists: isImage,
          workerExecutorExists: isImage,
          contextWindow: numberField(record, ['context_length', 'contextWindow']),
          rawMetadata: record,
          batchSupported: true,
        })
      })
      .filter((model) => model.modelId)
    return liveResult('together', TOGETHER_MODELS_ENDPOINT, 'live_model_list', models, ['Together live discovery used the model-list endpoint only.'])
  } catch (error) {
    return failedLiveResult('together', TOGETHER_MODELS_ENDPOINT, error instanceof Error ? error.message : 'Together discovery failed', [])
  }
}
