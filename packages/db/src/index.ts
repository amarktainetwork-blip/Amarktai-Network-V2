/**
 * @amarktai/db — Prisma client and database utilities.
 */

export { prisma } from './client.js'
export {
  ProviderConfigError,
  MIMO_BACKEND_RUNTIME_BLOCKED_MESSAGE,
  MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE,
  MIMO_CODING_TOOLS_ONLY_MESSAGE,
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
