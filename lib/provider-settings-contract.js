export const FINAL_PROVIDER_IDS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']

const SOURCE_LABELS = {
  database: 'Stored securely',
  env: 'Env fallback / server env',
  missing: 'Missing',
  disabled: 'Disabled by admin',
}

const HEALTH_LABELS = {
  live: 'Live tested',
  configured: 'Configured',
  unconfigured: 'Unconfigured',
  disabled: 'Disabled',
  failed: 'Failed',
  gated: 'Gated',
  runtime_restricted: 'Runtime restricted',
  requires_review: 'Requires review',
  unknown: 'Unknown',
}

const CREDENTIAL_USAGE_POLICY_LABELS = {
  backend_runtime_allowed: 'Backend runtime allowed',
  coding_tools_only: 'Coding tools only',
  unknown_requires_review: 'Requires admin review',
}

const SECRET_FIELDS = new Set([
  'apiKey',
  'encryptedApiKey',
  'ciphertext',
  'key',
  'secret',
])

export function sanitizeProviderStatus(provider = {}) {
  return Object.fromEntries(
    Object.entries(provider).filter(([key]) => !SECRET_FIELDS.has(key)),
  )
}

export function normalizeProviderStatus(provider = {}) {
  const safeProvider = sanitizeProviderStatus(provider)

  return {
    providerKey: safeProvider.providerKey ?? '',
    displayName: safeProvider.displayName ?? safeProvider.providerKey ?? '',
    enabled: safeProvider.enabled === true,
    configured: safeProvider.configured === true,
    source: safeProvider.source ?? 'missing',
    maskedPreview: safeProvider.maskedPreview ?? '',
    baseUrl: safeProvider.baseUrl ?? '',
    defaultModel: safeProvider.defaultModel ?? '',
    fallbackModel: safeProvider.fallbackModel ?? '',
    credentialUsagePolicy: safeProvider.credentialUsagePolicy ?? (
      safeProvider.providerKey === 'mimo' ? 'coding_tools_only' : 'backend_runtime_allowed'
    ),
    healthStatus: safeProvider.healthStatus ?? 'unknown',
    healthMessage: safeProvider.healthMessage ?? '',
    lastCheckedAt: safeProvider.lastCheckedAt ?? null,
    sortOrder: Number.isFinite(safeProvider.sortOrder) ? safeProvider.sortOrder : 999,
    notes: safeProvider.notes ?? '',
  }
}

export function normalizeProviderStatuses(providers = []) {
  const byId = new Map(providers.map((provider) => {
    const normalized = normalizeProviderStatus(provider)
    return [normalized.providerKey, normalized]
  }))

  return FINAL_PROVIDER_IDS
    .map((providerKey, index) => byId.get(providerKey) ?? normalizeProviderStatus({
      providerKey,
      displayName: providerKey,
      enabled: false,
      configured: false,
      source: 'missing',
      healthStatus: 'unconfigured',
      sortOrder: index + 1,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getCredentialSourceLabel(source) {
  return SOURCE_LABELS[source] ?? SOURCE_LABELS.missing
}

export function getHealthStatusLabel(healthStatus) {
  return HEALTH_LABELS[healthStatus] ?? HEALTH_LABELS.unknown
}

export function getHealthStatusClasses(healthStatus) {
  if (healthStatus === 'live') return 'border-emerald-500/30 text-emerald-300'
  if (healthStatus === 'configured') return 'border-cyan-500/30 text-cyan-300'
  if (healthStatus === 'disabled' || healthStatus === 'gated' || healthStatus === 'runtime_restricted' || healthStatus === 'requires_review') return 'border-amber-500/30 text-amber-300'
  if (healthStatus === 'failed') return 'border-rose-500/30 text-rose-300'
  return 'border-white/10 text-muted-foreground'
}

export function getCredentialUsagePolicyLabel(policy) {
  return CREDENTIAL_USAGE_POLICY_LABELS[policy] ?? CREDENTIAL_USAGE_POLICY_LABELS.unknown_requires_review
}

export function makeProviderDraft(provider = {}) {
  const normalized = normalizeProviderStatus(provider)

  return {
    enabled: normalized.enabled,
    apiKey: '',
    baseUrl: normalized.baseUrl,
    defaultModel: normalized.defaultModel,
    fallbackModel: normalized.fallbackModel,
    credentialUsagePolicy: normalized.credentialUsagePolicy,
    notes: normalized.notes,
  }
}

export function buildProviderUpdatePayload(draft = {}) {
  const payload = {
    enabled: draft.enabled === true,
    baseUrl: draft.baseUrl ?? '',
    defaultModel: draft.defaultModel ?? '',
    fallbackModel: draft.fallbackModel ?? '',
    credentialUsagePolicy: draft.credentialUsagePolicy ?? 'unknown_requires_review',
    notes: draft.notes ?? '',
  }

  const trimmedKey = typeof draft.apiKey === 'string' ? draft.apiKey.trim() : ''
  if (trimmedKey) {
    payload.apiKey = trimmedKey
  }

  return payload
}
