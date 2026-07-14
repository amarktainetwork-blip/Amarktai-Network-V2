/**
 * Provider definitions — SINGLE SOURCE OF TRUTH.
 *
 * All provider keys, routing metadata, and provider capability maps
 * are declared here. No other file may duplicate provider lists.
 */

import { z } from 'zod'

// ── Provider Keys ─────────────────────────────────────────────────────────────

/**
 * The single approved-provider definition. Runtime, discovery, API, worker and
 * dashboard projections derive their provider lists and policy from this data.
 */
export const APPROVED_PROVIDER_DEFINITIONS = [
  {
    key: 'genx',
    displayName: 'GenX',
    runtimeRole: 'media_runtime',
    credentialEnvKey: 'GENX_API_KEY',
    discoveryPolicy: 'live_with_docs_fallback',
    defaultBaseUrl: 'https://query.genx.sh',
    backendExecutionAllowed: true,
    codingOnly: false,
  },
  {
    key: 'groq',
    displayName: 'Groq',
    runtimeRole: 'language_runtime',
    credentialEnvKey: 'GROQ_API_KEY',
    discoveryPolicy: 'live_with_docs_fallback',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    backendExecutionAllowed: true,
    codingOnly: false,
  },
  {
    key: 'together',
    displayName: 'Together',
    runtimeRole: 'media_runtime',
    credentialEnvKey: 'TOGETHER_API_KEY',
    discoveryPolicy: 'live_with_docs_fallback',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    backendExecutionAllowed: true,
    codingOnly: false,
  },
  {
    key: 'mimo',
    displayName: 'MiMo',
    runtimeRole: 'coding_agent_only',
    credentialEnvKey: 'MIMO_API_KEY',
    discoveryPolicy: 'docs_only',
    defaultBaseUrl: '',
    backendExecutionAllowed: false,
    codingOnly: true,
  },
  {
    key: 'deepinfra',
    displayName: 'DeepInfra',
    runtimeRole: 'language_runtime',
    credentialEnvKey: 'DEEPINFRA_API_KEY',
    discoveryPolicy: 'live_with_docs_fallback',
    defaultBaseUrl: 'https://api.deepinfra.com/v1',
    backendExecutionAllowed: true,
    codingOnly: false,
  },
] as const

export type ApprovedProviderDefinition = (typeof APPROVED_PROVIDER_DEFINITIONS)[number]
export type ProviderKey = ApprovedProviderDefinition['key']

export const PROVIDER_KEYS = APPROVED_PROVIDER_DEFINITIONS.map((provider) => provider.key) as [ProviderKey, ...ProviderKey[]]
export const RUNTIME_EXECUTION_PROVIDERS = APPROVED_PROVIDER_DEFINITIONS
  .filter((provider) => provider.backendExecutionAllowed)
  .map((provider) => provider.key) as Exclude<ProviderKey, 'mimo'>[]
export type RuntimeExecutionProvider = (typeof RUNTIME_EXECUTION_PROVIDERS)[number]
export const CODING_ONLY_PROVIDERS = APPROVED_PROVIDER_DEFINITIONS
  .filter((provider) => provider.codingOnly)
  .map((provider) => provider.key) as ProviderKey[]

export const PROVIDER_ENV_VARS = Object.fromEntries(
  APPROVED_PROVIDER_DEFINITIONS.map((provider) => [provider.key, provider.credentialEnvKey]),
) as Record<ProviderKey, string>

// ── Provider Status ───────────────────────────────────────────────────────────

export const PROVIDER_HEALTH_STATUSES = [
  'unconfigured',
  'configured',
  'untested',
  'live',
  'unhealthy',
  'insufficient_credit',
  'authentication_failed',
  'rate_limited',
  'policy_restricted',
  'failed',
  'gated',
  'runtime_restricted',
  'requires_review',
  'healthy',
  'degraded',
  'error',
  'disabled',
] as const

export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number]

export const CREDENTIAL_USAGE_POLICIES = [
  'backend_runtime_allowed',
  'coding_tools_only',
  'unknown_requires_review',
] as const

export type CredentialUsagePolicy = (typeof CREDENTIAL_USAGE_POLICIES)[number]

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
  credentialUsagePolicy: z.enum(CREDENTIAL_USAGE_POLICIES).default('backend_runtime_allowed'),
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

export function getProviderEnvVar(provider: ProviderKey): string {
  return PROVIDER_ENV_VARS[provider]
}

export function getProviderDefinition(provider: ProviderKey): ApprovedProviderDefinition {
  return APPROVED_PROVIDER_DEFINITIONS.find((definition) => definition.key === provider)!
}

export function getProviderDefaultBaseUrl(provider: ProviderKey): string {
  return getProviderDefinition(provider).defaultBaseUrl
}
