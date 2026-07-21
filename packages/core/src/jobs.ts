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
  route: z.object({ provider: z.enum(['genx', 'together', 'deepinfra']), model: z.string().min(1) }).optional(),
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
  executionId: string | null
  appSlug: string
  status: JobStatus
  capability: string
  provider: string | null
  model: string | null
  artifactId: string | null
  progress: number
  error: string | null
  output: string | null
  executionEvidence: {
    grantSnapshotSource: string | null
    executorId: string | null
    routeType: string | null
    fallbackAttempts: unknown[]
    usage: unknown
    cost: unknown
    outputValidation: unknown
    errorClassification: unknown
    sourceArtifactId: string | null
  }
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
  'selectedProvider',
  'selectedModel',
  'executionProfile',
  'orchestraExecutorConstraint',
] as const

export const SAFE_ROUTING_FIELDS = ['routingMode'] as const

export const VALID_ROUTING_MODES = ['balanced', 'quality', 'economy', 'fast'] as const

export const ROUTING_MODE_ALIASES: Record<string, (typeof VALID_ROUTING_MODES)[number]> = {
  premium: 'quality',
  budget: 'economy',
}

export function normalizeRoutingMode(value: unknown): (typeof VALID_ROUTING_MODES)[number] {
  if (typeof value !== 'string') return 'balanced'
  const lower = value.trim().toLowerCase()
  if ((VALID_ROUTING_MODES as readonly string[]).includes(lower)) return lower as (typeof VALID_ROUTING_MODES)[number]
  const alias = ROUTING_MODE_ALIASES[lower]
  if (alias) return alias
  return 'balanced'
}

export function isValidRoutingMode(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const lower = value.trim().toLowerCase()
  return (VALID_ROUTING_MODES as readonly string[]).includes(lower) || lower in ROUTING_MODE_ALIASES
}

export function extractRoutingMode(input: Record<string, unknown> | undefined): string {
  const fromInput = input?.routingMode
  if (isValidRoutingMode(fromInput)) return fromInput as string
  return 'balanced'
}

export function hasBlockedOverrides(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) {
    if (field in input) return field
  }
  return null
}
