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
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'bytedance', modelId: 'seedance-v1-fast', displayName: 'Seedance V1 Fast', rawProviderType: 'video', category: 'video', endpointSource: 'repo_static_genx_client', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'veo-3.1', displayName: 'Veo 3.1', rawProviderType: 'video', category: 'video', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'xai', modelId: 'grok-imagine-video', displayName: 'Grok Imagine Video', rawProviderType: 'video', category: 'video', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'genx', modelId: 'genx-image-v1', displayName: 'GenX Image V1', rawProviderType: 'image', category: 'image', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'lyria-3-clip-preview', displayName: 'Lyria 3 Clip Preview', rawProviderType: 'music', category: 'audio', modalitiesIn: ['text', 'image'], modalitiesOut: ['audio', 'text'], endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll', catalogueOnlyReason: '' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'lyria-3-pro-preview', displayName: 'Lyria 3 Pro Preview', rawProviderType: 'music', category: 'audio', modalitiesIn: ['text', 'image'], modalitiesOut: ['audio', 'text'], endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll', catalogueOnlyReason: '' }),
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
        source: 'live_endpoint',
        discoverySource: 'live_endpoint',
        upstreamProvider: stringField(record, ['provider', 'upstreamProvider', 'upstream_provider'], 'genx'),
        endpointFamily: '/api/v1/generate + /api/v1/jobs/:id',
        providerClientExists: videoLike || musicLike,
        workerExecutorExists: videoLike || musicLike,
        endpointShapeKnown: videoLike || musicLike,
        requestShapeKnown: videoLike || musicLike,
        responseShapeKnown: videoLike || musicLike,
        artifactPersistenceExists: videoLike || musicLike,
        transportProfile: 'async_job_poll',
        rawMetadata: record,
      })
    })

    return liveResult('genx', endpointSource, 'live_model_list', models, ['GenX live discovery swept model-list categories only. Music/Lyria-like models use the existing GenX music client, worker executor, and artifact path when configured; this does not prove live completion.'])
  } catch (error) {
    return failedLiveResult('genx', endpointSource, error instanceof Error ? error.message : 'GenX discovery failed', [])
  }
}
