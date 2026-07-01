/**
 * Artifact manager — orchestrates artifact creation, storage, and DB persistence.
 *
 * Bridges the storage driver (filesystem) and the database (Prisma Artifact table).
 * Worker processors call this to save generated outputs and register them as artifacts.
 */

import { prisma } from '@amarktai/db'
import { getArtifactStorage } from './storage.js'
import {
  isValidMimeForType,
  type ArtifactType,
  type CreateArtifactInput,
} from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SaveArtifactOptions {
  input: CreateArtifactInput
  data: Buffer
  explicitMimeType?: string
}

export interface SavedArtifact {
  id: string
  storagePath: string
  storageUrl: string
  mimeType: string
  fileSizeBytes: number
}

// ── Save Artifact ─────────────────────────────────────────────────────────────

export async function saveArtifact(opts: SaveArtifactOptions): Promise<SavedArtifact> {
  const { input, data, explicitMimeType } = opts
  const storage = getArtifactStorage()

  // Build storage key
  const ext = getExtension(explicitMimeType || 'application/octet-stream')
  const filename = `${input.appSlug}_${Date.now()}${ext}`
  const storageKey = storage.buildStorageKey(input.appSlug, input.type as ArtifactType, filename)

  // Write to filesystem
  const result = await storage.put(storageKey, data, explicitMimeType)

  // Validate MIME against artifact type
  const finalMime = result.mimeType
  if (!isValidMimeForType(input.type as ArtifactType, finalMime)) {
    // Log warning but don't fail — accept whatever was generated
    console.warn(
      `[artifacts] MIME ${finalMime} is not standard for type ${input.type}, accepting anyway`,
    )
  }

  // Write to database
  const artifact = await prisma.artifact.create({
    data: {
      appSlug: input.appSlug,
      type: input.type,
      subType: input.subType,
      title: input.title,
      description: input.description,
      provider: input.provider,
      model: input.model,
      traceId: input.traceId,
      storageDriver: 'local_vps',
      storagePath: result.storagePath,
      storageUrl: result.storageUrl,
      mimeType: finalMime,
      fileSizeBytes: result.fileSizeBytes,
      previewable: isPreviewable(finalMime),
      downloadable: true,
      status: 'completed',
      metadata: JSON.stringify(input.metadata),
    },
  })

  return {
    id: artifact.id,
    storagePath: artifact.storagePath,
    storageUrl: artifact.storageUrl,
    mimeType: artifact.mimeType,
    fileSizeBytes: artifact.fileSizeBytes,
  }
}

// ── Get Artifact File ─────────────────────────────────────────────────────────

export async function getArtifactFile(artifactId: string): Promise<{
  buffer: Buffer
  mimeType: string
  filename: string
} | null> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } })
  if (!artifact || artifact.status !== 'completed') return null

  const storage = getArtifactStorage()
  const buffer = await storage.get(artifact.storagePath)
  if (!buffer) return null

  const filename = artifact.storagePath.split('/').pop() ?? 'artifact'
  return { buffer, mimeType: artifact.mimeType, filename }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/json': '.json',
    'text/javascript': '.js',
    'text/html': '.html',
  }
  return map[mimeType] ?? '.bin'
}

function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  )
}
