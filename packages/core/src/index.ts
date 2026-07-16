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
  CAPABILITY_BY_KEY,
  CAPABILITY_FIELD_MAP,
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
  APPROVED_PROVIDER_DEFINITIONS,
  RUNTIME_EXECUTION_PROVIDERS,
  CODING_ONLY_PROVIDERS,
  PROVIDER_HEALTH_STATUSES,
  PROVIDER_ENV_VARS,
  CREDENTIAL_USAGE_POLICIES,
  COST_TIERS,
  LATENCY_TIERS,
  ProviderDefinitionSchema,
  ProviderCapabilityMapSchema,
  isValidProvider,
  getProviderEnvVar,
  getProviderDefinition,
  getProviderDefaultBaseUrl,
  type ApprovedProviderDefinition,
  type RuntimeExecutionProvider,
  type ProviderKey,
  type ProviderHealthStatus,
  type CredentialUsagePolicy,
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
  SAFE_ROUTING_FIELDS,
  VALID_ROUTING_MODES,
  isValidRoutingMode,
  extractRoutingMode,
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
  hashAppApiKey,
  APP_CONNECTION_STATUSES,
  type AppAuthResult,
  type AppConnectionStatus,
} from './auth.js'

// Queue configuration
export {
  QUEUE_NAMES,
  JobPayloadSchema,
  AppCapabilityGrantSnapshotSchema,
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
  getGroqApiKey,
  getTogetherApiKey,
  getGenxApiKey,
  getGenxBaseUrl,
  getDeepinfraApiKey,
  GROQ_BASE_URL,
  TOGETHER_BASE_URL,
  DEEPINFRA_BASE_URL,
  DEEPINFRA_OPENAI_BASE_URL,
  GROQ_DEFAULT_MODEL,
  DEEPINFRA_DEFAULT_CHAT_MODEL,
  GROQ_STT_MODEL,
  GROQ_TTS_MODEL,
  TOGETHER_DEFAULT_IMAGE_MODEL,
  getTogetherImageModel,
  GROQ_TTS_MAX_CHARS,
  getJwtSecret,
  JWT_EXPIRY_SECONDS,
  getQdrantUrl,
  getQdrantApiKey,
  QDRANT_COLLECTION,
  TOGETHER_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  CRAWLEE_MAX_PAGES,
  CRAWLEE_TIMEOUT_MS,
  TOKEN_COST_MULTIPLIER,
} from './config.js'

// Model catalogue
export {
  MODEL_STATUSES,
  QUALITY_TIERS,
  MODEL_LATENCY_TIERS,
  MODEL_COST_TIERS,
  MODEL_CATALOGUE,
  STATIC_MODEL_CATALOGUE,
  DISCOVERED_PROVIDER_MODELS,
  getModelsByProvider,
  getModelsByCapability,
  getExecutableModels,
  getPlannedModels,
  getBlockedModels,
  getModelRecord,
  type ModelStatus,
  type QualityTier,
  type ModelLatencyTier,
  type ModelCostTier,
  type ModelRecord,
} from './model-catalog.js'

// Provider model discovery
export {
  MODEL_DISCOVERY_SOURCES,
  PROVIDER_DISCOVERY_MODES,
  STATIC_DISCOVERY_TIMESTAMP,
  createDiscoveredModel,
  inferCapabilitiesFromModelId,
  modalitiesForCapabilities,
  buildCapabilityReadiness,
  isCapabilityKey,
  isProviderKey,
  type ProviderDiscoveredModel,
  type ProviderDiscoveryResult,
  type DiscoveredCapability,
  type CapabilityExecutionReadiness,
  type ModelDiscoverySource,
  type ProviderDiscoveryMode,
  type TransportProfile,
} from './provider-model-discovery.js'

// Executor registrations
export {
  EXECUTOR_REGISTRATIONS,
  getExecutorRegistrations,
  getExecutorRegistration,
  hasExecutorRegistration,
  isExecutorModelCompatible,
  type ExecutorId,
  type ExecutorRegistration,
  type ExecutorCompatibilityProfile,
  type ExecutorModelMetadata,
} from './executor-registry.js'

// Direct provider capability contracts and normalized execution evidence
export {
  DIRECT_PROVIDER_CAPABILITIES,
  DIRECT_PROVIDER_REQUEST_SCHEMAS,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  ChatMessageSchema,
  isDirectProviderCapability,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
  createCanonicalProviderUsage,
  type DirectProviderCapability,
  type DirectProviderRequestValidation,
  type CanonicalProviderUsage,
  type JsonSchemaValidationResult,
} from './direct-provider-contracts.js'

