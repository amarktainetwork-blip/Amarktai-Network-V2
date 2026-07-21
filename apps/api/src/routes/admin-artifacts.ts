import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'

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
