/**
 * Artifact types and validation — SINGLE SOURCE OF TRUTH.
 *
 * All artifact type definitions, MIME validation, and storage contracts
 * are declared here. The worker, artifact package, and API all import
 * from this module.
 */

import { z } from 'zod'

// ── Artifact Types ────────────────────────────────────────────────────────────

export const ARTIFACT_TYPES = [
  'image',
  'audio',
  'music',
  'video',
  'code',
  'document',
  'report',
  'transcript',
] as const

export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

// ── Artifact Statuses ─────────────────────────────────────────────────────────

export const ARTIFACT_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'expired',
] as const

export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number]

// ── Artifact Creation Input ───────────────────────────────────────────────────

export const CreateArtifactSchema = z.object({
  appSlug: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES),
  subType: z.string().default(''),
  title: z.string().default(''),
  description: z.string().default(''),
  provider: z.string().default(''),
  model: z.string().default(''),
  traceId: z.string().default(''),
  mimeType: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type CreateArtifactInput = z.infer<typeof CreateArtifactSchema>

// ── Artifact Record (matches Prisma Artifact model) ──────────────────────────

export interface ArtifactRecord {
  id: string
  appSlug: string
  type: string
  subType: string
  title: string
  description: string
  provider: string
  model: string
  traceId: string
  storageDriver: string
  storagePath: string
  storageUrl: string
  mimeType: string
  fileSizeBytes: number
  previewable: boolean
  downloadable: boolean
  status: string
  errorMessage: string
  costUsdCents: number
  metadata: string
  createdAt: Date
  updatedAt: Date
}

// ── MIME Type Validation Map ──────────────────────────────────────────────────

export const ARTIFACT_MIME_MAP: Record<ArtifactType, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'],
  music: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  code: ['text/plain', 'application/json', 'text/javascript', 'text/typescript', 'text/html', 'text/css'],
  document: ['application/pdf', 'text/plain', 'text/markdown', 'application/json'],
  report: ['application/pdf', 'text/plain', 'text/markdown'],
  transcript: ['text/plain', 'application/json', 'text/vtt'],
}

export function isValidMimeForType(type: ArtifactType, mimeType: string): boolean {
  const allowed = ARTIFACT_MIME_MAP[type]
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(mimeType)
}

export function getArtifactTypeFromMime(mimeType: string): ArtifactType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'document'
  return 'document'
}
