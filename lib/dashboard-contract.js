// Dashboard contract for the V2 frontend. This file defines frontend-facing
// shapes only; it does not prove provider connectivity or perform integration.

import { TARGET_CAPABILITY_CATALOG } from './capability-catalog.js'
import { APPROVED_PROVIDER_DEFINITIONS } from '../packages/core/src/providers.ts'

export const PROVIDER_CONTRACTS = APPROVED_PROVIDER_DEFINITIONS.map((provider) => ({
  id: provider.key,
  name: provider.displayName,
  tier: 'core',
  status: provider.codingOnly ? 'runtime_disabled' : 'runtime_policy_allowed',
  proofStatus: 'not_live_proven',
  finalProvider: true,
  description: provider.codingOnly
    ? 'Approved coding-agent-only provider; backend runtime execution remains disabled.'
    : `Approved ${provider.runtimeRole.replaceAll('_', ' ')} provider; live state comes from canonical runtime truth.`,
  role: provider.runtimeRole,
  runtimeUse: provider.codingOnly ? 'coding_tools_only' : 'backend_runtime_allowed',
  backendRuntimeAllowed: provider.backendExecutionAllowed,
  workerRuntimeAllowed: provider.backendExecutionAllowed,
  fallbackEligible: provider.backendExecutionAllowed,
  browserExposureAllowed: false,
  credentialUsagePolicy: provider.codingOnly ? 'coding_tools_only' : 'backend_runtime_allowed',
  keyField: `${provider.key}_key`,
  envKey: provider.credentialEnvKey,
}))

export const DASHBOARD_PAGES = [
  { id: 'overview', href: '/dashboard', label: 'Overview', icon: 'Activity' },
  { id: 'apps', href: '/dashboard/app-gateway', label: 'Apps', icon: 'Plug' },
  { id: 'capabilities', href: '/dashboard/capabilities', label: 'Capabilities', icon: 'Boxes' },
  { id: 'models', href: '/dashboard/models', label: 'Models', icon: 'Cpu' },
  { id: 'voices', href: '/dashboard/voices', label: 'Voices', icon: 'Mic' },
  { id: 'studio', href: '/dashboard/studio', label: 'Studio', icon: 'FlaskConical' },
  { id: 'full-song', href: '/dashboard/song', label: 'Full Song Studio', icon: 'Music' },
  { id: 'premium-advert', href: '/dashboard/premium-advert', label: 'Premium Advert', icon: 'Film' },
  { id: 'social-ad', href: '/dashboard/social-ad', label: 'Product Breakout', icon: 'Film' },
  { id: 'jobs', href: '/dashboard/jobs', label: 'Jobs & Workflows', icon: 'Activity' },
  { id: 'artifacts', href: '/dashboard/artifacts', label: 'Artifacts', icon: 'Package' },
  { id: 'agents', href: '/dashboard/agents', label: 'Agents & Knowledge', icon: 'Bot' },
  { id: 'proofs', href: '/dashboard/proof-runner', label: 'Proofs', icon: 'FlaskConical' },
  { id: 'providers', href: '/dashboard/providers', label: 'Providers', icon: 'Plug' },
  { id: 'monitoring', href: '/dashboard/monitoring', label: 'Monitoring', icon: 'Activity' },
  { id: 'settings', href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
]

export const ADVANCED_PAGES = [
  { id: 'model-lab', href: '/dashboard/model-lab', label: 'Model Lab', icon: 'Cpu' },
  { id: 'developer', href: '/dashboard/developer', label: 'Developer / API', icon: 'FlaskConical' },
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
  'id', 'appSlug', 'appName', 'environment', 'status', 'webhookUrl', 'apiKeys',
  'tokenBalance', 'dailyBudget', 'capabilities', 'createdAt',
]

export const AGENT_FIELDS = [
  'id', 'name', 'description', 'status', 'appSlug', 'knowledge', 'tasks', 'avatar',
  'capabilities', 'brandVault', 'crossAppAccess', 'createdAt', 'lastActive',
]

export const JOB_DISPLAY_FIELDS = [
  'id', 'capability', 'status', 'createdAt', 'updatedAt', 'duration', 'progress',
  'artifactId', 'provider', 'error',
]

export const ARTIFACT_DISPLAY_FIELDS = [
  'id', 'jobId', 'capability', 'type', 'kind', 'name', 'format', 'mime', 'size',
  'sizeBytes', 'retrievalPath', 'createdAt',
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
