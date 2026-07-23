import type { FastifyInstance } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { saveArtifact } from '@amarktai/artifacts'
import { inspectDocumentArtifact, inspectImageArtifact } from '@amarktai/core'
import { z } from 'zod'
import { authenticateAppKey } from './jobs.js'

const SourceArtifactUploadSchema = z.object({
  title: z.string().trim().min(1).max(500),
  kind: z.enum(['image', 'video', 'document']),
  dataBase64: z.string().min(1).max(70_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected canonical base64 data.'),
  declaredMimeType: z.string().trim().min(1).max(200).optional(),
}).strict()

function inspectVideo(bytes: Buffer) {
  if (!bytes.length) throw new Error('Source video is empty.')
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Source video exceeds the maximum file size.')
  const header = bytes.subarray(0, 64).toString('latin1')
  if (!header.includes('ftyp')) throw new Error('Source video is not a supported MP4 container.')
  return { detectedMimeType: 'video/mp4', checksum: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
}

export async function appSourceArtifactRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/source-artifacts', { bodyLimit: 70_000_000 }, async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const parsed = SourceArtifactUploadSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_SOURCE_ARTIFACT', message: 'Source artifact upload validation failed.', issues: parsed.error.issues })
    let bytes: Buffer
    try { bytes = Buffer.from(parsed.data.dataBase64, 'base64') } catch { return reply.status(400).send({ error: true, code: 'INVALID_SOURCE_ARTIFACT_BASE64', message: 'Source artifact data is not valid base64.' }) }
    if (!bytes.length) return reply.status(400).send({ error: true, code: 'EMPTY_SOURCE_ARTIFACT', message: 'Source artifact is empty.' })
    try {
      const inspection = parsed.data.kind === 'image'
        ? inspectImageArtifact(bytes)
        : parsed.data.kind === 'document'
          ? inspectDocumentArtifact(bytes)
          : inspectVideo(bytes)
      if (parsed.data.declaredMimeType && parsed.data.declaredMimeType !== inspection.detectedMimeType) {
        return reply.status(415).send({ error: true, code: 'SOURCE_MIME_MISMATCH', message: 'Declared MIME type does not match inspected bytes.' })
      }
      const artifact = await saveArtifact({
        input: {
          appSlug: auth.app!.slug,
          type: parsed.data.kind,
          subType: 'authorised_source',
          title: parsed.data.title,
          description: 'Application-owned source media uploaded through the governed artifact route.',
          provider: 'user_upload',
          model: 'source-inspection-v1',
          traceId: `trace_source_${randomUUID()}`,
          mimeType: inspection.detectedMimeType,
          metadata: { sourceArtifact: true, inspection, declaredMimeType: parsed.data.declaredMimeType ?? null, uploadedAt: new Date().toISOString() },
        },
        data: bytes,
        explicitMimeType: inspection.detectedMimeType,
      })
      return reply.status(201).send({ artifactId: artifact.id, kind: parsed.data.kind, mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, inspection, fileUrl: `/api/v1/artifacts/${artifact.id}/file` })
    } catch (error) {
      return reply.status(415).send({ error: true, code: 'UNSUPPORTED_SOURCE_ARTIFACT', message: error instanceof Error ? error.message : 'Source artifact inspection failed.' })
    }
  })
}
