import type { FastifyInstance } from 'fastify'
import { normalizeDurableWorkflowRuntimeTruth } from '@amarktai/core/effective-runtime-truth'
import { buildAdminRuntimeTruth } from './admin-runtime-truth.js'

/**
 * The sole admin-facing runtime truth projection.
 *
 * Atomic provider execution remains grounded in the canonical model/executor
 * registry. Durable composite workflows are then normalized from their
 * authenticated API/worker/persistence/recovery registrations so the dashboard
 * cannot report them as NOT_IMPLEMENTED while also listing them as implemented.
 */
export async function buildEffectiveAdminRuntimeTruth(app: FastifyInstance) {
  return normalizeDurableWorkflowRuntimeTruth(await buildAdminRuntimeTruth(app))
}
