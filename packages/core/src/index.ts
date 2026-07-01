/**
 * @amarktai/core — Single source of truth for the AmarktAI Network.
 *
 * Re-exports all canonical types, schemas, validation helpers,
 * and configuration constants. Every other package and app
 * imports from this barrel — never from internal files directly.
 */

// Capability definitions
export {
  CAPABILITY_CATEGORIES,
  CAPABILITY_KEYS,
  CAPABILITY_CATEGORY_MAP,
  CAPABILITY_PREFIX_MAP,
  CAPABILITY_CATALOG,
  CapabilityDefinitionSchema,
  isValidCapability,
  getCapabilityCategory,
  getCapabilityPrefix,
  type CapabilityCategory,
  type CapabilityKey,
  type CapabilityDefinition,
} from './capabilities.js'

// Provider definitions
export {
  PROVIDER_KEYS,
  PROVIDER_HEALTH_STATUSES,
  COST_TIERS,
  LATENCY_TIERS,
  ProviderDefinitionSchema,
  ProviderCapabilityMapSchema,
  isValidProvider,
  type ProviderKey,
  type ProviderHealthStatus,
  type CostTier,
  type LatencyTier,
  type ProviderDefinition,
  type ProviderCapabilityMap,
} from './providers.js'

// Job lifecycle
export {
  JOB_STATUSES,
  CreateJobRequestSchema,
  BLOCKED_OVERRIDE_FIELDS,
  hasBlockedOverrides,
  type JobStatus,
  type CreateJobRequest,
  type CreateJobResponse,
  type JobStatusResponse,
} from './jobs.js'

// Artifact types
export {
  ARTIFACT_TYPES,
  ARTIFACT_STATUSES,
  ARTIFACT_MIME_MAP,
  CreateArtifactSchema,
  isValidMimeForType,
  getArtifactTypeFromMime,
  type ArtifactType,
  type ArtifactStatus,
  type CreateArtifactInput,
  type ArtifactRecord,
} from './artifacts.js'

// Auth contracts
export {
  BEARER_TOKEN_PATTERN,
  parseBearerToken,
  APP_CONNECTION_STATUSES,
  type AppAuthResult,
  type AppConnectionStatus,
} from './auth.js'

// Queue configuration
export {
  QUEUE_NAMES,
  JobPayloadSchema,
  WORKER_EVENTS,
  DEFAULT_JOB_OPTIONS,
  type JobPayload,
} from './queue.js'

// Runtime config
export {
  DEFAULT_STORAGE_ROOT,
  STORAGE_SUBDIRS,
  getStorageRoot,
  getRedisUrl,
  getDatabaseUrl,
  API_PORT,
  API_HOST,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  WORKER_CONCURRENCY,
} from './config.js'
