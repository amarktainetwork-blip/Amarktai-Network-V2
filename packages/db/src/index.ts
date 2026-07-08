/**
 * @amarktai/db — Prisma client and database utilities.
 */

export { prisma } from './client.js'
export {
  ProviderConfigError,
  resolveProviderApiKey,
  getProviderCredentialStatus,
  listProviderCredentialStatuses,
  saveProviderCredential,
  clearProviderCredential,
  normalizeCredentialUsagePolicy,
  updateProviderHealthStatus,
  type ProviderCredentialSource,
  type ProviderCredentialStatus,
  type ResolvedProviderApiKey,
  type SaveProviderCredentialInput,
  type UpdateProviderHealthInput,
} from './provider-credentials.js'
