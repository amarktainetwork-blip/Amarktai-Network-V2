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
