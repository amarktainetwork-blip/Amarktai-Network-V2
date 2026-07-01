/**
 * Provider definitions — SINGLE SOURCE OF TRUTH.
 *
 * All provider keys, routing metadata, and provider capability maps
 * are declared here. No other file may duplicate provider lists.
 */

import { z } from 'zod'

// ── Provider Keys ─────────────────────────────────────────────────────────────

export const PROVIDER_KEYS = ['genx', 'together', 'groq', 'mimo'] as const

export type ProviderKey = (typeof PROVIDER_KEYS)[number]

// ── Provider Status ───────────────────────────────────────────────────────────

export const PROVIDER_HEALTH_STATUSES = [
  'unconfigured',
  'configured',
  'healthy',
  'degraded',
  'error',
  'disabled',
] as const

export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number]

// ── Cost Tiers ────────────────────────────────────────────────────────────────

export const COST_TIERS = ['free', 'very_low', 'low', 'medium', 'high', 'premium'] as const

export type CostTier = (typeof COST_TIERS)[number]

// ── Latency Tiers ─────────────────────────────────────────────────────────────

export const LATENCY_TIERS = ['ultra_low', 'low', 'medium', 'high'] as const

export type LatencyTier = (typeof LATENCY_TIERS)[number]

// ── Provider Definition Schema ────────────────────────────────────────────────

export const ProviderDefinitionSchema = z.object({
  key: z.enum(PROVIDER_KEYS),
  displayName: z.string(),
  enabled: z.boolean().default(false),
  baseUrl: z.string().default(''),
  defaultModel: z.string().default(''),
  fallbackModel: z.string().default(''),
  healthStatus: z.enum(PROVIDER_HEALTH_STATUSES).default('unconfigured'),
})

export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>

// ── Provider Capability Mapping ───────────────────────────────────────────────

export const ProviderCapabilityMapSchema = z.object({
  providerKey: z.enum(PROVIDER_KEYS),
  capabilityKey: z.string(),
  models: z.array(z.string()).default([]),
  proven: z.boolean().default(false),
})

export type ProviderCapabilityMap = z.infer<typeof ProviderCapabilityMapSchema>

// ── Validation helpers ────────────────────────────────────────────────────────

export function isValidProvider(key: string): key is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(key)
}
