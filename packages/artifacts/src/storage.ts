/**
 * Filesystem storage driver for artifact files.
 *
 * Manages physical file I/O on the local VPS storage directory.
 * All paths are resolved relative to the configured storage root.
 * Includes path-traversal protection and MIME type detection.
 */

import fs from 'fs/promises'
import path from 'path'
import { lookup } from 'mime-types'
import {
  getStorageRoot,
  STORAGE_SUBDIRS,
  type ArtifactType,
} from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoragePutResult {
  storagePath: string
  storageUrl: string
  mimeType: string
  fileSizeBytes: number
}

export interface StorageFileInfo {
  exists: boolean
  sizeBytes: number
  mimeType: string
}

// ── Path Safety ───────────────────────────────────────────────────────────────

function assertInsideBase(basePath: string, key: string): string {
  const base = path.resolve(basePath)
  const resolved = path.resolve(base, key)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Path traversal detected')
  }
  return resolved
}

function encodeStorageKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

// ── Storage Driver ────────────────────────────────────────────────────────────

export class ArtifactStorageDriver {
  private get basePath(): string {
    return getStorageRoot()
  }

  async ensureDirectories(): Promise<void> {
    for (const sub of STORAGE_SUBDIRS) {
      await fs.mkdir(path.join(this.basePath, sub), { recursive: true })
    }
  }

  async put(
    key: string,
    data: Buffer,
    explicitMimeType?: string,
  ): Promise<StoragePutResult> {
    await this.ensureDirectories()
    const filePath = assertInsideBase(this.basePath, key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, data)

    const detectedMime = explicitMimeType || lookup(filePath) || 'application/octet-stream'
    const stat = await fs.stat(filePath)

    return {
      storagePath: key,
      storageUrl: `/api/v1/artifacts/${encodeStorageKey(key)}/file`,
      mimeType: detectedMime,
      fileSizeBytes: stat.size,
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(assertInsideBase(this.basePath, key))
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await fs.unlink(assertInsideBase(this.basePath, key))
      return true
    } catch {
      return false
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(assertInsideBase(this.basePath, key))
      return true
    } catch {
      return false
    }
  }

  async getInfo(key: string): Promise<StorageFileInfo> {
    try {
      const filePath = assertInsideBase(this.basePath, key)
      const stat = await fs.stat(filePath)
      const mimeType = lookup(filePath) || 'application/octet-stream'
      return { exists: true, sizeBytes: stat.size, mimeType }
    } catch {
      return { exists: false, sizeBytes: 0, mimeType: '' }
    }
  }

  buildStorageKey(appSlug: string, type: ArtifactType, filename: string): string {
    const date = new Date().toISOString().slice(0, 10)
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    return `artifacts/${appSlug}/${type}/${date}/${safeFilename}`
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _driver: ArtifactStorageDriver | null = null

export function getArtifactStorage(): ArtifactStorageDriver {
  if (!_driver) _driver = new ArtifactStorageDriver()
  return _driver
}
