/**
 * GET /api/v1/artifacts/:id/file — Secure local storage asset serving endpoint.
 *
 * Serves artifact files from the local VPS storage directory.
 * Validates that the artifact exists and is completed before serving.
 */

import type { FastifyInstance } from 'fastify'
import { getArtifactFile } from '@amarktai/artifacts'

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/artifacts/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string }

    const file = await getArtifactFile(id)
    if (!file) {
      return reply.status(404).send({ error: true, message: 'Artifact not found or not ready' })
    }

    return reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `inline; filename="${file.filename}"`)
      .header('Cache-Control', 'public, max-age=86400')
      .send(file.buffer)
  })
}
