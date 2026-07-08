/**
 * Server-side provider credential resolver.
 *
 * DB-backed keys win over env fallback. Raw keys are returned only to backend
 * runtime callers that need to call provider APIs.
 */

import {
  PROVIDER_KEYS,
  decryptProviderKey,
  encryptProviderKey,
  getProviderEnvVar,
  isValidProvider,
  maskProviderKey,
  type CredentialUsagePolicy,
  type ProviderKey,
} from '@amarktai/core'
import { prisma } from './client.js'

export type ProviderCredentialSource = 'database' | 'env' | 'missing'

export interface ResolvedProviderApiKey {
  providerKey: ProviderKey
  apiKey: string
  source: Exclude<ProviderCredentialSource, 'missing'>
}

export interface ProviderCredentialStatus {
  providerKey: ProviderKey
  displayName: string
  enabled: boolean
  runtimeEnabled: boolean
  configured: boolean
  source: ProviderCredentialSource
  maskedPreview: string
  baseUrl: string
  defaultModel: string
  fallbackModel: string
  credentialUsagePolicy: CredentialUsagePolicy
  healthStatus: string
  healthMessage: string
  lastCheckedAt: Date | null
  sortOrder: number
  notes: string
}

export const MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE = 'MiMo is disabled for backend runtime. Current credential is for interactive coding tools only. Supply a backend/application-allowed MiMo credential before enabling runtime.'

export interface SaveProviderCredentialInput {
  providerKey: string
  apiKey?: string
  clearKey?: boolean
  enabled?: boolean
  baseUrl?: string
  defaultModel?: string
  fallbackModel?: string
  credentialUsagePolicy?: string
  notes?: string
}

export interface UpdateProviderHealthInput {
  providerKey: string
  healthStatus: string
  healthMessage: string
  lastCheckedAt?: Date
}

export class ProviderConfigError extends Error {
  constructor(
    message: string,
    readonly providerKey: string,
    readonly code: 'invalid-provider' | 'missing-config' | 'disabled' | 'decrypt-failed' | 'runtime-restricted',
  ) {
    super(message)
    this.name = 'ProviderConfigError'
  }
}

const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  genx: 'GenX',
  groq: 'Groq',
  together: 'Together AI',
  mimo: 'Mimo',
  deepinfra: 'DeepInfra',
}

const PROVIDER_KEY_LIST: readonly ProviderKey[] = PROVIDER_KEYS

export async function resolveProviderApiKey(providerKey: string): Promise<ResolvedProviderApiKey> {
  const key = assertProviderKey(providerKey)
  const row = await prisma.aiProvider.findUnique({ where: { providerKey: key } })
  const usagePolicy = normalizeCredentialUsagePolicy(
    row?.credentialUsagePolicy,
    key,
  )

  if (row && !row.enabled) {
    throw new ProviderConfigError(`Provider '${key}' is disabled`, key, 'disabled')
  }

  if (key === 'mimo') {
    throw new ProviderConfigError(
      'MiMo backend runtime is disabled.',
      key,
      'runtime-restricted',
    )
  }

  if (row?.apiKey) {
    try {
      return {
        providerKey: key,
        apiKey: decryptProviderKey(row.apiKey),
        source: 'database',
      }
    } catch {
      throw new ProviderConfigError(`Provider '${key}' key cannot be decrypted`, key, 'decrypt-failed')
    }
  }

  const envKey = process.env[getProviderEnvVar(key)]
  if (envKey) {
    return { providerKey: key, apiKey: envKey, source: 'env' }
  }

  throw new ProviderConfigError(`Provider '${key}' is missing configuration`, key, 'missing-config')
}

