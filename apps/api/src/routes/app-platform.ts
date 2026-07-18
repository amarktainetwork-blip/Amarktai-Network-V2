import type { FastifyInstance } from 'fastify'
import { CAPABILITY_CATALOG } from '@amarktai/core'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'
import { loadAllAppCapabilityGrants } from '../lib/app-grant-loader.js'

export async function appPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/capabilities', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const grants = await loadAllAppCapabilityGrants(auth.app!.slug)
    return reply.send({
      capabilities: CAPABILITY_CATALOG.filter((capability) => grants.get(capability.key)?.enabled).map((capability) => ({
        key: capability.key, label: capability.label, description: capability.description,
        kind: capability.kind, family: capability.family, inputContract: capability.inputContractReference,
        outputContract: capability.outputContractReference, artifactType: capability.artifactType,
      })),
    })
  })

  app.get('/api/v1/policy', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const grants = await loadAllAppCapabilityGrants(auth.app!.slug)
    return reply.send({ appSlug: auth.app!.slug, grants: Object.fromEntries(grants), providerModelAuthority: 'orchestra' })
  })

  app.get('/api/v1/usage', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const [usage, budget] = await Promise.all([
      prisma.usageMeter.findMany({ where: { appSlug: auth.app!.slug }, orderBy: { date: 'desc' }, take: 100 }),
      prisma.appBudgetConfig.findUnique({ where: { appSlug: auth.app!.slug } }),
    ])
    return reply.send({ usage, budget })
  })

  app.get('/api/v1/artifacts/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const artifact = await prisma.artifact.findFirst({ where: { id, appSlug: auth.app!.slug } })
    if (!artifact) return reply.status(404).send({ error: true, code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found.' })
    return reply.send({
      id: artifact.id, type: artifact.type, subType: artifact.subType, title: artifact.title,
      provider: artifact.provider, model: artifact.model, traceId: artifact.traceId,
      mimeType: artifact.mimeType, fileSizeBytes: artifact.fileSizeBytes, status: artifact.status,
      previewable: artifact.previewable, downloadable: artifact.downloadable,
      costUsdCents: artifact.costUsdCents, metadata: safeMetadata(artifact.metadata),
      createdAt: artifact.createdAt.toISOString(), fileUrl: `/api/v1/artifacts/${encodeURIComponent(id)}/file`,
    })
  })

  app.post('/api/v1/jobs/:id/cancel', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const result = await prisma.job.updateMany({ where: { id, appSlug: auth.app!.slug, status: { in: ['queued', 'processing'] } }, data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by app' } })
    if (!result.count) return reply.status(409).send({ error: true, code: 'JOB_NOT_CANCELLABLE', message: 'Job is missing, completed, or belongs to another app.' })
    return reply.send({ jobId: id, status: 'cancelled' })
  })
}

function safeMetadata(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value); return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}
