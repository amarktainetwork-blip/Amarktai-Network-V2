import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  SPECIALIST_VISION_CAPABILITIES,
  getDashboardAppSlug,
  inspectDocumentArtifact,
  inspectImageArtifact,
  type CapabilityKey,
} from '@amarktai/core'

const AdminSourceArtifactUploadSchema = z.object({
  capability: z.enum(SPECIALIST_VISION_CAPABILITIES),
  title: z.string().trim().min(1).max(500),
  dataBase64: z.string().min(1).max(70_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected canonical base64 data.'),
  declaredMimeType: z.string().trim().min(1).max(200).optional(),
}).strict()

function inspectVideo(bytes: Buffer) {
  if (!bytes.length) throw new Error('Source video is empty.')
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Source video exceeds the maximum file size.')
  if (!bytes.subarray(0, 64).toString('latin1').includes('ftyp')) throw new Error('Source video is not a supported MP4 container.')
  return {
    kind: 'video' as const,
    detectedMimeType: 'video/mp4',
    checksum: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    width: null,
    height: null,
    durationSeconds: null,
    frameRate: null,
    pageCount: null,
  }
}

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (payload?.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

export async function adminArtifactRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/artifacts/source', { bodyLimit: 70_000_000 }, async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const parsed = AdminSourceArtifactUploadSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: true, message: 'Source artifact upload validation failed.', issues: parsed.error.issues })
    const bytes = Buffer.from(parsed.data.dataBase64, 'base64')
    if (!bytes.length) return reply.status(400).send({ error: true, message: 'Source artifact is empty.' })
    const kind = parsed.data.capability === 'video_classification'
      ? 'video'
      : parsed.data.capability === 'visual_document_retrieval'
        ? 'document'
        : 'image'
    try {
      const inspection = kind === 'image'
        ? inspectImageArtifact(bytes)
        : kind === 'document'
          ? inspectDocumentArtifact(bytes)
          : inspectVideo(bytes)
      if (parsed.data.declaredMimeType && parsed.data.declaredMimeType !== inspection.detectedMimeType) {
        return reply.status(415).send({ error: true, message: 'Declared MIME type does not match inspected bytes.' })
      }
      const artifact = await saveArtifact({
        input: {
          appSlug: getDashboardAppSlug(parsed.data.capability as CapabilityKey),
          type: kind,
          subType: 'authorised_source',
          title: parsed.data.title,
          description: 'Admin-uploaded source media for governed Specialist Vision execution.',
          provider: 'user_upload',
          model: 'source-inspection-v1',
          traceId: `trace_source_${randomUUID()}`,
          mimeType: inspection.detectedMimeType,
          metadata: { sourceArtifact: true, inspection, capability: parsed.data.capability, uploadedAt: new Date().toISOString() },
        },
        data: bytes,
        explicitMimeType: inspection.detectedMimeType,
      })
      return reply.status(201).send({ artifactId: artifact.id, kind, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, inspection })
    } catch (error) {
      return reply.status(415).send({ error: true, message: error instanceof Error ? error.message : 'Source artifact inspection failed.' })
    }
  })

  app.get('/api/admin/artifacts', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { capability, provider, limit = '50', offset = '0' } = request.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (capability) where.type = capability
    if (provider) where.provider = provider

    const artifacts = await prisma.artifact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      skip: Number(offset) || 0,
    })

    const total = await prisma.artifact.count({ where })

    return reply.send({
      artifacts: artifacts.map((a) => ({
        id: a.id,
        appSlug: a.appSlug,
        type: a.type,
        subType: a.subType || null,
        title: a.title || null,
        provider: a.provider || null,
        model: a.model || null,
        status: a.status,
        mimeType: a.mimeType || null,
        fileSizeBytes: a.fileSizeBytes || null,
        previewable: a.previewable,
        downloadable: a.downloadable,
        errorMessage: a.errorMessage || null,
        createdAt: a.createdAt?.toISOString(),
      })),
      total,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    })
  })

  app.get('/api/admin/artifacts/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { id } = request.params as { id: string }
    const artifact = await prisma.artifact.findUnique({ where: { id } })
    if (!artifact) return reply.status(404).send({ error: true, message: 'Artifact not found' })
    const metadata = safeJson(artifact.metadata)
    const durationSeconds = positiveNumber(metadata.duration) ?? positiveNumber(metadata.totalDurationSeconds)

    return reply.send({
      id: artifact.id,
      appSlug: artifact.appSlug,
      type: artifact.type,
      subType: artifact.subType || null,
      title: artifact.title || null,
      description: artifact.description || null,
      provider: artifact.provider || null,
      model: artifact.model || null,
      traceId: artifact.traceId || null,
      status: artifact.status,
      mimeType: artifact.mimeType || null,
      fileSizeBytes: artifact.fileSizeBytes || null,
      previewable: artifact.previewable,
      downloadable: artifact.downloadable,
      media: {
        durationSeconds,
        width: positiveNumber(metadata.width),
        height: positiveNumber(metadata.height),
        finalVideoValidated: metadata.finalVideoValidated === true,
        finalAudioValidated: metadata.finalAudioValidated === true,
        voiceoverIncluded: metadata.voiceoverIncluded === true,
        subtitlesIncluded: metadata.subtitlesIncluded === true,
        musicBedIncluded: metadata.musicBedIncluded === true,
      },
      errorMessage: artifact.errorMessage || null,
      createdAt: artifact.createdAt?.toISOString(),
      updatedAt: artifact.updatedAt?.toISOString(),
    })
  })
}

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