export async function getProviderCredentialStatus(providerKey: string): Promise<ProviderCredentialStatus> {
  const key = assertProviderKey(providerKey)
  const row = await prisma.aiProvider.findUnique({ where: { providerKey: key } })
  const hasDbKey = !!row?.apiKey
  const hasEnvKey = !!process.env[getProviderEnvVar(key)]
  const storedEnabled = row?.enabled ?? false
  const enabled = key === 'mimo' ? false : storedEnabled
  const source: ProviderCredentialSource = hasDbKey ? 'database' : hasEnvKey ? 'env' : 'missing'
  const credentialUsagePolicy = normalizeCredentialUsagePolicy(
    row?.credentialUsagePolicy,
    key,
  )
  const configured = key === 'mimo'
    ? hasDbKey || hasEnvKey
    : hasDbKey ? enabled : hasEnvKey
  const healthStatus = key === 'mimo' && configured
    ? 'runtime_restricted'
    : row?.healthStatus ?? (hasEnvKey ? 'configured' : 'unconfigured')
  const healthMessage = key === 'mimo' && configured
    ? MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE
    : row?.healthMessage ?? ''

  return {
    providerKey: key,
    displayName: row?.displayName ?? getProviderDisplayName(key),
    enabled,
    runtimeEnabled: key === 'mimo' ? false : enabled,
    configured,
    source,
    maskedPreview: hasDbKey ? row?.maskedPreview ?? '' : '',
    baseUrl: row?.baseUrl ?? '',
    defaultModel: row?.defaultModel ?? '',
    fallbackModel: row?.fallbackModel ?? '',
    credentialUsagePolicy: key === 'mimo' ? 'coding_tools_only' : credentialUsagePolicy,
    healthStatus,
    healthMessage,
    lastCheckedAt: row?.lastCheckedAt ?? null,
    sortOrder: row?.sortOrder ?? defaultSortOrder(key),
    notes: row?.notes ?? '',
  }
}

export async function listProviderCredentialStatuses(): Promise<ProviderCredentialStatus[]> {
  const statuses = await Promise.all(
    PROVIDER_KEY_LIST.map((providerKey: ProviderKey) => getProviderCredentialStatus(providerKey)),
  )
  return statuses.sort((a: ProviderCredentialStatus, b: ProviderCredentialStatus) => (
    a.sortOrder - b.sortOrder || a.providerKey.localeCompare(b.providerKey)
  ))
}

export async function saveProviderCredential(input: SaveProviderCredentialInput): Promise<ProviderCredentialStatus> {
  const providerKey = assertProviderKey(input.providerKey)
  const existing = await prisma.aiProvider.findUnique({ where: { providerKey } })
  const data: Record<string, unknown> = {
    providerKey,
    displayName: existing?.displayName ?? getProviderDisplayName(providerKey),
    sortOrder: existing?.sortOrder ?? defaultSortOrder(providerKey),
  }

  if (providerKey === 'mimo') {
    data.enabled = false
    data.credentialUsagePolicy = 'coding_tools_only'
    data.healthStatus = 'runtime_restricted'
    data.healthMessage = MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE
  } else if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl
  if (input.defaultModel !== undefined) data.defaultModel = input.defaultModel
  if (input.fallbackModel !== undefined) data.fallbackModel = input.fallbackModel
  if (input.credentialUsagePolicy !== undefined) {
    data.credentialUsagePolicy = normalizeCredentialUsagePolicy(input.credentialUsagePolicy, providerKey)
  }
  if (input.notes !== undefined) data.notes = input.notes

  if (input.clearKey) {
    data.apiKey = ''
    data.maskedPreview = ''
    data.healthStatus = 'unconfigured'
    data.healthMessage = ''
  } else if (input.apiKey && input.apiKey.trim()) {
    data.apiKey = encryptProviderKey(input.apiKey.trim())
    data.maskedPreview = maskProviderKey(input.apiKey.trim())
    data.credentialUsagePolicy = providerKey === 'mimo'
      ? 'coding_tools_only'
      : typeof data.credentialUsagePolicy === 'string'
      ? data.credentialUsagePolicy
      : defaultCredentialUsagePolicy(providerKey)
    data.healthStatus = providerKey === 'mimo' ? 'runtime_restricted' : 'configured'
    data.healthMessage = providerKey === 'mimo'
      ? MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE
      : 'Credential stored; live health not checked.'
  }

  await prisma.aiProvider.upsert({
    where: { providerKey },
    create: {
      providerKey,
      displayName: getProviderDisplayName(providerKey),
      enabled: providerKey === 'mimo' ? false : input.enabled ?? false,
      baseUrl: input.baseUrl ?? '',
      defaultModel: input.defaultModel ?? '',
      fallbackModel: input.fallbackModel ?? '',
      credentialUsagePolicy: providerKey === 'mimo'
        ? 'coding_tools_only'
        : typeof data.credentialUsagePolicy === 'string'
        ? data.credentialUsagePolicy
        : defaultCredentialUsagePolicy(providerKey),
      notes: input.notes ?? '',
      sortOrder: defaultSortOrder(providerKey),
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
      maskedPreview: typeof data.maskedPreview === 'string' ? data.maskedPreview : '',
      healthStatus: typeof data.healthStatus === 'string' ? data.healthStatus : 'unconfigured',
      healthMessage: typeof data.healthMessage === 'string' ? data.healthMessage : '',
    },
    update: data,
  })

  return getProviderCredentialStatus(providerKey)
}

