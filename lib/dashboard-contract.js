// Dashboard contract for the V2 frontend. This file defines frontend-facing
// shapes only; it does not prove provider connectivity or perform integration.

export const PROVIDER_CONTRACTS = [
  {
    id: 'genx',
    name: 'GenX',
    tier: 'core',
    status: 'active',
    description: 'Primary video, avatar, and multimodal deployment pathway.',
    keyField: 'genx_key',
    envKey: 'GENX_API_KEY',
  },
  {
    id: 'groq',
    name: 'Groq',
    tier: 'core',
    status: 'active',
    description: 'Low-latency language, speech-to-text, and text-to-speech pathway.',
    keyField: 'groq_key',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'together',
    name: 'Together AI',
    tier: 'core',
    status: 'active',
    description: 'Open-model image, embedding, and RAG support pathway.',
    keyField: 'together_key',
    envKey: 'TOGETHER_API_KEY',
  },
  {
    id: 'mimo',
    name: 'MiMo',
    tier: 'core',
    status: 'active',
    description: 'Final coding and reasoning provider for dashboard routing.',
    keyField: 'mimo_key',
    envKey: 'MIMO_API_KEY',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    tier: 'core',
    status: 'active',
    description: 'Final infrastructure provider for text, vision, speech, and embeddings.',
    keyField: 'deepinfra_key',
    envKey: 'DEEPINFRA_API_KEY',
  },
]

export const DASHBOARD_PAGES = [
  { id: 'command-center', href: '/dashboard/command-center', label: 'Command Center', icon: 'LayoutDashboard' },
  { id: 'studio', href: '/dashboard/studio', label: 'Studio', icon: 'FlaskConical' },
  { id: 'capabilities', href: '/dashboard/capabilities', label: 'Capabilities', icon: 'Boxes' },
  { id: 'jobs', href: '/dashboard/jobs', label: 'Jobs & Artifacts', icon: 'Activity' },
  { id: 'app-gateway', href: '/dashboard/app-gateway', label: 'App Gateway', icon: 'Plug' },
  { id: 'providers', href: '/dashboard/providers', label: 'Providers & Models', icon: 'Cpu' },
  { id: 'agents', href: '/dashboard/agents', label: 'Agents & Learning', icon: 'Bot' },
  { id: 'settings', href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
]

export const CAPABILITY_CONTRACTS = [
  { key: 'chat', label: 'Chat / Text', category: 'Language' },
  { key: 'reasoning', label: 'Reasoning', category: 'Language' },
  { key: 'code', label: 'Code Generation', category: 'Language' },
  { key: 'image_generation', label: 'Image Generation', category: 'Vision' },
  { key: 'image_edit', label: 'Image Edit', category: 'Vision' },
  { key: 'tts', label: 'Voice - TTS', category: 'Audio' },
  { key: 'stt', label: 'Voice - STT', category: 'Audio' },
  { key: 'video_generation', label: 'Video Generation', category: 'Motion' },
  { key: 'music_generation', label: 'Music / Song', category: 'Audio' },
  { key: 'avatar_generation', label: 'Avatar', category: 'Vision' },
  { key: 'embeddings', label: 'Embeddings', category: 'Knowledge' },
  { key: 'reranking', label: 'Reranking', category: 'Knowledge' },
  { key: 'research', label: 'Research', category: 'Intelligence' },
  { key: 'multimodal', label: 'Multimodal', category: 'Language' },
  { key: 'tool_use', label: 'Tool Use', category: 'Language' },
  { key: 'structured_output', label: 'Structured Output', category: 'Language' },
  { key: 'brand_scrape', label: 'Scrape / Brand', category: 'Intelligence' },
  { key: 'rag_ingest', label: 'RAG - Ingest', category: 'Knowledge' },
  { key: 'rag_search', label: 'RAG - Search', category: 'Knowledge' },
]

export const STUDIO_MODES = [
  { id: 'chat', label: 'Chat', dashboardType: 'text.chat', defaultProvider: 'groq' },
  { id: 'image', label: 'Image', dashboardType: 'image.generate', defaultProvider: 'together' },
  { id: 'image-edit', label: 'Image Edit', dashboardType: 'image.edit', defaultProvider: 'together' },
  { id: 'video', label: 'Video', dashboardType: 'video.generate', defaultProvider: 'genx' },
  { id: 'longvideo', label: 'Long-form Video', dashboardType: 'video.longform', defaultProvider: 'genx' },
  { id: 'music', label: 'Music', dashboardType: 'music.generate', defaultProvider: 'genx' },
  { id: 'voice-tts', label: 'Voice TTS', dashboardType: 'voice.tts', defaultProvider: 'groq' },
  { id: 'voice-stt', label: 'Voice STT', dashboardType: 'voice.stt', defaultProvider: 'groq' },
  { id: 'avatar', label: 'Avatar', dashboardType: 'avatar.generate', defaultProvider: 'genx' },
  { id: 'scrape', label: 'Scrape', dashboardType: 'scrape.crawl', defaultProvider: 'local_tool' },
  { id: 'rag-ingest', label: 'RAG Ingest', dashboardType: 'rag.ingest', defaultProvider: 'together' },
  { id: 'rag-query', label: 'RAG Query', dashboardType: 'rag.query', defaultProvider: 'together' },
  { id: 'reasoning', label: 'Reasoning', dashboardType: 'text.reasoning', defaultProvider: 'mimo' },
  { id: 'code', label: 'Code', dashboardType: 'text.code', defaultProvider: 'mimo' },
]

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
