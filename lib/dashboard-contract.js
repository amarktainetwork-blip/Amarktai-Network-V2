// Dashboard contract for the V2 frontend. This file defines frontend-facing
// shapes only; it does not prove provider connectivity or perform integration.

import { TARGET_CAPABILITY_CATALOG } from './capability-display-catalog.js'

export const PROVIDER_CONTRACTS = [
  {
    id: 'genx',
    name: 'GenX',
    tier: 'core',
    status: 'backend_pending',
    proofStatus: 'not_live_proven',
    finalProvider: true,
    description: 'Primary video, avatar, and multimodal deployment pathway.',
    role: 'video_avatar_multimodal',
    keyField: 'genx_key',
    envKey: 'GENX_API_KEY',
  },
  {
    id: 'groq',
    name: 'Groq',
    tier: 'core',
    status: 'backend_pending',
    proofStatus: 'not_live_proven',
    finalProvider: true,
    description: 'Low-latency language, speech-to-text, and text-to-speech pathway.',
    role: 'low_latency_text_voice',
    keyField: 'groq_key',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'together',
    name: 'Together AI',
    tier: 'core',
    status: 'backend_pending',
    proofStatus: 'not_live_proven',
    finalProvider: true,
    description: 'Open-model image, embedding, and RAG support pathway.',
    role: 'image_embeddings_rag',
    keyField: 'together_key',
    envKey: 'TOGETHER_API_KEY',
  },
  {
    id: 'mimo',
    name: 'MiMo',
    tier: 'core',
    status: 'runtime_disabled',
    proofStatus: 'not_live_proven',
    finalProvider: true,
    description: 'Final approved provider kept configurable, but backend runtime is disabled for current coding-tools-only credentials.',
    role: 'coding_reasoning',
    integrationType: 'coding_tool',
    runtimeUse: 'coding_tools_only',
    backendRuntimeAllowed: false,
    workerRuntimeAllowed: false,
    fallbackEligible: false,
    browserExposureAllowed: false,
    requiresServerSideTerminal: true,
    credentialUsagePolicy: 'coding_tools_only',
    keyField: 'mimo_key',
    envKey: 'MIMO_API_KEY',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    tier: 'core',
    status: 'backend_text_fallback',
    proofStatus: 'live_testable_not_capability_proof',
    finalProvider: true,
    description: 'Final backend-controlled text fallback provider; live health does not prove new capabilities.',
    role: 'backend_text_fallback',
    keyField: 'deepinfra_key',
    envKey: 'DEEPINFRA_API_KEY',
  },
]

export const DASHBOARD_PAGES = [
  { id: 'studio', href: '/dashboard/studio', label: 'Studio', icon: 'FlaskConical' },
  { id: 'agents', href: '/dashboard/agents', label: 'Agents & Learning', icon: 'Bot' },
  { id: 'app-gateway', href: '/dashboard/app-gateway', label: 'Apps', icon: 'Plug' },
  { id: 'brand-library', href: '/dashboard/brand-library', label: 'Brand Library', icon: 'Palette' },
  { id: 'jobs', href: '/dashboard/jobs', label: 'Work Library', icon: 'Activity' },
  { id: 'artifacts', href: '/dashboard/artifacts', label: 'Artifacts', icon: 'Package' },
  { id: 'operations-center', href: '/dashboard/operations-center', label: 'Operations', icon: 'Activity' },
  { id: 'capabilities', href: '/dashboard/capabilities', label: 'Capabilities', icon: 'Boxes' },
  { id: 'settings', href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
]

export const CAPABILITY_CONTRACTS = TARGET_CAPABILITY_CATALOG.map((capability) => ({
  key: capability.key,
  label: capability.label,
  category: capability.family,
  description: capability.description,
  outputType: capability.outputType,
  artifactRequired: capability.artifactRequired,
  policyRequirement: capability.policyRequirement,
}))

export const STUDIO_MODES = TARGET_CAPABILITY_CATALOG.map((capability) => ({
  id: capability.studioMode,
  label: capability.label,
  dashboardType: capability.dashboardType,
  routing: 'runtime_selected',
  outputType: capability.outputType,
  artifactRequired: capability.artifactRequired,
  gated: capability.policyRequirement !== 'standard',
  disabled: true,
}))

export const APP_CONNECTION_FIELDS = [
  'id',
  'appSlug',
  'appName',
  'environment',
  'status',
  'webhookUrl',
  'apiKeys',
  'tokenBalance',
  'dailyBudget',
  'capabilities',
  'createdAt',
]

export const AGENT_FIELDS = [
  'id',
  'name',
  'description',
  'status',
  'appSlug',
  'knowledge',
  'tasks',
  'avatar',
  'capabilities',
  'brandVault',
  'crossAppAccess',
  'createdAt',
  'lastActive',
]

export const JOB_DISPLAY_FIELDS = [
  'id',
  'capability',
  'status',
  'createdAt',
  'updatedAt',
  'duration',
  'progress',
  'artifactId',
  'provider',
  'error',
]

export const ARTIFACT_DISPLAY_FIELDS = [
  'id',
  'jobId',
  'capability',
  'type',
  'kind',
  'name',
  'format',
  'mime',
  'size',
  'sizeBytes',
  'retrievalPath',
  'createdAt',
]

export const SETTINGS_SECTIONS = [
  { id: 'provider_keys', label: 'Provider API Keys', fields: PROVIDER_CONTRACTS.map((p) => p.keyField) },
  { id: 'model_defaults', label: 'Model Defaults', fields: ['default_text_model', 'default_image_model'] },
  { id: 'open_source_tools', label: 'Open-Source Tools', fields: ['ffmpeg', 'sharp', 'piper_tts', 'redis', 'qdrant', 'playwright_crawler', 'minio_storage', 'smtp', 'bullmq'] },
  { id: 'storage', label: 'Storage Configuration', fields: ['local_storage_path', 'minio_endpoint', 'minio_access_key', 'minio_secret_key'] },
  { id: 'worker', label: 'Worker Settings', fields: ['worker_concurrency', 'rate_limit_max', 'rate_limit_window'] },
  { id: 'webhooks', label: 'Webhooks', fields: ['webhook_url', 'webhook_secret'] },
  { id: 'security', label: 'Security Settings', fields: ['cors_origins', 'asset_retention_days'] },
]

export const OPEN_SOURCE_TOOLS = [
  { id: 'ffmpeg', name: 'FFmpeg', category: 'media' },
  { id: 'sharp', name: 'Sharp', category: 'image' },
  { id: 'piper_tts', name: 'Piper', category: 'speech' },
  { id: 'redis', name: 'Redis', category: 'queue-cache' },
  { id: 'qdrant', name: 'Qdrant', category: 'vector-store' },
  { id: 'playwright_crawler', name: 'Playwright/local crawler', category: 'crawler' },
  { id: 'minio_storage', name: 'MinIO/local storage', category: 'storage' },
  { id: 'smtp', name: 'SMTP', category: 'email' },
  { id: 'bullmq', name: 'BullMQ', category: 'queue' },
]
