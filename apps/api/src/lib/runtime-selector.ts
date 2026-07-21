/**
 * Runtime selector — thin wrapper around the Orchestra.
 *
 * Delegates to loadOrchestraSnapshot for DB-backed routing.
 * Maintains the existing RuntimeSelection interface for compatibility.
 */

import { loadOrchestraSnapshot } from './orchestra-loader.js'
import type { OrchestraRoutingMode } from '@amarktai/core'

export interface RuntimeCandidate {
  provider: string
  model: string
  displayName: string
  costTier: string
  qualityTier: string
  latencyTier: string
  estimatedCost: number | null
  pricingSource: string
  pricingConfidence: string
  pricingBlocker: string
  score: number
  reason: string
}

export interface RuntimeSelection {
  selected: RuntimeCandidate | null
  fallbacks: RuntimeCandidate[]
  rejected: Array<{ provider: string; model: string; reason: string }>
  estimatedCost: number | null
  expectedOutputType: string
  proofStatus: string
  executionId: string
  snapshotTimestamp: string
  blockReason: string | null
}

export async function selectRuntimeModel(
  capability: string,
  options?: {
    qualityTier?: string
    maxCostCents?: number
    budgetProfile?: string
    excludeProviders?: string[]
    allowUnknownCostPremium?: boolean
    routingMode?: string
    executionId?: string
    infrastructureReady?: boolean
  },
): Promise<RuntimeSelection> {
  const routingMode = (options?.routingMode ?? 'balanced') as OrchestraRoutingMode

  const decision = await loadOrchestraSnapshot({
    capability: capability as never,
    routingMode,
    qualityTier: options?.qualityTier,
    maxCostCents: options?.maxCostCents,
    executionId: options?.executionId,
  }, {
    databaseReady: true,
    queueReady: options?.infrastructureReady === true,
  })

  const selected: RuntimeCandidate | null = decision.selectedProvider
    ? {
        provider: decision.selectedProvider,
        model: decision.selectedModel ?? '',
        displayName: `${decision.selectedProvider}/${decision.selectedModel}`,
        costTier: 'medium',
        qualityTier: 'balanced',
        latencyTier: 'medium',
        estimatedCost: null,
        pricingSource: 'orchestra',
        pricingConfidence: 'derived',
        pricingBlocker: '',
        score: decision.score,
        reason: decision.reasons[0] ?? 'selected',
      }
    : null

  const fallbacks: RuntimeCandidate[] = decision.fallbackRoutes.map((f) => ({
    provider: f.provider,
    model: f.model,
    displayName: `${f.provider}/${f.model}`,
    costTier: 'medium',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    estimatedCost: null,
    pricingSource: 'orchestra',
    pricingConfidence: 'derived',
    pricingBlocker: '',
    score: f.score,
    reason: 'fallback',
  }))

  const rejected = decision.blockersRejected.flatMap((r) =>
    r.blockers.map((blocker) => ({
      provider: r.provider,
      model: r.model,
      reason: blocker,
    })),
  )

  return {
    selected,
    fallbacks,
    rejected,
    estimatedCost: selected?.estimatedCost ?? null,
    expectedOutputType: capability.includes('image') ? 'image' : capability.includes('video') ? 'video' : capability.includes('audio') || capability.includes('tts') || capability.includes('stt') ? 'audio' : 'text',
    proofStatus: 'orchestra_routed',
    executionId: decision.executionId,
    snapshotTimestamp: decision.snapshotTimestamp,
    blockReason: decision.blockReason,
  }
}
