import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = process.argv.includes('--live')
const STATIC_TIME = '1970-01-01T00:00:00.000Z'
const now = LIVE ? new Date().toISOString() : STATIC_TIME

const APPROVED_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']

function inferCapabilities(modelId, rawType = '') {
  const text = `${modelId} ${rawType}`.toLowerCase()
  if (/music|lyria|song/.test(text)) return ['music_generation']
  if (/flux|image|stable-diffusion|sdxl/.test(text)) return ['image_generation']
  if (/video|seedance|veo|wan/.test(text)) return ['video_generation']
  if (/embed/.test(text)) return ['embeddings']
  if (/rerank/.test(text)) return ['reranking']
  if (/whisper|transcrib/.test(text)) return ['stt']
  if (/tts|speech|orpheus|playai/.test(text)) return ['tts']
  if (/code/.test(text)) return ['code']
  if (/vision|multimodal/.test(text)) return ['multimodal']
  return ['chat']
}

function modalities(capabilities) {
  const values = new Set()
  for (const capability of capabilities) {
    if (['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output'].includes(capability)) values.add('text')
    if (['image_generation', 'image_edit'].includes(capability)) values.add('image')
    if (['video_generation', 'long_form_video', 'avatar_generation'].includes(capability)) values.add('video')
    if (['music_generation', 'tts', 'stt'].includes(capability)) values.add('audio')
    if (['embeddings', 'reranking'].includes(capability)) values.add('retrieval')
    if (capability === 'multimodal') values.add('multimodal')
  }
  return [...values]
}

function discovered(input) {
  const inferredCapabilities = input.inferredCapabilities ?? inferCapabilities(input.modelId, input.rawProviderType)
  const providerClientExists = input.providerClientExists === true
  const workerExecutorExists = input.workerExecutorExists === true
  const endpointShapeKnown = input.endpointShapeKnown !== false
  const requestShapeKnown = input.requestShapeKnown ?? providerClientExists
  const responseShapeKnown = input.responseShapeKnown ?? providerClientExists
  const executableNow = endpointShapeKnown && requestShapeKnown && responseShapeKnown && providerClientExists && workerExecutorExists && input.provider !== 'mimo'
  const missing = []
  if (!endpointShapeKnown) missing.push('endpoint_shape_unknown')
  if (!requestShapeKnown) missing.push('request_shape_unknown')
  if (!responseShapeKnown) missing.push('response_shape_unknown')
  if (!providerClientExists) missing.push('provider_client_missing')
  if (!workerExecutorExists) missing.push('worker_executor_missing')
  if (input.provider === 'mimo') missing.push('coding_tools_only')
  return {
    provider: input.provider,
    modelId: input.modelId,
    displayName: input.displayName ?? input.modelId,
    rawProviderType: input.rawProviderType ?? '',
    modalities: modalities(inferredCapabilities),
    inferredCapabilities,
    contextWindow: input.contextWindow ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    inputPrice: input.inputPrice ?? null,
    outputPrice: input.outputPrice ?? null,
    artifactOutput: input.artifactOutput ?? inferredCapabilities.some((capability) => ['image_generation', 'video_generation', 'music_generation', 'tts'].includes(capability)),
    streamingSupported: input.streamingSupported ?? false,
    batchSupported: input.batchSupported ?? false,
    endpointSource: input.endpointSource,
    endpointShapeKnown,
    requestShapeKnown,
    responseShapeKnown,
    providerClientExists,
    workerExecutorExists,
    executableNow,
    blockedReason: executableNow ? '' : missing.join(', '),
    lastDiscoveredAt: now,
    source: LIVE && input.live ? 'live_discovered' : 'static_repo',
    liveDiscoverySkipped: !(LIVE && input.live),
    rawMetadata: input.rawMetadata ?? {},
  }
}

