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
  unknown: 'Unknown',
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
  if (healthStatus === 'disabled' || healthStatus === 'gated') return 'border-amber-500/30 text-amber-300'
  if (healthStatus === 'failed') return 'border-rose-500/30 text-rose-300'
  return 'border-white/10 text-muted-foreground'
}

export function makeProviderDraft(provider = {}) {
  const normalized = normalizeProviderStatus(provider)

  return {
    enabled: normalized.enabled,
    apiKey: '',
    baseUrl: normalized.baseUrl,
    defaultModel: normalized.defaultModel,
    fallbackModel: normalized.fallbackModel,
    notes: normalized.notes,
  }
}

export function buildProviderUpdatePayload(draft = {}) {
  const payload = {
    enabled: draft.enabled === true,
    baseUrl: draft.baseUrl ?? '',
    defaultModel: draft.defaultModel ?? '',
    fallbackModel: draft.fallbackModel ?? '',
    notes: draft.notes ?? '',
  }

  const trimmedKey = typeof draft.apiKey === 'string' ? draft.apiKey.trim() : ''
  if (trimmedKey) {
    payload.apiKey = trimmedKey
  }

  return payload
}
