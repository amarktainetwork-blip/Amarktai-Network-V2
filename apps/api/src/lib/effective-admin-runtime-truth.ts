import type { FastifyInstance } from 'fastify'
import { normalizeEffectiveRuntimeTruth } from '@amarktai/core/effective-runtime-truth'
import { buildAdminRuntimeTruth } from './admin-runtime-truth.js'
import { applyPersistedInternalExecutorProof } from './internal-executor-proof.js'

/**
 * The sole admin-facing runtime truth projection.
 *
 * Provider-backed atomic execution remains grounded in the canonical
 * model/executor registry. Durable composite workflows are grounded in their
 * authenticated workflow registrations. Internal atomic executors are grounded
 * in their engine/queue/worker/artifact registrations and persisted local proof,
 * without acquiring a fake provider or model.
 */
export async function buildEffectiveAdminRuntimeTruth(app: FastifyInstance) {
  const providerAndWorkflowTruth = await buildAdminRuntimeTruth(app)
  const withInternalProof = await applyPersistedInternalExecutorProof(providerAndWorkflowTruth)
  return normalizeEffectiveRuntimeTruth(withInternalProof)
}
