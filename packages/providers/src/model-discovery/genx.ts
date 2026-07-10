import { getGenxBaseUrl, type ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, type DiscoveryAdapterOptions } from './common.js'

const GENX_MODEL_CATEGORIES = ['', 'video', 'image', 'avatar', 'audio', 'voice', 'music', 'multimodal']

function genxModelsEndpoint(baseUrl: string, category?: string): string {
  const url = new URL('/api/v1/models', baseUrl)
  if (category) url.searchParams.set('category', category)
  return url.toString()
}

function isMusicLike(modelId: string, rawType: string): boolean {
  return /music|lyria|song|audio-generation|text-to-music/i.test(`${modelId} ${rawType}`)
}

export async function discoverGenXProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const baseUrl = options.baseUrl || getGenxBaseUrl()
  const endpointSource = `${new URL('/api/v1/models', baseUrl).toString()}?category=*`
  const staticModels = [
    modelFromProviderRecord({ provider: 'genx', modelId: 'seedance-v1-fast', displayName: 'Seedance V1 Fast', rawProviderType: 'video', endpointSource: 'repo_static_genx_client', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: true, workerExecutorExists: true }),
    modelFromProviderRecord({ provider: 'genx', modelId: 'genx-image-v1', displayName: 'GenX Image V1', rawProviderType: 'image', endpointSource: 'manual_planned_genx_image', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: false, requestShapeKnown: false, responseShapeKnown: false }),
    modelFromProviderRecord({ provider: 'genx', modelId: 'genx-longform-v1', displayName: 'GenX Long-Form V1', rawProviderType: 'long_form_video', endpointSource: 'manual_planned_long_form', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: false, requestShapeKnown: false, responseShapeKnown: false }),
    modelFromProviderRecord({ provider: 'genx', modelId: 'music-generation-provider-client-pending', displayName: 'Music Generation Provider Client Pending', rawProviderType: 'music', endpointSource: 'manual_planned_music', lastDiscoveredAt: timestamp, source: 'static_repo', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: false, requestShapeKnown: false, responseShapeKnown: false }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('genx', endpointSource, staticModels, ['GenX safe discovery inspects repo/client truth only. Live mode sweeps /api/v1/models categories and checks for music/Lyria-like models without generation calls.'])
  }

  try {
    const byId = new Map<string, Record<string, unknown>>()
    for (const category of GENX_MODEL_CATEGORIES) {
      const records = await fetchModelList(genxModelsEndpoint(baseUrl, category), options.apiKey)
      for (const item of records) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        const modelId = stringField(record, ['id', 'model', 'slug'])
        if (!modelId) continue
        byId.set(modelId, { ...byId.get(modelId), ...record, category: record.category ?? category })
      }
    }

    const models = [...byId.values()].map((record) => {
      const modelId = stringField(record, ['id', 'model', 'slug'])
      const rawType = stringField(record, ['category', 'type', 'kind'])
      const musicLike = isMusicLike(modelId, rawType)
      const videoLike = /video|seedance|veo|wan/i.test(`${modelId} ${rawType}`)
      return modelFromProviderRecord({
        provider: 'genx',
        modelId,
        displayName: stringField(record, ['name', 'displayName', 'id'], modelId),
        rawProviderType: musicLike ? `music ${rawType}` : rawType,
        endpointSource,
        lastDiscoveredAt: timestamp,
        source: 'live_discovered',
        providerClientExists: videoLike && !musicLike,
        workerExecutorExists: videoLike && !musicLike,
        endpointShapeKnown: videoLike || musicLike,
        requestShapeKnown: videoLike && !musicLike,
        responseShapeKnown: videoLike && !musicLike,
        rawMetadata: record,
      })
    })

    return liveResult('genx', endpointSource, 'live_model_list', models, ['GenX live discovery swept model-list categories only. Music/Lyria-like models are catalogued but not executable without client, request/response shape, worker, and artifact path.'])
  } catch (error) {
    return failedLiveResult('genx', endpointSource, error instanceof Error ? error.message : 'GenX discovery failed', [])
  }
}
