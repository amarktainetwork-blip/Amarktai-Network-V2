import { it } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  evaluateOrchestra,
  getExecutorRegistration,
  normalizeDbCandidates,
  type CapabilityKey,
  type DbModelRecord,
} from '../packages/core/src/index.js'
import { providerHttpError } from '../packages/providers/src/provider-errors.js'
import { deriveDiscoveredModelAccessibility } from '../apps/api/src/lib/model-registry.js'

const provider = (providerKey: 'together' | 'deepinfra', baseUrl?: string) => ({
  providerKey, enabled: true, healthStatus: 'live', apiKey: 'stored-encrypted-key', baseUrl,
})

function textModel(providerKey: 'together' | 'deepinfra', modelId: string, accountAccess: string, liveProven = false): DbModelRecord {
  const endpoint = providerKey === 'together' ? 'together_openai_v1/openai_chat' : 'deepinfra_openai_v1/openai_chat'
  return {
    provider: providerKey, modelId, displayName: modelId, status: 'available', enabled: true,
    currentAvailability: accountAccess === 'accessible' ? 'available' : 'account_access_unknown',
    accountAccess, capabilitiesJson: JSON.stringify(['chat', 'streaming_chat', 'translation', 'question_answering', 'structured_output']),
    rawMetadata: JSON.stringify({
      accessibility: { serverlessAvailable: accountAccess === 'accessible', accountAccessible: accountAccess === 'accessible' },
      compatibility: {
        taskType: 'text', category: 'text', capabilities: ['chat', 'streaming_chat', 'translation', 'question_answering', 'structured_output'],
        modalitiesIn: ['text'], modalitiesOut: ['text'], transportProfile: 'openai_chat_sse', endpointFamily: endpoint,
        endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true,
        workerExecutorExists: true, streamingSupported: true,
      },
    }),
    liveProvenRouteCount: liveProven ? 1 : 0,
  }
}

it('Together model_not_available is classified precisely and is not retryable', () => {
  const error = providerHttpError({ provider: 'together', status: 400, body: '{"code":"model_not_available","message":"unable to access non-serverless model; dedicated endpoint required"}' })
  assert.equal(error.code, 'model_not_available')
  assert.equal(error.retryable, false)
})

it('catalogue-only Together models are not promoted to account-accessible execution', () => {
  const evidence = deriveDiscoveredModelAccessibility({
    provider: 'together', modelId: 'catalogue/model', displayName: 'Catalogue model', family: '', category: 'language', primaryRole: '',
    capabilities: {}, source: 'live_endpoint', catalogCompleteness: 'full', isLiveDiscovered: true, modelOwner: '', providerRawType: 'language', providerRawCategory: 'language', rawMetadata: {},
    costTier: 'medium', qualityTier: 'balanced', latencyTier: 'medium', contextWindow: null, estimatedUnitCost: null,
    discoveredAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(), pricingSource: '', pricingConfidence: '', pricingUnit: '', pricingCurrency: '', pricingRawMetadata: {}, lastPricingSyncedAt: null, pricingBlocker: '', notes: '',
  } as never)
  assert.equal(evidence.accountAccess, 'unknown')
  assert.equal(evidence.executable, false)
  assert.equal(evidence.blocker, 'account_access_unknown')
})

it('explicit serverless Together metadata remains eligible while rerank catalogue entries require dedicated access', () => {
  const base = {
    provider: 'together', modelId: 'serverless/model', isLiveDiscovered: true, providerRawType: 'language', providerRawCategory: 'language', category: 'language', rawMetadata: { serverless: true },
  } as never
  assert.equal(deriveDiscoveredModelAccessibility(base).executable, true)
  const rerank = { ...base, modelId: 'rerank/model', providerRawType: 'rerank', providerRawCategory: 'rerank', category: 'rerank', rawMetadata: {} } as never
  assert.equal(deriveDiscoveredModelAccessibility(rerank).blocker, 'dedicated_endpoint_required')
})

it('Orchestra excludes unknown-access Together text but keeps accessible Together and DeepInfra text', () => {
  const models = [textModel('together', 'unknown/model', 'unknown'), textModel('together', 'accessible/model', 'accessible'), textModel('deepinfra', 'deep/model', 'accessible')]
  const candidates = normalizeDbCandidates(models, [provider('together'), provider('deepinfra')], 'chat', { databaseReady: true, queueReady: true })
  assert.equal(candidates.find((item) => item.model === 'unknown/model')?.executionReady, false)
  assert.equal(candidates.find((item) => item.model === 'accessible/model')?.executionReady, true)
  assert.equal(candidates.find((item) => item.model === 'deep/model')?.executionReady, true)
})

