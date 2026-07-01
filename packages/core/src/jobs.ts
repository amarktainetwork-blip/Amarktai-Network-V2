/**
 * Job lifecycle types and validation — SINGLE SOURCE OF TRUTH.
 *
 * All job status transitions, request schemas, and response contracts
 * are declared here. The API gateway, worker, and database all import
 * from this module.
 */

import { z } from 'zod'
import { CAPABILITY_KEYS } from './capabilities.js'

// ── Job Statuses ──────────────────────────────────────────────────────────────

export const JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

// ── Job Creation Request (external app → API) ────────────────────────────────

export const CreateJobRequestSchema = z.object({
  capability: z.enum(CAPABILITY_KEYS),
  prompt: z.string().min(1).max(100_000),
  input: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  callbackUrl: z.string().url().optional(),
})

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>

// ── Job Creation Response (API → external app) ───────────────────────────────

export interface CreateJobResponse {
  jobId: string
  status: JobStatus
  capability: string
  createdAt: string
}

// ── Job Status Response ──────────────────────────────────────────────────────

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  capability: string
  provider: string | null
  model: string | null
  artifactId: string | null
  progress: number
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

// ── COMPLIANCE GATE: Blocked fields ──────────────────────────────────────────

/**
 * Fields that external apps are NEVER allowed to pass.
 * The API gateway must reject any request containing these fields
 * with a 400 Bad Request immediately.
 */
export const BLOCKED_OVERRIDE_FIELDS = [
  'providerOverride',
  'modelOverride',
  'provider',
  'model',
  'providerKey',
  'modelId',
] as const

export function hasBlockedOverrides(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) {
    if (field in input) return field
  }
  return null
}
