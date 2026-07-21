import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getModelRecord, isModelRouteCompatible, type ModelRecord } from '@amarktai/core'

describe('production smoke truth alignment', () => {
  it('keeps provider credential configuration distinct from runtime eligibility', () => {
    const source = readFileSync('apps/api/src/routes/admin-providers.ts', 'utf8')
    expect(source).toContain('configured: provider.credentialConfigured')
    expect(source).toContain('runtimeConfigured: provider.configured')
  })

  it('accepts the fully contracted GenX Lyria docs fallback without claiming live discovery', () => {
    const lyria = getModelRecord('genx', 'lyria-3-clip-preview')
    expect(lyria).toBeDefined()
    expect(lyria?.source).toBe('docs_fallback')
    expect(lyria?.liveDiscovered).not.toBe(true)
    expect(isModelRouteCompatible(lyria!, 'music_generation')).toBe(true)
  })

  it('accepts a persisted manual projection only with complete execution evidence', () => {
    const model: ModelRecord = {
      provider: 'genx', modelId: 'contracted-music', displayName: 'Contracted Music',
      capabilities: ['music_generation'], status: 'available', qualityTier: 'balanced', latencyTier: 'high', costTier: 'premium',
      supportsArtifacts: true, supportsStreaming: false, supportsBatch: false, executable: false, notes: '', source: 'manual_seed',
      category: 'music', providerCategory: 'music', modalitiesIn: ['text'], modalitiesOut: ['audio'], transportProfile: 'async_job_poll',
      endpointFamily: 'genx_generation_v1', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
      providerClientExists: true, workerExecutorExists: true,
    }
    expect(isModelRouteCompatible(model, 'music_generation')).toBe(true)
  })

  it('rejects docs/manual models with incomplete execution evidence', () => {
    const model: ModelRecord = {
      provider: 'genx', modelId: 'unknown-music', displayName: 'Unknown Music',
      capabilities: ['music_generation'], status: 'available', qualityTier: 'balanced', latencyTier: 'high', costTier: 'premium',
      supportsArtifacts: true, supportsStreaming: false, supportsBatch: false, executable: false, notes: '', source: 'manual_seed',
      category: 'music', providerCategory: 'music', modalitiesIn: ['text'], modalitiesOut: ['audio'], transportProfile: 'async_job_poll',
      endpointFamily: 'genx_generation_v1', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: true,
      providerClientExists: true, workerExecutorExists: true,
    }
    expect(isModelRouteCompatible(model, 'music_generation')).toBe(false)
  })
})