it('live-proven compatible route ranks above merely discovered routes', () => {
  const candidates = normalizeDbCandidates(
    [textModel('together', 'discovered/model', 'accessible'), textModel('deepinfra', 'proven/model', 'accessible', true)],
    [provider('together'), provider('deepinfra')], 'chat', { databaseReady: true, queueReady: true, liveProvenRoutes: new Set(['deepinfra/proven/model/chat']) },
  )
  const decision = evaluateOrchestra({ capability: 'chat', executionProfile: 'internal_admin', executionId: 'test' }, candidates)
  assert.equal(decision.selectedModel, 'proven/model')
})

it('general text and streaming contracts are registered for both callable providers', () => {
  for (const capability of ['chat', 'translation', 'question_answering', 'structured_output'] as CapabilityKey[]) {
    assert.ok(getExecutorRegistration(capability, 'together'))
    assert.ok(getExecutorRegistration(capability, 'deepinfra'))
  }
  assert.equal(getExecutorRegistration('streaming_chat', 'together')?.executionMode, 'stream')
  assert.equal(getExecutorRegistration('streaming_chat', 'deepinfra')?.executionMode, 'stream')
})

it('specialist DeepInfra, reranking, real Together speech, and GenX source-video handlers are registered', () => {
  for (const capability of ['zero_shot_classification', 'token_classification', 'fill_mask', 'table_qa', 'reranking'] as CapabilityKey[]) assert.ok(getExecutorRegistration(capability, 'deepinfra'))
  assert.equal(getExecutorRegistration('reranking', 'together')?.id, 'together.reranking')
  assert.equal(getExecutorRegistration('tts', 'together')?.id, 'together.tts')
  assert.equal(getExecutorRegistration('stt', 'together')?.sourceArtifactRequired, true)
  assert.equal(getExecutorRegistration('image_to_video', 'genx')?.id, 'genx.image-to-video')
  assert.equal(getExecutorRegistration('video_to_video', 'genx')?.id, 'genx.video-to-video')
})

it('worker fallback records model accessibility, avoids duplicate routes, and exposes callable media handlers', async () => {
  const source = await readFile(new URL('../apps/worker/src/providers/provider-executor.ts', import.meta.url), 'utf8')
  assert.match(source, /errorClassification === 'model_not_available'/)
  assert.match(source, /recordModelAccessibilityFailure/)
  assert.match(source, /all\.findIndex/)
  assert.match(source, /'genx\.image-to-video': executeGenxVideo/)
  assert.match(source, /'genx\.video-to-video': executeGenxVideo/)
  assert.match(source, /assertMediaSignature\(file\.buffer, file\.mimeType\)/)
  assert.match(source, /onSubmitted:/)
})

it('streaming fallback only switches before content and persists the actual route', async () => {
  const source = await readFile(new URL('../apps/api/src/routes/streaming-chat.ts', import.meta.url), 'utf8')
  assert.match(source, /!unavailable \|\| upstreamChunks > 0/)
  assert.match(source, /orchestraInitialSelectedProvider/)
  assert.match(source, /orchestraSelectedProvider: runtimeProvider/)
  assert.match(source, /recordModelAccessibilityFailure/)
})

it('discovery output explicitly separates host environment from canonical stored-key truth and retains provider policy', async () => {
  const host = await readFile(new URL('../scripts/discover-provider-models.mjs', import.meta.url), 'utf8')
  const authenticated = await readFile(new URL('../scripts/proof-authenticated-model-discovery.mjs', import.meta.url), 'utf8')
  const providerPolicy = await readFile(new URL('../packages/core/src/providers.ts', import.meta.url), 'utf8')
  assert.match(host, /HOST_ENV_LIVE_DISCOVERED_MODELS/)
  assert.match(authenticated, /PERSISTED_CANONICAL_REGISTRY_MODELS/)
  assert.match(authenticated, /ACCOUNT_ACCESSIBLE_MODELS/)
  assert.doesNotMatch(providerPolicy, /providerKey:\s*['"]groq['"]/i)
})
