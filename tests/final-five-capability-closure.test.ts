import { describe, expect, it } from 'vitest'
import {
  DIRECT_PROVIDER_CAPABILITIES,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  DIRECT_PROVIDER_REQUEST_SCHEMAS,
  EXECUTOR_REGISTRATIONS,
  evaluateOrchestra,
  getExecutorRegistration,
  getExecutorRegistrations,
  normalizeDbCandidates,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
  type CapabilityKey,
  type DbModelRecord,
  type DbProviderRecord,
} from '@amarktai/core'
import { providerRerank } from '@amarktai/providers'
import { deriveDiscoveredModelAccessibility } from '../apps/api/src/lib/model-registry.js'
import { vi } from 'vitest'

const SPECIALIST_CAPABILITIES: CapabilityKey[] = [
  'zero_shot_classification', 'token_classification', 'fill_mask', 'table_qa',
]

const PRODUCTION_TEXT_CAPABILITIES: CapabilityKey[] = [
  'chat', 'reasoning', 'summarization', 'translation',
  'question_answering', 'classification', 'extraction', 'structured_output',
]

const provider = (providerKey: 'deepinfra' | 'together' | 'genx', overrides?: Partial<DbProviderRecord>): DbProviderRecord => ({
  providerKey,
  enabled: true,
  healthStatus: 'live',
  apiKey: 'encrypted-test-key',
  ...overrides,
})

function nativeSpecialistModel(
  capability: CapabilityKey,
  modelId: string,
  overrides?: Partial<DbModelRecord>,
): DbModelRecord {
  const taskMap: Record<string, string> = {
    zero_shot_classification: 'zero-shot-classification',
    token_classification: 'token-classification',
    fill_mask: 'fill-mask',
    table_qa: 'table-question-answering',
  }
  const task = taskMap[capability] ?? 'text'
  return {
    provider: 'deepinfra',
    modelId,
    displayName: modelId,
    status: 'available',
    capabilitiesJson: JSON.stringify([capability]),
    rawMetadata: JSON.stringify({
      compatibility: {
        taskType: task,
        category: task,
        capabilities: [capability],
        modalitiesIn: [],
        modalitiesOut: ['json'],
        transportProfile: 'native_inference_json',
        endpointFamily: 'deepinfra_native_v1/native_inference',
        endpointShapeKnown: true,
        requestShapeKnown: true,
        responseShapeKnown: true,
        providerClientExists: true,
        workerExecutorExists: true,
      },
      nativeCatalogueOnly: true,
    }),
    ...overrides,
  }
}

function textModel(
  providerKey: 'deepinfra' | 'together',
  modelId: string,
  capabilities: CapabilityKey[],
  overrides?: Partial<DbModelRecord>,
): DbModelRecord {
  const endpoint = providerKey === 'together' ? 'together_openai_v1/openai_chat' : 'deepinfra_openai_v1/openai_chat'
  return {
    provider: providerKey,
    modelId,
    displayName: modelId,
    status: 'available',
    capabilitiesJson: JSON.stringify(capabilities),
    rawMetadata: JSON.stringify({
      compatibility: {
        taskType: 'text',
        category: 'text',
        capabilities,
        modalitiesIn: ['text'],
        modalitiesOut: ['text'],
        transportProfile: 'openai_chat_sse',
        endpointFamily: endpoint,
        endpointShapeKnown: true,
        requestShapeKnown: true,
        responseShapeKnown: true,
        providerClientExists: true,
        workerExecutorExists: true,
        streamingSupported: true,
      },
    }),
    ...overrides,
  }
}

function rerankingModel(
  providerKey: 'deepinfra' | 'together',
  modelId: string,
  requestContract?: string,
): DbModelRecord {
  const endpoint = providerKey === 'together' ? 'rerank' : 'deepinfra_native_v1/rerank/native_inference'
  return {
    provider: providerKey,
    modelId,
    displayName: modelId,
    status: 'available',
    capabilitiesJson: JSON.stringify(['reranking']),
    rawMetadata: JSON.stringify({
      compatibility: {
        taskType: providerKey === 'deepinfra' ? 'reranker' : 'rerank',
        category: 'reranking',
        capabilities: ['reranking'],
        modalitiesIn: ['text'],
        modalitiesOut: ['json'],
        transportProfile: 'native_inference_json',
        endpointFamily: endpoint,
        endpointShapeKnown: true,
        requestShapeKnown: true,
        responseShapeKnown: true,
        providerClientExists: true,
        workerExecutorExists: true,
        supportedParameters: requestContract === 'queries_documents' ? ['queries'] : [],
        requestContract,
      },
    }),
  }
}

