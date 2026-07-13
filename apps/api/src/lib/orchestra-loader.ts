/**
 * Orchestra snapshot loader — the only API-layer component that queries DB
 * evidence for routing decisions. Loads facts once, normalizes via shared
 * pure normalizer, calls the pure core Orchestra, returns one immutable decision.
 */

import { prisma } from '@amarktai/db'
import {
  evaluateOrchestra,
  normalizeDbCandidates,
  type OrchestraDecision,
  type OrchestraRequest,
} from '@amarktai/core'

export async function loadOrchestraSnapshot(
  request: OrchestraRequest,
): Promise<OrchestraDecision> {
  const [allModels, providers] = await Promise.all([
    prisma.modelRegistryEntry.findMany({ where: { enabled: true } }),
    prisma.aiProvider.findMany(),
  ])

  const candidates = normalizeDbCandidates(allModels, providers, request.capability)

  return evaluateOrchestra(request, candidates)
}
