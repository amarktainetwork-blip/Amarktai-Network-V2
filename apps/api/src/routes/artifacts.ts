/**
 * GET /api/v1/artifacts/:id/file — Secure local storage asset serving endpoint.
 *
 * Serves artifact files from the local VPS storage directory.
 * Validates that the artifact exists and is completed before serving.
 */

import type { FastifyInstance } from 'fastify'
import { getArtifactRecord, getArtifactStream, verifyProviderMediaToken } from '@amarktai/artifacts'
import { authenticateArtifactAccess, canAccessArtifact } from '../lib/auth-context.js'

const getProviderArtifactRecord = getArtifactRecord

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/provider-media/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as { expires?: string; signature?: string }
    const expires = Number(query.expires)
    if (!verifyProviderMediaToken({
      artifactId: id,
      expires,
      signature: query.signature ?? '',
      secret: process.env.JWT_SECRET ?? '',
    })) return reply.status(403).send({ error: true, message: 'Provider media token is invalid or expired' })

    const artifact = await getProviderArtifactRecord(id)
    if (!artifact || artifact.status !== 'completed') return reply.status(404).send({ error: true, message: 'Artifact not found' })
    return streamArtifact(request.headers.range, false, id, reply, 'private, no-store')
  })

  app.get('/api/v1/artifacts/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string }

    const auth = await authenticateArtifactAccess(app, request.headers.authorization)
    if (!auth) {
      return reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
    }

    const artifact = await getArtifactRecord(id)
    if (!artifact) {
      return reply.status(404).send({ error: true, message: 'Artifact not found' })
    }

    if (!canAccessArtifact(auth, artifact.appSlug)) {
      return reply.status(404).send({ error: true, message: 'Artifact not found' })
    }

    if (artifact.status !== 'completed') {
      return reply.status(409).send({ error: true, message: 'Artifact is not ready' })
    }

    const query = (request.query ?? {}) as { download?: string }
    return streamArtifact(request.headers.range, query.download === '1', id, reply, 'private, max-age=3600')
  })
}

async function streamArtifact(
  rangeHeader: string | undefined,
  download: boolean,
  artifactId: string,
  reply: import('fastify').FastifyReply,
  cacheControl: string,
) {
  const initial = await getArtifactStream(artifactId).catch(() => null)
  if (!initial) return reply.status(404).send({ error: true, message: 'Artifact file not found' })
  const range = parseRange(rangeHeader, initial.sizeBytes)
  if (rangeHeader && !range) {
    return reply.status(416).header('Content-Range', `bytes */${initial.sizeBytes}`).send()
  }
  if (range && 'destroy' in initial.stream && typeof initial.stream.destroy === 'function') initial.stream.destroy()
  const file = range ? await getArtifactStream(artifactId, range) : initial
  if (!file) return reply.status(404).send({ error: true, message: 'Artifact file not found' })
  const length = range ? range.end - range.start + 1 : file.sizeBytes
  reply
    .status(range ? 206 : 200)
    .header('Content-Type', file.mimeType)
    .header('Content-Length', String(length))
    .header('Accept-Ranges', 'bytes')
    .header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${file.filename}"`)
    .header('Cache-Control', cacheControl)
  if (range) reply.header('Content-Range', `bytes ${range.start}-${range.end}/${file.sizeBytes}`)
  return reply.send(file.stream)
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return null
  const startText = match[1] ?? ''
  const endText = match[2] ?? ''
  if (!startText && !endText) return null
  let start: number
  let end: number
  if (!startText) {
    const suffix = Number(endText)
    if (!Number.isInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Number(endText) : size - 1
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}
