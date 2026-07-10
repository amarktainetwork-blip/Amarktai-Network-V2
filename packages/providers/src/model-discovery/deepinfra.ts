import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const DEEPINFRA_MODELS_ENDPOINT = 'https://api.deepinfra.com/models/list'

export async function discoverDeepInfraProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'deepinfra', modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Meta Llama 3.1 8B Instruct', rawProviderType: 'chat', category: 'text', endpointSource: 'repo_static_deepinfra_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, streamingSupported: true, transportProfile: 'openai_chat_sse', batchSupported: true }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('deepinfra', DEEPINFRA_MODELS_ENDPOINT, staticModels, ['DeepInfra safe discovery uses public/docs fallback. Live discovery uses public /models/list only; execution still requires known endpoint/request/response/client/executor readiness.'])
  }

  try {
    const records = await fetchModelList(DEEPINFRA_MODELS_ENDPOINT, options.apiKey)
    const models = records
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => {
        const modelId = stringField(record, ['id', 'model'])
        const rawType = stringField(record, ['task', 'pipeline_tag', 'type', 'object'])
        const isChat = !/image|video|music|speech|audio|embed|rerank/i.test(`${modelId} ${rawType}`)
        return modelFromProviderRecord({
          provider: 'deepinfra',
          modelId,
          displayName: stringField(record, ['name', 'id'], modelId),
          rawProviderType: rawType,
          endpointSource: DEEPINFRA_MODELS_ENDPOINT,
          lastDiscoveredAt: timestamp,
          source: 'live_endpoint',
          discoverySource: 'live_endpoint',
          providerClientExists: isChat,
          workerExecutorExists: isChat,
          contextWindow: numberField(record, ['max_model_len', 'context_window', 'context']),
          rawMetadata: record,
          streamingSupported: isChat,
          batchSupported: true,
        })
      })
      .filter((model) => model.modelId)
    return liveResult('deepinfra', DEEPINFRA_MODELS_ENDPOINT, 'live_model_list', models, ['DeepInfra live discovery used the OpenAI-compatible models endpoint only.'])
  } catch (error) {
    return failedLiveResult('deepinfra', DEEPINFRA_MODELS_ENDPOINT, error instanceof Error ? error.message : 'DeepInfra discovery failed', [])
  }
}