const STATIC_MODELS = [
  discovered({ provider: 'genx', modelId: 'seedance-v1-fast', displayName: 'Seedance V1 Fast', rawProviderType: 'video', endpointSource: 'repo_static_genx_client', providerClientExists: true, workerExecutorExists: true }),
  discovered({ provider: 'genx', modelId: 'music-generation-provider-client-pending', displayName: 'Music Generation Provider Client Pending', rawProviderType: 'music', endpointSource: 'manual_planned_music', endpointShapeKnown: false, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false }),
  discovered({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile', rawProviderType: 'chat', endpointSource: 'repo_static_groq_client', providerClientExists: true, workerExecutorExists: true, streamingSupported: true }),
  discovered({ provider: 'groq', modelId: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', rawProviderType: 'chat', endpointSource: 'repo_static_groq_client', providerClientExists: true, workerExecutorExists: true, streamingSupported: true }),
  discovered({ provider: 'groq', modelId: 'whisper-large-v3', displayName: 'Whisper Large V3', rawProviderType: 'stt', endpointSource: 'repo_static_groq_client', providerClientExists: true, workerExecutorExists: false }),
  discovered({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell', rawProviderType: 'image', endpointSource: 'repo_static_together_client', providerClientExists: true, workerExecutorExists: true, batchSupported: true }),
  discovered({ provider: 'together', modelId: 'togethercomputer/m2-bert-80M-32k-retrieval', displayName: 'M2-BERT 80M 32K Retrieval', rawProviderType: 'embedding', endpointSource: 'repo_static_embeddings_client', providerClientExists: true, workerExecutorExists: false, batchSupported: true }),
  discovered({ provider: 'mimo', modelId: 'mimo-v1', displayName: 'MiMo V1', rawProviderType: 'coding_tools_only', endpointSource: 'repo_policy_coding_tools_only', endpointShapeKnown: false, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false }),
  discovered({ provider: 'deepinfra', modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Meta Llama 3.1 8B Instruct', rawProviderType: 'chat', endpointSource: 'repo_static_deepinfra_client', providerClientExists: true, workerExecutorExists: true, streamingSupported: true, batchSupported: true }),
]

const PROVIDER_ENDPOINTS = {
  groq: { env: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/models' },
  together: { env: 'TOGETHER_API_KEY', url: 'https://api.together.xyz/v1/models' },
  deepinfra: { env: 'DEEPINFRA_API_KEY', url: 'https://api.deepinfra.com/v1/openai/models' },
}

async function fetchModels(url, apiKey) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
  if (!response.ok) throw new Error(`model-list returned ${response.status}`)
  const payload = await response.json()
  if (Array.isArray(payload)) return payload
  for (const key of ['data', 'models', 'items', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

async function liveDiscoverProvider(provider) {
  if (provider === 'mimo') return { provider, models: [], skipped: true, error: null, endpointSource: 'coding_tools_only_policy' }
  if (provider === 'genx') return liveDiscoverGenx()
  const endpoint = PROVIDER_ENDPOINTS[provider]
  const apiKey = endpoint ? process.env[endpoint.env] : ''
  if (!endpoint || !apiKey) return { provider, models: [], skipped: true, error: null, endpointSource: endpoint?.url ?? 'unknown' }
  try {
    const records = await fetchModels(endpoint.url, apiKey)
    const models = records
      .filter((record) => record && typeof record === 'object')
      .map((record) => {
        const modelId = String(record.id ?? record.model ?? record.name ?? '')
        const rawProviderType = String(record.type ?? record.task ?? record.object ?? '')
        const textExecutable = provider === 'groq' || (provider === 'deepinfra' && !/image|video|music|audio|speech|embed|rerank/i.test(`${modelId} ${rawProviderType}`))
        const imageExecutable = provider === 'together' && /image|flux|stable-diffusion/i.test(`${modelId} ${rawProviderType}`)
        return discovered({
          provider,
          modelId,
          displayName: String(record.display_name ?? record.name ?? modelId),
          rawProviderType,
          endpointSource: endpoint.url,
          providerClientExists: textExecutable || imageExecutable,
          workerExecutorExists: textExecutable || imageExecutable,
          contextWindow: Number.isFinite(Number(record.context_window ?? record.context_length)) ? Number(record.context_window ?? record.context_length) : null,
          rawMetadata: record,
          live: true,
        })
      })
      .filter((model) => model.modelId)
    return { provider, models, skipped: false, error: null, endpointSource: endpoint.url }
  } catch (error) {
    return { provider, models: [], skipped: false, error: error instanceof Error ? error.message : String(error), endpointSource: endpoint.url }
  }
}

async function liveDiscoverGenx() {
  const provider = 'genx'
  const apiKey = process.env.GENX_API_KEY
  const base = process.env.GENX_BASE_URL || 'https://query.genx.sh'
  const endpointSource = `${new URL('/api/v1/models', base).toString()}?category=*`
  if (!apiKey) return { provider, models: [], skipped: true, error: null, endpointSource }
  try {
    const byId = new Map()
    for (const category of ['', 'video', 'image', 'avatar', 'audio', 'voice', 'music', 'multimodal']) {
      const url = new URL('/api/v1/models', base)
      if (category) url.searchParams.set('category', category)
      const records = await fetchModels(url.toString(), apiKey)
      for (const record of records.filter((item) => item && typeof item === 'object')) {
        const modelId = String(record.id ?? record.model ?? record.slug ?? '')
        if (!modelId) continue
        byId.set(modelId, { ...byId.get(modelId), ...record, category: record.category ?? category })
      }
    }
    const models = [...byId.values()].map((record) => {
      const modelId = String(record.id ?? record.model ?? record.slug)
      const rawProviderType = String(record.category ?? record.type ?? '')
      const musicLike = /music|lyria|song|audio-generation|text-to-music/i.test(`${modelId} ${rawProviderType}`)
      const videoLike = /video|seedance|veo|wan/i.test(`${modelId} ${rawProviderType}`)
      return discovered({
        provider,
        modelId,
        displayName: String(record.name ?? record.displayName ?? modelId),
        rawProviderType: musicLike ? `music ${rawProviderType}` : rawProviderType,
        endpointSource,
        endpointShapeKnown: videoLike || musicLike,
        requestShapeKnown: videoLike && !musicLike,
        responseShapeKnown: videoLike && !musicLike,
        providerClientExists: videoLike && !musicLike,
        workerExecutorExists: videoLike && !musicLike,
        rawMetadata: record,
        live: true,
      })
    })
    return { provider, models, skipped: false, error: null, endpointSource }
  } catch (error) {
    return { provider, models: [], skipped: false, error: error instanceof Error ? error.message : String(error), endpointSource }
  }
}

const liveResults = LIVE ? await Promise.all(APPROVED_PROVIDERS.map(liveDiscoverProvider)) : []
const liveModels = liveResults.flatMap((result) => result.models)
const models = LIVE
  ? APPROVED_PROVIDERS.flatMap((provider) => {
    const liveResult = liveResults.find((result) => result.provider === provider)
    return liveResult && !liveResult.skipped && !liveResult.error && liveResult.models.length > 0
      ? liveResult.models
      : STATIC_MODELS.filter((model) => model.provider === provider)
  })
  : STATIC_MODELS

const countsByProvider = Object.fromEntries(APPROVED_PROVIDERS.map((provider) => [
  provider,
  models.filter((model) => model.provider === provider).length,
]))
const capabilityCoverage = {}
for (const model of models) {
  for (const capability of model.inferredCapabilities) {
    capabilityCoverage[capability] ??= { total: 0, executable: 0, providers: [] }
    capabilityCoverage[capability].total += 1
    if (model.executableNow) capabilityCoverage[capability].executable += 1
    if (!capabilityCoverage[capability].providers.includes(model.provider)) capabilityCoverage[capability].providers.push(model.provider)
  }
}

const musicModels = models.filter((model) => model.inferredCapabilities.includes('music_generation'))
const report = {
  generatedAt: now,
  mode: LIVE ? 'live_model_list' : 'safe_static',
  approvedProviders: APPROVED_PROVIDERS,
  liveDiscoveryAttempted: LIVE,
  liveDiscoverySkipped: !LIVE || liveResults.some((result) => result.skipped),
  liveResults: liveResults.map((result) => ({
    provider: result.provider,
    endpointSource: result.endpointSource,
    skipped: result.skipped,
    error: result.error,
    totalDiscovered: result.models.length,
  })),
  countsByProvider,
  totals: {
    discovered: models.length,
    executableNow: models.filter((model) => model.executableNow).length,
    catalogueOnly: models.filter((model) => !model.executableNow).length,
    missingClient: models.filter((model) => !model.providerClientExists).length,
    missingExecutor: models.filter((model) => !model.workerExecutorExists).length,
  },
  capabilityCoverage,
  musicReadiness: {
    discoveredMusicModels: musicModels.length,
    genxMusicModels: musicModels.filter((model) => model.provider === 'genx').map((model) => model.modelId),
    togetherMusicModels: musicModels.filter((model) => model.provider === 'together').map((model) => model.modelId),
    deepinfraMusicModels: musicModels.filter((model) => model.provider === 'deepinfra').map((model) => model.modelId),
    groqMusicModels: musicModels.filter((model) => model.provider === 'groq').map((model) => model.modelId),
    lyriaLikeModels: musicModels.filter((model) => /lyria/i.test(model.modelId)).map((model) => `${model.provider}/${model.modelId}`),
    endpointShapeKnown: musicModels.some((model) => model.endpointShapeKnown),
    providerClientExists: musicModels.some((model) => model.providerClientExists),
    workerExecutorExists: musicModels.some((model) => model.workerExecutorExists),
    executableNow: musicModels.some((model) => model.executableNow),
  },
}

fs.writeFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), `${JSON.stringify(models, null, 2)}\n`)
fs.writeFileSync(path.join(ROOT, 'packages/core/src/generated/provider-model-catalogue.generated.json'), `${JSON.stringify(models, null, 2)}\n`)

console.log('Provider model discovery complete')
console.log(`Mode: ${report.mode}`)
console.log(`Total discovered/catalogued: ${report.totals.discovered}`)
console.log(`Executable now: ${report.totals.executableNow}`)
console.log(`Catalogue-only: ${report.totals.catalogueOnly}`)
console.log(`Music models discovered: ${report.musicReadiness.discoveredMusicModels}`)
if (LIVE && report.liveDiscoverySkipped) {
  console.log('Live discovery partially skipped because one or more provider keys are missing.')
}
