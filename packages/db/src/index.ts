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
  type ProviderCredentialSource,
  type ProviderCredentialStatus,
  type ResolvedProviderApiKey,
  type SaveProviderCredentialInput,
} from './provider-credentials.js'