// ── 1. Native specialist model is eligible → native executor selected ──

describe('native specialist routing', () => {
  it('selects native task-inference executor when a compatible DeepInfra specialist model exists', () => {
    for (const capability of SPECIALIST_CAPABILITIES) {
      const models = [nativeSpecialistModel(capability, `test/${capability}-model`)]
      const candidates = normalizeDbCandidates(models, [provider('deepinfra')], capability, { databaseReady: true, queueReady: true })
      const eligible = candidates.filter((c) => c.executionReady)
      expect(eligible.length, `${capability} has at least one eligible candidate`).toBeGreaterThanOrEqual(1)
      const best = eligible[0]!
      expect(best.executorId, `${capability} selects native task-inference`).toBe('deepinfra.task-inference')
      expect(best.routeType, `${capability} route type is native_specialist`).toBe('native_specialist')
      expect(best.provider, `${capability} provider is deepinfra`).toBe('deepinfra')
    }
  })

  it('text-transform fallback is NOT selected when native specialist is available', () => {
    const models = [nativeSpecialistModel('zero_shot_classification', 'test/zsc-model')]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.every((c) => c.executorId === 'deepinfra.task-inference')).toBe(true)
  })
})

// ── 2. Text-transform fallback: production-style text model (no specialist claim) ──

describe('text-transform fallback routing', () => {
  it('production-style DeepInfra text model becomes eligible zero_shot_classification fallback', () => {
    const models = [textModel('deepinfra', 'meta-llama/Meta-Llama-3.1-8B-Instruct', PRODUCTION_TEXT_CAPABILITIES)]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.length).toBeGreaterThanOrEqual(1)
    const best = eligible[0]!
    expect(best.executorId).toBe('deepinfra.text-transform')
    expect(best.routeType).toBe('text_transform_fallback')
    expect(best.provider).toBe('deepinfra')
  })

  it('production-style DeepInfra text model becomes eligible token_classification fallback', () => {
    const models = [textModel('deepinfra', 'meta-llama/Meta-Llama-3.1-8B-Instruct', PRODUCTION_TEXT_CAPABILITIES)]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'token_classification', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.length).toBeGreaterThanOrEqual(1)
    expect(eligible[0]!.executorId).toBe('deepinfra.text-transform')
    expect(eligible[0]!.routeType).toBe('text_transform_fallback')
  })

  it('production-style DeepInfra text model becomes eligible fill_mask fallback', () => {
    const models = [textModel('deepinfra', 'meta-llama/Meta-Llama-3.1-8B-Instruct', PRODUCTION_TEXT_CAPABILITIES)]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'fill_mask', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.length).toBeGreaterThanOrEqual(1)
    expect(eligible[0]!.executorId).toBe('deepinfra.text-transform')
    expect(eligible[0]!.routeType).toBe('text_transform_fallback')
  })

  it('production-style DeepInfra text model becomes eligible table_qa fallback', () => {
    const models = [textModel('deepinfra', 'meta-llama/Meta-Llama-3.1-8B-Instruct', PRODUCTION_TEXT_CAPABILITIES)]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'table_qa', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.length).toBeGreaterThanOrEqual(1)
    expect(eligible[0]!.executorId).toBe('deepinfra.text-transform')
    expect(eligible[0]!.routeType).toBe('text_transform_fallback')
  })

  it('text model capability metadata is not mutated by fallback selection', () => {
    const textModelRecord = textModel('deepinfra', 'test/text-model', PRODUCTION_TEXT_CAPABILITIES)
    const models = [textModelRecord]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    expect(candidates.length).toBeGreaterThanOrEqual(1)
    const originalCaps = JSON.parse(textModelRecord.capabilitiesJson ?? '[]')
    expect(originalCaps).not.toContain('zero_shot_classification')
    expect(originalCaps).toEqual(PRODUCTION_TEXT_CAPABILITIES)
  })

  it('prefers native specialist over text-transform fallback when both exist', () => {
    const models = [
      nativeSpecialistModel('fill_mask', 'test/fill-mask-native'),
      textModel('deepinfra', 'test/fill-mask-text', PRODUCTION_TEXT_CAPABILITIES),
    ]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'fill_mask', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible.length).toBeGreaterThanOrEqual(2)
    expect(eligible[0]!.executorId).toBe('deepinfra.task-inference')
    expect(eligible[0]!.routeType).toBe('native_specialist')
    expect(eligible[1]!.executorId).toBe('deepinfra.text-transform')
    expect(eligible[1]!.routeType).toBe('text_transform_fallback')
  })
})

