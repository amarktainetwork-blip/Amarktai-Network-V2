/**
 * Provider Routing Skeleton — SINGLE SOURCE OF TRUTH.
 *
 * Phase 5: Provider Routing Skeleton
 *
 * This module provides internal routing logic that selects eligible
 * provider candidates for a given capability. It does NOT execute
 * providers, call APIs, generate artifacts, or produce outputs.
 *
 * "Configured" means: local env var/config presence only.
 * "Configured" does NOT mean: live, tested, or execution-ready.
 */

import { PROVIDER_KEYS, isValidProvider, type ProviderKey } from './providers.js'
import { getCapabilityCategory, type CapabilityKey } from './capabilities.js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderCandidate {
  provider: ProviderKey
  supported: boolean
  gated: boolean
  configured: boolean
  reason: string
}

export interface ProviderRouteDecision {
  capability: CapabilityKey
  selectedProvider: ProviderKey | null
  selectedModel: string | null
  candidates: ProviderCandidate[]
  executionAllowed: false
  blocked: boolean
  blockReason: string | null
}

export interface RoutingOptions {
  /** Reserved for future internally gated lanes. */
  allowGated?: boolean
}

// ── Provider → Capability Support Map ──────────────────────────────────────────
// Maps providers to the capability CATEGORIES they support.
// This is a static routing skeleton, not a live capability check.

const PROVIDER_CATEGORY_SUPPORT: Record<ProviderKey, string[]> = {
  genx: ['video', 'image', 'audio'],
  groq: ['text', 'code', 'audio'],
  together: ['text', 'image', 'code', 'retrieval', 'document'],
  mimo: [],
  deepinfra: ['text', 'code'],
}

// ── Provider Env Var Map ───────────────────────────────────────────────────────
// Maps providers to their env var names for config presence check.

const PROVIDER_ENV_VARS: Record<ProviderKey, string> = {
  genx: 'GENX_API_KEY',
  groq: 'GROQ_API_KEY',
  together: 'TOGETHER_API_KEY',
  mimo: 'MIMO_API_KEY',
  deepinfra: 'DEEPINFRA_API_KEY',
}

// ── Provider Config Check ─────────────────────────────────────────────────────
// Checks if the env var is present. Does NOT validate the key, call APIs,
// or mark the provider as live.

export function isProviderConfigured(provider: ProviderKey): boolean {
  const envVar = PROVIDER_ENV_VARS[provider]
  return !!process.env[envVar]
}

// ── DeepInfra Gate ─────────────────────────────────────────────────────────────

export function isDeepInfraGated(): boolean {
  return false
}

// ── Provider Routing ──────────────────────────────────────────────────────────

export function routeProvider(
  capability: CapabilityKey,
  options: RoutingOptions = {}
): ProviderRouteDecision {
  const { allowGated = false } = options
  const category = getCapabilityCategory(capability)

  // Build candidate list
  const candidates: ProviderCandidate[] = PROVIDER_KEYS.map((provider) => {
    const isGated = false
    const supportsCategory = PROVIDER_CATEGORY_SUPPORT[provider]?.includes(category) ?? false
    const configured = isProviderConfigured(provider)

    // Reserved gated-lane support
    if (isGated && !allowGated) {
      return {
        provider,
        supported: supportsCategory,
        gated: true,
        configured,
        reason: 'DeepInfra is gated. Explicit gate flag required.',
      }
    }

    if (isGated && allowGated) {
      return {
        provider,
        supported: supportsCategory,
        gated: true,
        configured,
        reason: configured
          ? 'DeepInfra gated lane — config present, not execution-ready'
          : 'DeepInfra gated lane — config missing',
      }
    }

    // Normal providers
    if (!supportsCategory) {
      return {
        provider,
        supported: false,
        gated: false,
        configured,
        reason: `Provider does not support category '${category}'`,
      }
    }

    if (!configured) {
      return {
        provider,
        supported: true,
        gated: false,
        configured: false,
        reason: 'Config missing — env var not set',
      }
    }

    return {
      provider,
      supported: true,
      gated: false,
      configured: true,
      reason: 'Config present — not execution-ready',
    }
  })

  // Select best candidate
  // Priority: configured + supported + non-gated > configured + supported + gated > blocked
  const eligible = candidates.filter(
    (c) => c.supported && c.configured && !c.gated
  )

  let selectedProvider: ProviderKey | null = null
  let blockReason: string | null = null

  if (eligible.length > 0) {
    // Deterministic: preserve final provider priority. Groq remains primary
    // for text while DeepInfra participates as a later fallback candidate.
    eligible.sort((a, b) => PROVIDER_KEYS.indexOf(a.provider) - PROVIDER_KEYS.indexOf(b.provider))
    const best = eligible[0]
    if (best) {
      selectedProvider = best.provider
    }
  } else {
    // Check if any configured candidate exists (including gated)
    const anyConfigured = candidates.filter((c) => c.supported && c.configured)
    if (anyConfigured.length > 0 && allowGated) {
      // Only select gated if explicitly allowed
      const gatedCandidate = anyConfigured.find((c) => c.gated)
      if (gatedCandidate) {
        selectedProvider = gatedCandidate.provider
      }
    }

    if (!selectedProvider) {
      const supportedButNotConfigured = candidates.filter(
        (c) => c.supported && !c.configured
      )
      const noSupport = candidates.filter((c) => !c.supported)

      if (supportedButNotConfigured.length > 0) {
        blockReason = `No configured provider supports capability '${capability}'. Supported providers missing config: ${supportedButNotConfigured.map((c) => c.provider).join(', ')}`
      } else if (noSupport.length === candidates.length) {
        blockReason = `No provider supports capability '${capability}' (category: ${category})`
      } else {
        blockReason = `No eligible provider for capability '${capability}'`
      }
    }
  }

  return {
    capability,
    selectedProvider,
    selectedModel: null, // Model selection not implemented in Phase 5
    candidates,
    executionAllowed: false, // Always false in Phase 5
    blocked: !selectedProvider,
    blockReason,
  }
}

// ── Validation helpers ─────────────────────────────────────────────────────────

export function isValidProviderId(key: string): key is ProviderKey {
  return isValidProvider(key)
}

export function getProviderEnvVar(provider: ProviderKey): string {
  return PROVIDER_ENV_VARS[provider]
}

export function getProviderCategorySupport(provider: ProviderKey): string[] {
  return PROVIDER_CATEGORY_SUPPORT[provider] ?? []
}
