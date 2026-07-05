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

export function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY environment variable is required')
  return key
}

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

export function getMimoApiKey(): string {
  const key = process.env.MIMO_API_KEY
  if (!key) throw new Error('MIMO_API_KEY environment variable is required')
  return key
}

export function getDeepinfraApiKey(): string {
  const key = process.env.DEEPINFRA_API_KEY
  if (!key) throw new Error('DEEPINFRA_API_KEY environment variable is required')
  return key
}

// ── Provider Defaults ─────────────────────────────────────────────────────────

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
export const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
export const DEEPINFRA_BASE_URL = 'https://api.deepinfra.com/v1'

export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile'
export const GROQ_STT_MODEL = 'whisper-large-v3'
export const GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english'
export const TOGETHER_DEFAULT_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell-Free'
export const GROQ_TTS_MAX_CHARS = 200

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

// ── Crawlee / Apify ───────────────────────────────────────────────────────────

export const CRAWLEE_MAX_PAGES = Number(process.env.CRAWLEE_MAX_PAGES ?? 5)
export const CRAWLEE_TIMEOUT_MS = Number(process.env.CRAWLEE_TIMEOUT_MS ?? 60_000)

// ── Token Ledger ──────────────────────────────────────────────────────────────

export const TOKEN_COST_MULTIPLIER: Record<string, number> = {
  chat: 1,
  reasoning: 2,
  code: 1,
  image_generation: 5,
  image_edit: 5,
  tts: 3,
  stt: 2,
  video_generation: 20,
  music_generation: 10,
  avatar_generation: 15,
  embeddings: 1,
  reranking: 1,
  research: 2,
  multimodal: 2,
  tool_use: 1,
  structured_output: 1,
  brand_scrape: 3,
  rag_ingest: 2,
  rag_search: 1,
}