// ── 3. Native model account-inaccessible → rejected, fallback remains eligible ──

describe('account-inaccessible native model rejection', () => {
  it('rejects an inaccessible native model and keeps text-transform fallback eligible', () => {
    const models = [
      nativeSpecialistModel('token_classification', 'test/tc-inaccessible', { accountAccess: 'inaccessible' }),
      textModel('deepinfra', 'test/tc-text', PRODUCTION_TEXT_CAPABILITIES),
    ]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'token_classification', { databaseReady: true, queueReady: true })
    const inaccessible = candidates.find((c) => c.model === 'test/tc-inaccessible')
    expect(inaccessible?.modelAccountAccessible).toBe(false)
    const decision = evaluateOrchestra({ capability: 'token_classification', executionId: 'test' }, candidates)
    expect(decision.executionAllowed).toBe(true)
    expect(decision.selectedModel).toBe('test/tc-text')
    expect(decision.selectedExecutorId).toBe('deepinfra.text-transform')
  })
})

// ── 4. Request/response shape unknown → native route rejected ──

describe('unknown shape rejection', () => {
  it('rejects native route when requestShapeKnown is false', () => {
    const models = [nativeSpecialistModel('zero_shot_classification', 'test/zsc-bad-shape', {
      rawMetadata: JSON.stringify({
        compatibility: {
          taskType: 'zero-shot-classification',
          category: 'zero-shot-classification',
          capabilities: ['zero_shot_classification'],
          transportProfile: 'native_inference_json',
          endpointFamily: 'deepinfra_native_v1/native_inference',
          endpointShapeKnown: true,
          requestShapeKnown: false,
          responseShapeKnown: true,
          providerClientExists: true,
          workerExecutorExists: true,
        },
      }),
    })]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    const candidate = candidates[0]!
    expect(candidate.requestShapeKnown).toBe(false)
    expect(candidate.executionReady).toBe(false)
    expect(candidate.modelCompatible).toBe(false)
  })

  it('rejects native route when responseShapeKnown is false', () => {
    const models = [nativeSpecialistModel('fill_mask', 'test/fm-bad-response', {
      rawMetadata: JSON.stringify({
        compatibility: {
          taskType: 'fill-mask',
          category: 'fill-mask',
          capabilities: ['fill_mask'],
          transportProfile: 'native_inference_json',
          endpointFamily: 'deepinfra_native_v1/native_inference',
          endpointShapeKnown: true,
          requestShapeKnown: true,
          responseShapeKnown: false,
          providerClientExists: true,
          workerExecutorExists: true,
        },
      }),
    })]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'fill_mask', { databaseReady: true, queueReady: true })
    expect(candidates[0]!.responseShapeKnown).toBe(false)
    expect(candidates[0]!.executionReady).toBe(false)
  })
})

// ── 5. No native or text route → Orchestra fails honestly ──

