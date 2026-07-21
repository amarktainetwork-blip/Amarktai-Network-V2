/**
 * Queue configuration and job payload types — SINGLE SOURCE OF TRUTH.
 *
 * All BullMQ queue names, job payload schemas, and worker event types
 * are declared here. Both the API (producer) and worker (consumer)
 * import from this module.
 */

import { z } from 'zod'
import { CAPABILITY_KEYS } from './capabilities.js'
import { EXECUTION_PROFILES } from './orchestra.js'

export const AppCapabilityGrantSnapshotSchema = z.object({
  appSlug: z.string().min(1),
  capability: z.enum(CAPABILITY_KEYS),
  enabled: z.boolean(),
  qualityFloor: z.string(),
  budgetPolicy: z.string(),
  maxCostPerRequest: z.number(),
  maxCostPerWorkflow: z.number(),
  latencyPreference: z.string(),
  allowFallback: z.boolean(),
  maxFallbackAttempts: z.number().int().nonnegative(),
  liveProofRequired: z.boolean(),
  approvalRequired: z.boolean(),
  artifactRead: z.boolean(),
  artifactWrite: z.boolean(),
  memoryRead: z.boolean(),
  memoryWrite: z.boolean(),
  ragNamespaces: z.array(z.string()),
  policyProfile: z.string(),
  adultPermission: z.boolean(),
  dataRetentionPolicy: z.string(),
  passthroughModelAllowed: z.boolean(),
  providerResidencyConstraints: z.array(z.string()),
  routingMode: z.enum(['automatic', 'fixed_route', 'preferred_pool', 'app_selectable_allowlist', 'automatic_restricted_pool']).optional(),
  qualityTarget: z.enum(['standard', 'premium']).optional(),
  spendStrategy: z.enum(['lowest_cost', 'best_value', 'best_available', 'fixed_ceiling']).optional(),
  fixedRoute: z.string().nullable().optional(),
  preferredPool: z.array(z.string()).optional(),
  selectableAllowlist: z.array(z.string()).optional(),
  restrictedPool: z.array(z.string()).optional(),
  workflowStepOverrides: z.record(z.string(), z.unknown()).optional(),
})

// ── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  JOBS: 'amarktai-jobs',
  RETRY: 'amarktai-retry',
} as const

// ── Job Payload (API → Redis → Worker) ───────────────────────────────────────

export const JobPayloadSchema = z.object({
  jobId: z.string().uuid(),
  appSlug: z.string().min(1),
  capability: z.enum(CAPABILITY_KEYS),
  executionProfile: z.enum(EXECUTION_PROFILES).default('external_app'),
  prompt: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  traceId: z.string().default(''),
  callbackUrl: z.string().url().optional(),
  routingMode: z.string().default('balanced'),
  appGrantSnapshot: AppCapabilityGrantSnapshotSchema.optional(),
})

export type JobPayload = z.infer<typeof JobPayloadSchema>

// ── Worker Events ─────────────────────────────────────────────────────────────

export const WORKER_EVENTS = {
  JOB_STARTED: 'job:started',
  JOB_PROGRESS: 'job:progress',
  JOB_COMPLETED: 'job:completed',
  JOB_FAILED: 'job:failed',
} as const

// ── BullMQ Options ────────────────────────────────────────────────────────────

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
}

export const WORKER_CONCURRENCY = 5