// Orchestra routing engine
export {
  ORCHESTRA_ROUTING_MODES,
  EXECUTION_PROFILES,
  evaluateOrchestra,
  checkCandidateEligibility,
  normalizeDbCandidates,
  executorModelMetadataFromDbRecord,
  validateOrchestraRequest,
  ORCHESTRA_BLOCKED_REQUEST_FIELDS,
  HEALTHY_PROVIDER_STATUSES,
  BLOCKED_PROVIDER_STATUSES,
  CODING_TOOL_CAPABILITIES,
  type OrchestraRoutingMode,
  type ExecutionProfile,
  type OrchestraRequest,
  type OrchestraCandidate,
  type OrchestraDecision,
  type OrchestraFallbackRoute,
  type ScoringWeights,
  type DbModelRecord,
  type DbProviderRecord,
  type RuntimeInfrastructureEvidence,
  type AppCapabilityGrantContext,
} from './orchestra.js'

// Budget policy
export {
  PUBLIC_BUDGET_POLICIES,
  QUALITY_FLOORS,
  mapBudgetPolicyToRoutingMode,
  getMixPolicyStepMode,
  checkBudgetConstraints,
  meetsQualityFloor,
  type PublicBudgetPolicy,
  type QualityFloor,
  type BudgetCheckResult,
} from './budget-policy.js'

// Canonical runtime truth
export {
  CAPABILITY_RUNTIME_CLASSIFICATIONS,
  getProviderRuntimeTruth,
  getCapabilityRuntimeTruth,
  getRuntimeTruth,
  type CapabilityRuntimeClassification,
  type ProviderRuntimeStateInput,
  type CapabilityRuntimeStateInput,
  type LongFormComponentRuntimeState,
  type RuntimeTruthInput,
  type ProviderRuntimeTruth,
  type CapabilityRuntimeTruth,
  type RuntimeTruth,
} from './runtime-truth.js'

// Provider credential security
export {
  getProviderKeyEncryptionSecret,
  encryptProviderKey,
  decryptProviderKey,
  maskProviderKey,
  isEncryptedProviderKey,
} from './provider-key-security.js'

// Long-form video orchestration
export {
  LongFormVideoRequestSchema,
  LongFormVideoPlanSchema,
  LongFormSceneSchema,
  LongFormStoryboardSchema,
  LongFormRenderStepSchema,
  LongFormVideoArtifactPlanSchema,
  LongFormVideoSafetyLevel,
  LongFormVideoAspectRatio,
  LongFormVideoStyle,
  LongFormVideoTone,
  LongFormSceneStatus,
  LongFormRenderStepType,
  LongFormRenderStatus,
  validateLongFormVideoRequest,
  validateLongFormVideoPlan,
  type LongFormVideoRequest,
  type LongFormVideoPlan,
  type LongFormScene,
  type LongFormStoryboard,
  type LongFormRenderStep,
  type LongFormVideoArtifactPlan,
} from './long-form-video.js'

export {
  createLongFormVideoPlan,
} from './long-form-planner.js'

export {
  DURABLE_WORKFLOW_REGISTRATIONS,
  buildSceneVideoPrompt,
  createSceneExecutionPayloads,
  createLongFormExecutionState,
  updateSceneExecutionState,
  calculateLongFormProgress,
  getExecutionSummary,
  type SceneExecutionPayload,
  type SceneExecutionState,
  type LongFormExecutionState,
  type LongFormAssemblyHandoff,
} from './long-form-execution.js'

export {
  getReleaseCandidateCapabilityKeys,
  getDashboardAppSlug,
  getInternalDashboardApps,
  canReadSourceArtifactForApp,
  type InternalDashboardAppDefinition,
} from './dashboard-apps.js'

// Music generation foundation
export {
  MUSIC_STYLES,
  MUSIC_DURATION_LIMITS,
  MUSIC_OUTPUT_FORMATS,
  MUSIC_SAFETY_LEVELS,
  MUSIC_RIGHTS_BASES,
  MUSIC_FEATURE_CLASSIFICATIONS,
  GENX_LYRIA_REQUEST_CONTRACT,
  MAX_REFERENCE_AUDIO_BYTES,
  MAX_REFERENCE_AUDIO_DURATION_SECONDS,
  MusicGenerationRequestSchema,
  MusicReferenceRightsDeclarationSchema,
  MusicReferenceUploadRequestSchema,
  validateMusicGenerationRequest,
  validateMusicReferenceUploadRequest,
  normalizeMusicPrompt,
  createMusicProviderPrompt,
  inspirationProfileToPrompt,
  analyzeMusicReferenceAudio,
  createLongFormMusicRequest,
  createMusicGenerationPlan,
  getMusicCapabilityStatus,
  type MusicStyle,
  type MusicDuration,
  type MusicOutputFormat,
  type MusicSafetyLevel,
  type MusicRightsBasis,
  type MusicFeatureClassification,
  type MusicGenerationRequest,
  type MusicReferenceUploadRequest,
  type MusicInspirationProfile,
  type MusicPromptNormalization,
  type MusicCapabilityStatus,
  type MusicGenerationPlan,
  type MusicGenerationResult,
} from './music-generation.js'

// Subtitle generation
export {
  generateSubtitles,
  buildSubtitleSegments,
  generateSrt,
  generateVtt,
  getSubtitleMimeType,
  type SubtitleSegment,
  type SubtitleGenerationInput,
} from './subtitle-generation.js'