export async function clearProviderCredential(providerKey: string): Promise<ProviderCredentialStatus> {
  return saveProviderCredential({ providerKey, clearKey: true, enabled: false })
}

export async function updateProviderHealthStatus(input: UpdateProviderHealthInput): Promise<ProviderCredentialStatus> {
  const providerKey = assertProviderKey(input.providerKey)
  const existing = await prisma.aiProvider.findUnique({ where: { providerKey } })
  const isMimo = providerKey === 'mimo'
  const updateData: Record<string, unknown> = {
    healthStatus: isMimo ? 'runtime_restricted' : input.healthStatus,
    healthMessage: isMimo ? MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE : input.healthMessage,
    lastCheckedAt: input.lastCheckedAt ?? new Date(),
    displayName: existing?.displayName ?? getProviderDisplayName(providerKey),
    sortOrder: existing?.sortOrder ?? defaultSortOrder(providerKey),
  }
  if (isMimo) {
    updateData.enabled = false
    updateData.credentialUsagePolicy = 'coding_tools_only'
  }

  await prisma.aiProvider.upsert({
    where: { providerKey },
    create: {
      providerKey,
      displayName: getProviderDisplayName(providerKey),
      enabled: isMimo ? false : true,
      baseUrl: '',
      defaultModel: '',
      fallbackModel: '',
      credentialUsagePolicy: isMimo ? 'coding_tools_only' : defaultCredentialUsagePolicy(providerKey),
      notes: '',
      sortOrder: defaultSortOrder(providerKey),
      apiKey: '',
      maskedPreview: '',
      healthStatus: isMimo ? 'runtime_restricted' : input.healthStatus,
      healthMessage: isMimo ? MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE : input.healthMessage,
      lastCheckedAt: input.lastCheckedAt ?? new Date(),
    },
    update: updateData,
  })

  return getProviderCredentialStatus(providerKey)
}

export function normalizeCredentialUsagePolicy(
  policy: string | null | undefined,
  providerKey: ProviderKey,
): CredentialUsagePolicy {
  if (
    policy === 'backend_runtime_allowed'
    || policy === 'coding_tools_only'
    || policy === 'unknown_requires_review'
  ) {
    return policy
  }
  return defaultCredentialUsagePolicy(providerKey)
}

function defaultCredentialUsagePolicy(providerKey: ProviderKey): CredentialUsagePolicy {
  return providerKey === 'mimo' ? 'coding_tools_only' : 'backend_runtime_allowed'
}

function assertProviderKey(providerKey: string): ProviderKey {
  if (!isValidProvider(providerKey)) {
    throw new ProviderConfigError(`Invalid provider key '${providerKey}'`, providerKey, 'invalid-provider')
  }
  return providerKey
}

function defaultSortOrder(providerKey: ProviderKey): number {
  const index = PROVIDER_KEY_LIST.indexOf(providerKey)
  return index >= 0 ? index + 1 : PROVIDER_KEY_LIST.length + 1
}

function getProviderDisplayName(providerKey: ProviderKey): string {
  return PROVIDER_DISPLAY_NAMES[providerKey] ?? providerKey
}
