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
  CAPABILITY_KINDS,
  COMPOSITE_CAPABILITY_KEYS,
  ATOMIC_CAPABILITY_KEYS,
  type CapabilityKind,
} from './capabilities.js'

// Provider definitions
export {
  PROVIDER_KEYS,
  APPROVED_PROVIDER_DEFINITIONS,
  RUNTIME_EXECUTION_PROVIDERS,
  CODING_ONLY_PROVIDERS,
  REMOVED_PROVIDERS,
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
  ROUTING_MODE_ALIASES,
  normalizeRoutingMode,
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
  getTogetherApiKey,
  getGenxApiKey,
  getGenxBaseUrl,
  getDeepinfraApiKey,
  TOGETHER_BASE_URL,
  DEEPINFRA_BASE_URL,
  DEEPINFRA_OPENAI_BASE_URL,
  DEEPINFRA_DEFAULT_CHAT_MODEL,
  TOGETHER_DEFAULT_IMAGE_MODEL,
  getTogetherImageModel,
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
  isModelRouteCompatible,
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

// Provider-backed executor registrations
export {
  EXECUTOR_REGISTRATIONS,
  getExecutorRegistrations,
  getExecutorRegistration,
  hasExecutorRegistration,
  isExecutorModelCompatible,
  GENERAL_TEXT_CAPABILITY_SET,
  type ExecutorId,
  type ExecutorRegistration,
  type ExecutorCompatibilityProfile,
  type ExecutorModelMetadata,
  type StructuredOutputMode,
  type CapabilityMatchMode,
} from './executor-registry.js'

// Internal runtime executor registrations
export {
  INTERNAL_EXECUTOR_REGISTRATIONS,
  getInternalExecutorRegistration,
  hasInternalExecutorRegistration,
  type InternalExecutorRegistration,
  type InternalExecutionEngine,
  type InternalEvidenceSource,
} from './internal-executor-registry.js'

export {
  resolveStructuredOutputContract,
  structuredResponseFormat,
  downgradeStructuredOutput,
  type StructuredOutputContract,
} from './structured-output.js'
export { operatorMessage } from './operator-messages.js'

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

export {
  SPECIALIST_VISION_CAPABILITIES,
  SPECIALIST_VISION_REQUEST_SCHEMAS,
  SPECIALIST_VISION_RESULT_SCHEMAS,
  DepthEstimationRequestSchema,
  KeypointDetectionRequestSchema,
  MaskGenerationRequestSchema,
  ZeroShotObjectDetectionRequestSchema,
  VisualDocumentRetrievalRequestSchema,
  VideoClassificationRequestSchema,
  inspectImageArtifact,
  inspectDocumentArtifact,
  checksumArtifactBytes,
  validateSpecialistVisionResult,
  type SpecialistVisionCapability,
  type InspectedSourceArtifact,
} from './specialist-vision.js'

export {
  BrandScrapeRequestSchema,
  BrandProfileProposalSchema,
  DocumentIngestRequestSchema,
  CampaignGenerationRequestSchema,
  CampaignPlanSchema,
  WorkflowApprovalSchema,
  chunkDocumentPages,
  durableIdempotencyTrace,
  type DocumentPageText,
  type DocumentChunk,
} from './durable-workflows.js'

// Orchestra routing engine
export {
  ORCHESTRA_ROUTING_MODES,
  EXECUTION_PROFILES,
  evaluateOrchestra,
  checkCandidateEligibility,
  normalizeDbCandidates,
  normalizeDbModelRecords,
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
  APP_ROUTE_POLICY_MODES,
  APP_QUALITY_TARGETS,
  APP_SPEND_STRATEGIES,
  type AppRoutePolicyMode,
  type AppQualityTarget,
  type AppSpendStrategy,
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

// Reusable output quality gates
export {
  QUALITY_DIMENSIONS,
  QUALITY_OUTPUT_TYPES,
  QUALITY_PROFILES,
  HUMAN_REVIEW_STATUSES,
  QUALITY_DECISIONS,
  QualityDimensionScoreSchema,
  QualityCandidateEvidenceSchema,
  QualityPolicySchema,
  createQualityPolicy,
  evaluateQualityCandidate,
  rankQualityCandidates,
  selectQualityWinner,
  type QualityDimension,
  type QualityOutputType,
  type QualityProfile,
  type HumanReviewStatus,
  type QualityDecisionStatus,
  type QualityDimensionScore,
  type QualityCandidateEvidence,
  type QualityPolicy,
  type QualityEvaluationDecision,
  type RankedQualityCandidate,
} from './quality-evaluation.js'

// Canonical runtime truth
export {
  CAPABILITY_RUNTIME_CLASSIFICATIONS,
  CAPABILITY_OPERATIONAL_STATES,
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
  type RuntimeTruthMetrics,
  type CapabilityOperationalState,
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
export * from './long-form-video.js'
export * from './long-form-execution.js'
export * from './long-form-production.js'
export * from './long-form-runtime.js'

// Application capability grant defaults and cost estimation
export * from './app-capability-grants.js'
export * from './cost-estimation.js'

// Webhook security and terminal job delivery contracts
export * from './webhooks.js'

// Output evaluation and orchestration quality gates
export * from './output-evaluation.js'

// Campaign generation contracts
export * from './campaign-generation.js'

// Voice and avatar reusable profile platform
export * from './voice-avatar-platform.js'
export * from './voice-avatar-resources.js'

// Voice clone, conversion, and audio-to-audio contracts
export * from './voice-clone-contracts.js'
export * from './voice-conversion-contracts.js'
export * from './audio-to-audio-contracts.js'

// Effective admin-facing runtime truth projection
export * from './effective-runtime-truth.js'

// Social-ad Product Breakout workflow
export * from './social-ad-video.js'

// Source-artifact governance
export * from './source-artifacts.js'
