/**
 * Queue configuration and job payload types — SINGLE SOURCE OF TRUTH.
 *
 * All BullMQ queue names, job payload schemas, and worker event types
 * are declared here. Both the API (producer) and worker (consumer)
 * import from this module.
 */

import { z } from 'zod'
import { CAPABILITY_KEYS } from './capabilities.js'

// ── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  JOBS: 'amarktai:jobs',
  RETRY: 'amarktai:retry',
} as const

// ── Job Payload (API → Redis → Worker) ───────────────────────────────────────

export const JobPayloadSchema = z.object({
  jobId: z.string().uuid(),
  appSlug: z.string().min(1),
  capability: z.enum(CAPABILITY_KEYS),
  prompt: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  traceId: z.string().default(''),
  callbackUrl: z.string().url().optional(),
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