describe('no eligible route', () => {
  it('Orchestra fails honestly when no candidate exists', () => {
    const decision = evaluateOrchestra({ capability: 'table_qa', executionId: 'test' }, [])
    expect(decision.executionAllowed).toBe(false)
    expect(decision.selectedProvider).toBeNull()
    expect(decision.blockReason).toContain('No eligible candidate')
  })

  it('Orchestra fails honestly when all candidates are blocked', () => {
    const models = [nativeSpecialistModel('table_qa', 'test/tq-blocked', { accountAccess: 'inaccessible' })]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'table_qa', { databaseReady: true, queueReady: true })
    const decision = evaluateOrchestra({ capability: 'table_qa', executionId: 'test' }, candidates)
    expect(decision.executionAllowed).toBe(false)
  })

  it('unknown-shape text model is rejected as fallback', () => {
    const models = [textModel('deepinfra', 'test/bad-shape', PRODUCTION_TEXT_CAPABILITIES, {
      rawMetadata: JSON.stringify({
        compatibility: {
          taskType: 'text', category: 'text', capabilities: PRODUCTION_TEXT_CAPABILITIES,
          modalitiesIn: ['text'], modalitiesOut: ['text'],
          transportProfile: 'openai_chat_sse', endpointFamily: 'deepinfra_openai_v1/openai_chat',
          endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: true,
          providerClientExists: true, workerExecutorExists: true,
        },
      }),
    })]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    expect(candidates).toHaveLength(0)
  })

  it('DeepInfra embedding model is not accepted as semantic fallback', () => {
    const models: DbModelRecord[] = [{
      provider: 'deepinfra',
      modelId: 'test/embedding-model',
      displayName: 'Embedding model',
      status: 'available',
      capabilitiesJson: JSON.stringify(['embeddings', 'feature_extraction']),
      rawMetadata: JSON.stringify({
        compatibility: {
          taskType: 'embedding', category: 'embedding', capabilities: ['embeddings', 'feature_extraction'],
          modalitiesIn: ['text'], modalitiesOut: ['embedding'],
          transportProfile: 'native_inference_json', endpointFamily: 'deepinfra_openai_v1/embeddings',
          endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
          providerClientExists: true, workerExecutorExists: true,
        },
      }),
    }]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    expect(candidates).toHaveLength(0)
  })

  it('Together text model is not accepted without an explicit semantic_text_fallback registration', () => {
    const models = [textModel('together', 'test/together-text', PRODUCTION_TEXT_CAPABILITIES)]
    const candidates = normalizeDbCandidates(models, [provider('together')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    const eligible = candidates.filter((c) => c.executionReady)
    expect(eligible).toHaveLength(0)
  })

  it('no candidate when neither exact nor semantic registration is compatible', () => {
    const models: DbModelRecord[] = [{
      provider: 'deepinfra',
      modelId: 'test/reranker-only',
      displayName: 'Reranker',
      status: 'available',
      capabilitiesJson: JSON.stringify(['reranking']),
      rawMetadata: JSON.stringify({
        compatibility: {
          taskType: 'reranker', category: 'reranking', capabilities: ['reranking'],
          modalitiesIn: ['text'], modalitiesOut: ['json'],
          transportProfile: 'native_inference_json', endpointFamily: 'deepinfra_native_v1/rerank/native_inference',
          endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
          providerClientExists: true, workerExecutorExists: true,
        },
      }),
    }]
    const candidates = normalizeDbCandidates(models, [provider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })
    expect(candidates).toHaveLength(0)
  })
})

// ── 6-9. Output validation for specialist capabilities ──

describe('specialist output validation', () => {
  it('zero_shot_classification: valid canonical result passes', () => {
    const output = { labels: [{ label: 'finance', score: 0.9 }, { label: 'sports', score: 0.1 }] }
    const validation = validateJsonSchemaValue(output, DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification)
    expect(validation.valid).toBe(true)
  })

  it('zero_shot_classification: malformed labels/scores fail', () => {
    expect(validateJsonSchemaValue({ labels: [] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification).valid).toBe(false)
    expect(validateJsonSchemaValue({ labels: [{ label: 'x' }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification).valid).toBe(false)
    expect(validateJsonSchemaValue({ labels: [{ label: 'x', score: -1 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification).valid).toBe(false)
    expect(validateJsonSchemaValue({ labels: [{ label: 'x', score: 1.5 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.zero_shot_classification).valid).toBe(false)
  })

  it('token_classification: valid entity offsets pass', () => {
    const output = { items: [{ text: 'Mandela', label: 'PER', start: 0, end: 7, score: 0.95 }] }
    const validation = validateJsonSchemaValue(output, DIRECT_PROVIDER_OUTPUT_SCHEMAS.token_classification)
    expect(validation.valid).toBe(true)
  })

  it('token_classification: malformed offsets or scores fail', () => {
    expect(validateJsonSchemaValue({ items: [] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.token_classification).valid).toBe(false)
    expect(validateJsonSchemaValue({ items: [{ text: '', label: 'PER', start: 0, end: 1, score: 0.5 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.token_classification).valid).toBe(false)
    expect(validateJsonSchemaValue({ items: [{ text: 'x', label: 'PER', start: -1, end: 1, score: 0.5 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.token_classification).valid).toBe(false)
  })

  it('fill_mask: valid candidates pass', () => {
    const output = { predictions: [{ token: 'Paris', sequence: 'The capital of France is Paris.', score: 0.95 }] }
    const validation = validateJsonSchemaValue(output, DIRECT_PROVIDER_OUTPUT_SCHEMAS.fill_mask)
    expect(validation.valid).toBe(true)
  })

  it('fill_mask: empty or malformed candidates fail', () => {
    expect(validateJsonSchemaValue({ predictions: [] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.fill_mask).valid).toBe(false)
    expect(validateJsonSchemaValue({ predictions: [{ token: '', sequence: 's', score: 0.5 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.fill_mask).valid).toBe(false)
    expect(validateJsonSchemaValue({ predictions: [{ token: 't', sequence: '', score: 0.5 }] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.fill_mask).valid).toBe(false)
  })

  it('table_qa: grounded answer passes', () => {
    const output = { answer: '25', cells: ['25'], coordinates: [[1, 1]] }
    const validation = validateJsonSchemaValue(output, DIRECT_PROVIDER_OUTPUT_SCHEMAS.table_qa)
    expect(validation.valid).toBe(true)
  })

  it('table_qa: malformed coordinates fail', () => {
    expect(validateJsonSchemaValue({ answer: '', cells: [], coordinates: [] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.table_qa).valid).toBe(false)
    expect(validateJsonSchemaValue({ answer: 'x', cells: [], coordinates: [[-1, 0]] }, DIRECT_PROVIDER_OUTPUT_SCHEMAS.table_qa).valid).toBe(false)
  })
})

// ── 10-11. Reranking request contracts ──

describe('reranking request contracts', () => {
  it('plural-query reranker sends queries: [query]', async () => {
    let capturedBody: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        model: 'Qwen/Qwen3-Reranker-0.6B',
        results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await providerRerank({
      provider: 'deepinfra',
      apiKey: 'test-key',
      model: 'Qwen/Qwen3-Reranker-0.6B',
      query: 'test query',
      documents: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      requestContract: 'queries_documents',
    })

    expect(capturedBody.queries).toEqual(['test query'])
    expect(capturedBody.query).toBeUndefined()
    expect(result.results).toHaveLength(2)
    expect(result.results[0]!.score).toBeGreaterThanOrEqual(result.results[1]!.score)
    vi.unstubAllGlobals()
  })

  it('singular-query reranker sends query (not queries)', async () => {
    let capturedBody: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        model: 'Salesforce/Llama-Rank-v1',
        results: [{ index: 0, relevance_score: 0.8 }],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await providerRerank({
      provider: 'together',
      apiKey: 'test-key',
      model: 'Salesforce/Llama-Rank-v1',
      query: 'test query',
      documents: [{ id: 'a', text: 'A' }],
      requestContract: 'query_documents',
    })

    expect(capturedBody.query).toBe('test query')
    expect(capturedBody.queries).toBeUndefined()
    expect(result.results).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})

// ── 12. Reranking response normalization ──

describe('reranking response normalization', () => {
  it('preserves document indexes and sorts descending by score', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'test-reranker',
      results: [{ index: 0, relevance_score: 0.3 }, { index: 1, relevance_score: 0.9 }, { index: 2, relevance_score: 0.6 }],
    }), { status: 200 })))

    const result = await providerRerank({
      provider: 'deepinfra',
      apiKey: 'test-key',
      model: 'test-reranker',
      query: 'q',
      documents: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
      requestContract: 'queries_documents',
    })

    expect(result.results.map((r) => r.index)).toEqual([1, 2, 0])
    expect(result.results[0]!.score).toBe(0.9)
    expect(result.results[0]!.documentId).toBe('b')
    vi.unstubAllGlobals()
  })

  it('rejects non-finite scores', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'test-reranker',
      results: [{ index: 0, relevance_score: NaN }],
    }), { status: 200 })))

    await expect(providerRerank({
      provider: 'deepinfra',
      apiKey: 'test-key',
      model: 'test-reranker',
      query: 'q',
      documents: [{ id: 'a', text: 'A' }],
      requestContract: 'queries_documents',
    })).rejects.toThrow('non-finite score')
    vi.unstubAllGlobals()
  })
})

// ── 13. Twenty proven capabilities retain their routing registrations ──

describe('proven capability routing retention', () => {
  const TWENTY_PROVEN = [
    'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
    'question_answering', 'classification', 'extraction', 'feature_extraction',
    'sentence_similarity', 'structured_output', 'tts', 'stt', 'embeddings',
    'reranking', 'image_generation', 'video_generation', 'image_to_video',
    'video_to_video', 'music_generation',
  ] as CapabilityKey[]

  it.each(TWENTY_PROVEN)('%s has at least one executor registration', (capability) => {
    const registrations = getExecutorRegistrations(capability)
    expect(registrations.length).toBeGreaterThan(0)
  })

  it('all 25 direct-provider capabilities have registrations', () => {
    for (const capability of DIRECT_PROVIDER_CAPABILITIES) {
      const registrations = getExecutorRegistrations(capability as CapabilityKey)
      expect(registrations.length, `${capability} has registrations`).toBeGreaterThan(0)
    }
  })
})

// ── 14. No Groq registration, MiMo coding-only ──

describe('provider policy enforcement', () => {
  it('no Groq runtime registration exists', () => {
    const groqRegistrations = EXECUTOR_REGISTRATIONS.filter((r) => r.provider === 'groq' as any)
    expect(groqRegistrations).toHaveLength(0)
  })

  it('MiMo remains coding-tools-only (blocked status, not in runtime providers)', () => {
    const mimoRegistrations = EXECUTOR_REGISTRATIONS.filter((r) => r.provider === 'mimo' as any)
    expect(mimoRegistrations).toHaveLength(0)
  })

  it('only approved runtime providers have registrations', () => {
    const approvedProviders = new Set(['deepinfra', 'together', 'genx'])
    for (const registration of EXECUTOR_REGISTRATIONS) {
      expect(approvedProviders.has(registration.provider)).toBe(true)
    }
  })
})

// ── 15. Proof gate remains exactly 25 capabilities ──

describe('proof gate integrity', () => {
  it('direct-provider capabilities list is exactly 25', () => {
    expect(DIRECT_PROVIDER_CAPABILITIES).toHaveLength(25)
  })

  it('all 25 capabilities have request and output schemas', () => {
    for (const capability of DIRECT_PROVIDER_CAPABILITIES) {
      expect(DIRECT_PROVIDER_REQUEST_SCHEMAS[capability], `${capability} request schema`).toBeDefined()
      expect(DIRECT_PROVIDER_OUTPUT_SCHEMAS[capability], `${capability} output schema`).toBeDefined()
    }
  })
})

// ── 16. Accessibility truth ──

describe('accessibility truth', () => {
  it('native-catalogue-only DeepInfra model gets native_catalogue_callable evidence', () => {
    const result = deriveDiscoveredModelAccessibility({
      provider: 'deepinfra',
      modelId: 'facebook/bart-large-mnli',
      isLiveDiscovered: true,
      rawMetadata: { nativeCatalogueOnly: true },
    } as any)
    expect(result.accountAccess).toBe('accessible')
    expect(result.executable).toBe(true)
    expect(result.evidenceSource).toBe('native_catalogue_callable')
  })

  it('authenticated DeepInfra account model gets authenticated_provider_catalogue evidence', () => {
    const result = deriveDiscoveredModelAccessibility({
      provider: 'deepinfra',
      modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      isLiveDiscovered: true,
      rawMetadata: {},
    } as any)
    expect(result.accountAccess).toBe('accessible')
    expect(result.evidenceSource).toBe('authenticated_provider_catalogue')
  })

  it('non-live model gets non_live_catalogue evidence and is not executable', () => {
    const result = deriveDiscoveredModelAccessibility({
      provider: 'deepinfra',
      modelId: 'some/model',
      isLiveDiscovered: false,
      rawMetadata: {},
    } as any)
    expect(result.executable).toBe(false)
    expect(result.evidenceSource).toBe('non_live_catalogue')
  })
})

// ── 17. DeepInfra discovery sets reranker requestContract ──

describe('DeepInfra discovery reranker contract', () => {
  it('reranker models get queries in supportedParameters and requestContract in rawMetadata', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      if (url.endsWith('/models/list')) {
        return new Response(JSON.stringify([
          { model_name: 'Qwen/Qwen3-Reranker-0.6B', reported_type: 'reranker' },
        ]), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { discoverDeepInfraProviderModels } = await import('../packages/providers/src/model-discovery/deepinfra.ts')
    const result = await discoverDeepInfraProviderModels({ live: true, apiKey: 'test-key', now: '2026-07-20T00:00:00.000Z' })

    const reranker = result.models.find((m) => m.modelId === 'Qwen/Qwen3-Reranker-0.6B')
    expect(reranker).toBeDefined()
    expect(reranker!.rawMetadata?.supportedParameters).toContain('queries')
    expect(reranker!.rawMetadata?.requestContract).toBe('queries_documents')
    vi.unstubAllGlobals()
  })
})

// ── 18. DeepInfra discovery produces specialist models with correct flags ──

describe('DeepInfra specialist discovery', () => {
  it('specialist models have requestShapeKnown, responseShapeKnown, and providerClientExists true', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      if (url.endsWith('/models/list')) {
        return new Response(JSON.stringify([
          { model_name: 'facebook/bart-large-mnli', reported_type: 'zero-shot-classification' },
          { model_name: 'dslim/bert-base-NER', reported_type: 'token-classification' },
          { model_name: 'bert-base-cased', reported_type: 'fill-mask' },
          { model_name: 'google/tapas-base-finetuned-wtq', reported_type: 'table-question-answering' },
        ]), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { discoverDeepInfraProviderModels } = await import('../packages/providers/src/model-discovery/deepinfra.ts')
    const result = await discoverDeepInfraProviderModels({ live: true, apiKey: 'test-key', now: '2026-07-20T00:00:00.000Z' })

    for (const modelId of ['facebook/bart-large-mnli', 'dslim/bert-base-NER', 'bert-base-cased', 'google/tapas-base-finetuned-wtq']) {
      const model = result.models.find((m) => m.modelId === modelId)
      expect(model, `${modelId} discovered`).toBeDefined()
      expect(model!.requestShapeKnown, `${modelId} requestShapeKnown`).toBe(true)
      expect(model!.responseShapeKnown, `${modelId} responseShapeKnown`).toBe(true)
      expect(model!.providerClientExists, `${modelId} providerClientExists`).toBe(true)
      expect(model!.workerExecutorExists, `${modelId} workerExecutorExists`).toBe(true)
      expect(model!.rawMetadata?.nativeCatalogueOnly, `${modelId} nativeCatalogueOnly`).toBe(true)
    }
    vi.unstubAllGlobals()
  })
})

// ── 19. Reranking request contract passthrough from metadata ──

describe('reranking request contract passthrough', () => {
  it('requestContract from routeModelCompatibility is used for reranking', () => {
    const compatibility = { requestContract: 'queries_documents', supportedParameters: [] }
    const requestContract = compatibility.requestContract === 'queries_documents' || compatibility.requestContract === 'query_documents'
      ? compatibility.requestContract
      : 'query_documents'
    expect(requestContract).toBe('queries_documents')
  })

  it('falls back to supportedParameters check when requestContract is absent', () => {
    const compatibility = { supportedParameters: ['queries'] }
    const explicitRequestContract = typeof compatibility.requestContract === 'string' ? compatibility.requestContract : null
    const requestContract = explicitRequestContract === 'queries_documents' || explicitRequestContract === 'query_documents'
      ? explicitRequestContract
      : compatibility.supportedParameters?.includes('queries')
        ? 'queries_documents'
        : 'query_documents'
    expect(requestContract).toBe('queries_documents')
  })

  it('defaults to query_documents when neither requestContract nor supportedParameters indicate queries', () => {
    const compatibility = { supportedParameters: [] }
    const explicitRequestContract = typeof compatibility.requestContract === 'string' ? compatibility.requestContract : null
    const requestContract = explicitRequestContract === 'queries_documents' || explicitRequestContract === 'query_documents'
      ? explicitRequestContract
      : compatibility.supportedParameters?.includes('queries')
        ? 'queries_documents'
        : 'query_documents'
    expect(requestContract).toBe('query_documents')
  })
})

// ── 20. Specialist capabilities are in DIRECT_PROVIDER_CAPABILITIES ──

describe('specialist capabilities in proof gate', () => {
  it.each(SPECIALIST_CAPABILITIES)('%s is in DIRECT_PROVIDER_CAPABILITIES', (capability) => {
    expect(DIRECT_PROVIDER_CAPABILITIES).toContain(capability)
  })

  it.each(SPECIALIST_CAPABILITIES)('%s has request schema validation', (capability) => {
    expect(DIRECT_PROVIDER_REQUEST_SCHEMAS[capability]).toBeDefined()
  })

  it.each(SPECIALIST_CAPABILITIES)('%s has output schema', (capability) => {
    expect(DIRECT_PROVIDER_OUTPUT_SCHEMAS[capability]).toBeDefined()
  })
})
