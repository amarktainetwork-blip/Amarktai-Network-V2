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
  configured: boolean
  source: ProviderCredentialSource
  maskedPreview: string
  baseUrl: string
  defaultModel: string
  fallbackModel: string
  healthStatus: string
  healthMessage: string
  lastCheckedAt: Date | null
  sortOrder: number
  notes: string
}

export interface SaveProviderCredentialInput {
  providerKey: string
  apiKey?: string
  clearKey?: boolean
  enabled?: boolean
  baseUrl?: string
  defaultModel?: string
  fallbackModel?: string
  notes?: string
}

export class ProviderConfigError extends Error {
  constructor(
    message: string,
    readonly providerKey: string,
    readonly code: 'invalid-provider' | 'missing-config' | 'disabled' | 'decrypt-failed',
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

export async function resolveProviderApiKey(providerKey: string): Promise<ResolvedProviderApiKey> {
  const key = assertProviderKey(providerKey)
  const row = await prisma.aiProvider.findUnique({ where: { providerKey: key } })

  if (row && !row.enabled) {
    throw new ProviderConfigError(`Provider '${key}' is disabled`, key, 'disabled')
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
  const enabled = row?.enabled ?? false
  const source: ProviderCredentialSource = hasDbKey ? 'database' : hasEnvKey ? 'env' : 'missing'

  return {
    providerKey: key,
    displayName: row?.displayName ?? PROVIDER_DISPLAY_NAMES[key],
    enabled,
    configured: hasDbKey ? enabled : hasEnvKey,
    source,
    maskedPreview: hasDbKey ? row?.maskedPreview ?? '' : '',
    baseUrl: row?.baseUrl ?? '',
    defaultModel: row?.defaultModel ?? '',
    fallbackModel: row?.fallbackModel ?? '',
    healthStatus: row?.healthStatus ?? (hasEnvKey ? 'configured' : 'unconfigured'),
    healthMessage: row?.healthMessage ?? '',
    lastCheckedAt: row?.lastCheckedAt ?? null,
    sortOrder: row?.sortOrder ?? defaultSortOrder(key),
    notes: row?.notes ?? '',
  }
}

export async function listProviderCredentialStatuses(): Promise<ProviderCredentialStatus[]> {
  const statuses = await Promise.all(PROVIDER_KEYS.map((providerKey) => getProviderCredentialStatus(providerKey)))
  return statuses.sort((a, b) => a.sortOrder - b.sortOrder || a.providerKey.localeCompare(b.providerKey))
}

export async function saveProviderCredential(input: SaveProviderCredentialInput): Promise<ProviderCredentialStatus> {
  const providerKey = assertProviderKey(input.providerKey)
  const existing = await prisma.aiProvider.findUnique({ where: { providerKey } })
  const data: Record<string, unknown> = {
    providerKey,
    displayName: existing?.displayName ?? PROVIDER_DISPLAY_NAMES[providerKey],
    sortOrder: existing?.sortOrder ?? defaultSortOrder(providerKey),
  }

  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl
  if (input.defaultModel !== undefined) data.defaultModel = input.defaultModel
  if (input.fallbackModel !== undefined) data.fallbackModel = input.fallbackModel
  if (input.notes !== undefined) data.notes = input.notes

  if (input.clearKey) {
    data.apiKey = ''
    data.maskedPreview = ''
    data.healthStatus = 'unconfigured'
    data.healthMessage = ''
  } else if (input.apiKey && input.apiKey.trim()) {
    data.apiKey = encryptProviderKey(input.apiKey.trim())
    data.maskedPreview = maskProviderKey(input.apiKey.trim())
    data.healthStatus = 'configured'
    data.healthMessage = 'Credential stored; live health not checked.'
  }

  await prisma.aiProvider.upsert({
    where: { providerKey },
    create: {
      providerKey,
      displayName: PROVIDER_DISPLAY_NAMES[providerKey],
      enabled: input.enabled ?? false,
      baseUrl: input.baseUrl ?? '',
      defaultModel: input.defaultModel ?? '',
      fallbackModel: input.fallbackModel ?? '',
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

function assertProviderKey(providerKey: string): ProviderKey {
  if (!isValidProvider(providerKey)) {
    throw new ProviderConfigError(`Invalid provider key '${providerKey}'`, providerKey, 'invalid-provider')
  }
  return providerKey
}

function defaultSortOrder(providerKey: ProviderKey): number {
  return PROVIDER_KEYS.indexOf(providerKey) + 1
}
