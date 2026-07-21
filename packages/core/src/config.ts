/**
 * Runtime configuration constants — SINGLE SOURCE OF TRUTH.
 *
 * All environment variable reads and configuration defaults
 * are centralized here. No other module reads process.env directly
 * for these values.
 */

// ── Storage ───────────────────────────────────────────────────────────────────

export const DEFAULT_STORAGE_ROOT = '/var/www/amarktai/storage'
export const STORAGE_SUBDIRS = ['artifacts', 'uploads', 'repos', 'workspaces', 'logs'] as const

export function getStorageRoot(): string {
  return process.env.STORAGE_ROOT
    ?? process.env.AMARKTAI_STORAGE_ROOT
    ?? DEFAULT_STORAGE_ROOT
}

// ── Redis ─────────────────────────────────────────────────────────────────────

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
}

// ── Database ──────────────────────────────────────────────────────────────────

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is required')
  return url
}

// ── API ───────────────────────────────────────────────────────────────────────

export const API_PORT = Number(process.env.API_PORT ?? 3001)
export const API_HOST = process.env.API_HOST ?? '0.0.0.0'

// ── Rate Limiting ─────────────────────────────────────────────────────────────

export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100)
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)

// ── Worker ────────────────────────────────────────────────────────────────────

export const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5)

// ── Provider API Keys ─────────────────────────────────────────────────────────

export function getTogetherApiKey(): string {
  const key = process.env.TOGETHER_API_KEY
  if (!key) throw new Error('TOGETHER_API_KEY environment variable is required')
  return key
}

export function getGenxApiKey(): string {
  const key = process.env.GENX_API_KEY
  if (!key) throw new Error('GENX_API_KEY environment variable is required')
  return key
}

export function getGenxBaseUrl(): string {
  return process.env.GENX_BASE_URL ?? 'https://query.genx.sh'
}

export function getDeepinfraApiKey(): string {
  const key = process.env.DEEPINFRA_API_KEY
  if (!key) throw new Error('DEEPINFRA_API_KEY environment variable is required')
  return key
}

// ── Provider Defaults ─────────────────────────────────────────────────────────

export const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
export const DEEPINFRA_BASE_URL = 'https://api.deepinfra.com/v1'
export const DEEPINFRA_OPENAI_BASE_URL = 'https://api.deepinfra.com/v1/openai'

export const DEEPINFRA_DEFAULT_CHAT_MODEL = process.env.DEEPINFRA_DEFAULT_MODEL ?? 'meta-llama/Meta-Llama-3.1-8B-Instruct'
// No unsafe repository fallback is set for Together image generation. Configure
// a serverless-accessible model through the provider defaultModel or env.
export const TOGETHER_DEFAULT_IMAGE_MODEL = ''

export function getTogetherImageModel(): string {
  return process.env.TOGETHER_IMAGE_MODEL?.trim() || TOGETHER_DEFAULT_IMAGE_MODEL
}

// ── JWT Authentication ────────────────────────────────────────────────────────

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return secret
}

export const JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY_SECONDS ?? 86400) // 24h default

// ── Qdrant Vector Database ────────────────────────────────────────────────────

export function getQdrantUrl(): string {
  return process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'
}

export function getQdrantApiKey(): string {
  return process.env.QDRANT_API_KEY ?? ''
}

export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'amarktai_knowledge'
export const TOGETHER_EMBEDDING_MODEL = process.env.TOGETHER_EMBEDDING_MODEL ?? 'togethercomputer/m2-bert-80M-32k-retrieval'
export const EMBEDDING_DIMENSIONS = 768

// ── Search / Controlled Browser ───────────────────────────────────────────────

export function getSearxngUrl(): string {
  return (process.env.SEARXNG_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
}

export const RESEARCH_SEARCH_TIMEOUT_MS = Number(process.env.RESEARCH_SEARCH_TIMEOUT_MS ?? 20_000)
export const RESEARCH_BROWSER_TIMEOUT_MS = Number(process.env.RESEARCH_BROWSER_TIMEOUT_MS ?? 45_000)
export const RESEARCH_ROBOTS_TIMEOUT_MS = Number(process.env.RESEARCH_ROBOTS_TIMEOUT_MS ?? 10_000)
export const RESEARCH_MAX_REDIRECTS = Number(process.env.RESEARCH_MAX_REDIRECTS ?? 5)
export const RESEARCH_MAX_PAGES = Number(process.env.RESEARCH_MAX_PAGES ?? process.env.CRAWLEE_MAX_PAGES ?? 8)
export const RESEARCH_MAX_BYTES_PER_PAGE = Number(process.env.RESEARCH_MAX_BYTES_PER_PAGE ?? 1_500_000)

// Legacy aliases remain while existing deployment environments migrate.
export const CRAWLEE_MAX_PAGES = RESEARCH_MAX_PAGES
export const CRAWLEE_TIMEOUT_MS = RESEARCH_BROWSER_TIMEOUT_MS

// ── Token Ledger ──────────────────────────────────────────────────────────────

export const TOKEN_COST_MULTIPLIER: Record<string, number> = {
  // Language and Agent
  chat: 1,
  streaming_chat: 1,
  reasoning: 2,
  code: 1,
  summarization: 1,
  translation: 1,
  question_answering: 1,
  classification: 1,
  zero_shot_classification: 1,
  extraction: 1,
  token_classification: 1,
  fill_mask: 1,
  feature_extraction: 1,
  sentence_similarity: 1,
  table_qa: 1,
  structured_output: 1,
  tool_use: 1,
  // Image and Vision
  image_generation: 5,
  image_edit: 5,
  image_to_image: 5,
  image_upscale: 5,
  image_classification: 1,
  object_detection: 2,
  image_segmentation: 3,
  depth_estimation: 2,
  keypoint_detection: 2,
  visual_question_answering: 2,
  document_qa: 2,
  ocr: 2,
  zero_shot_object_detection: 2,
  mask_generation: 3,
  visual_document_retrieval: 2,
  // Video, Avatar and 3D
  video_generation: 20,
  image_to_video: 20,
  video_to_video: 25,
  long_form_video: 40,
  video_understanding: 5,
  video_classification: 3,
  storyboard_generation: 5,
  subtitle_generation: 3,
  lip_sync: 10,
  avatar_generation: 15,
  text_to_3d: 15,
  image_to_3d: 15,
  // Audio, Voice and Music
  tts: 3,
  stt: 2,
  voice_clone: 5,
  voice_conversion: 5,
  text_to_audio: 3,
  audio_to_audio: 3,
  audio_classification: 2,
  voice_activity_detection: 1,
  music_generation: 10,
  song_generation: 12,
  // Retrieval, Research and Business
  embeddings: 1,
  reranking: 1,
  rag_ingest: 2,
  rag_search: 1,
  research: 2,
  brand_scrape: 3,
  document_ingest: 2,
  campaign_generation: 5,
  social_content_generation: 5,
  // Governed Adult
  adult_text: 3,
  adult_image: 10,
  adult_voice: 8,
  adult_avatar: 20,
  adult_video: 30,
}
