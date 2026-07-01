/**
 * Authentication and authorization contracts — SINGLE SOURCE OF TRUTH.
 *
 * All token validation, app connection checks, capability allowlists,
 * and budget limit schemas are declared here.
 */

// ── Auth Token Format ─────────────────────────────────────────────────────────

export const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/

export function parseBearerToken(header: string): string | null {
  const match = header.match(BEARER_TOKEN_PATTERN)
  return match?.[1] ?? null
}

// ── Auth Result ──────────────────────────────────────────────────────────────

export interface AppAuthResult {
  ok: boolean
  statusCode: number
  error?: string
  app?: {
    id: number
    name: string
    slug: string
    category: string
    appType: string
    aiEnabled: boolean
    connectedToBrain: boolean
    status: string
  }
  allowedCapabilities?: string[]
  dailyBudgetCents?: number
  dailySpendCents?: number
}

// ── App Connection Status ─────────────────────────────────────────────────────

export const APP_CONNECTION_STATUSES = ['active', 'paused', 'suspended', 'unconfigured'] as const

export type AppConnectionStatus = (typeof APP_CONNECTION_STATUSES)[number]
