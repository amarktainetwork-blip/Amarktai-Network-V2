import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  type AppCapabilityGrantContext,
  type JobPayload,
} from '@amarktai/core'
import { ResearchRequestSchema } from '@amarktai/core/research-platform'
import { prisma } from '@amarktai/db'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { authenticateAppKey } from './jobs.js'

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function childEvidence(job: Awaited<ReturnType<typeof prisma.job.findMany>>[number]) {
  const metadata = safeJson(job.metadataJson)
  return {
    jobId: job.id,
    role: metadata.researchRole ?? null,
    capability: job.capability,
    status: job.status,
    phase: job.workflowPhase,
    progress: job.progress,
    provider: job.provider,
    model: job.model,
    artifactId: job.artifactId,
    error: job.error,
  }
}

function validGrant(grant: AppCapabilityGrantContext | null, input: {
  appSlug: string
  capability: 'research' | 'question_answering'
}): grant is AppCapabilityGrantContext {
  return Boolean(grant
    && grant.enabled
    && grant.appSlug === input.appSlug
    && grant.capability === input.capability)
}

export async function appResearchRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for research execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/research/executions', async (request, reply) => {
    const authentication = await authenticateAppKey(request.headers.authorization)
    if (!authentication.ok) {
      return reply.status(authentication.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: authentication.error,
      })
    }
    const parsed = ResearchRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_RESEARCH_REQUEST',
        message: 'Research request validation failed.',
        issues: parsed.error.issues,
      })
    }
    if (parsed.data.ragNamespace) {
      return reply.status(409).send({
        error: true,
        code: 'RESEARCH_RAG_EXPORT_REQUIRES_EXPLICIT_INGEST',
        message: 'Use the completed research report artifact with the RAG ingest API. Automatic RAG export is not accepted until it has its own durable proof.',
      })
    }

    const appSlug = authentication.app!.slug
    const allowedCapabilities = authentication.allowedCapabilities ?? []
    const [researchSnapshot, answerSnapshot] = await Promise.all([
      resolveAppCapabilityGrantSnapshot(appSlug, 'research', allowedCapabilities),
      parsed.data.answer
        ? resolveAppCapabilityGrantSnapshot(appSlug, 'question_answering', allowedCapabilities)
        : Promise.resolve(null),
    ])
    const researchGrant = researchSnapshot?.grant ?? null
    const answerGrant = answerSnapshot?.grant ?? null
    if (!validGrant(researchGrant, { appSlug, capability: 'research' })) {
      return reply.status(403).send({
        error: true,
        code: 'RESEARCH_GRANT_REQUIRED',
        message: 'The authenticated app does not have an enabled research grant.',
        missingCapabilities: ['research'],
      })
    }
    if (parsed.data.answer && !validGrant(answerGrant, { appSlug, capability: 'question_answering' })) {
      return reply.status(403).send({
        error: true,
        code: 'RESEARCH_GRANT_REQUIRED',
        message: 'Cited research answers require an enabled question_answering grant.',
        missingCapabilities: ['question_answering'],
      })
    }
    if (!researchGrant.artifactWrite) {
      return reply.status(403).send({
        error: true,
        code: 'RESEARCH_ARTIFACT_WRITE_REQUIRED',
        message: 'The research grant must allow evidence and report artifact writes.',
      })
    }

    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const parentMetadata: Record<string, unknown> = {
      researchWorkflow: true,
      currentPhase: 'evidence_collection',
      executionId,
      answerRequested: parsed.data.answer,
      researchGrantSnapshot: researchGrant,
      researchGrantSnapshotSource: researchSnapshot?.source ?? 'resolved',
      researchGrantSnapshotAt: createdAt,
      ...(answerGrant ? {
        answerGrantSnapshot: answerGrant,
        answerGrantSnapshotSource: answerSnapshot?.source ?? 'resolved',
        answerGrantSnapshotAt: createdAt,
      } : {}),
    }
    const parent = await prisma.job.create({
      data: {
        appSlug,
        capability: 'research',
        prompt: parsed.data.query,
        inputJson: JSON.stringify(parsed.data),
        metadataJson: JSON.stringify(parentMetadata),
        traceId: `trace_research_${executionId}`,
        status: 'processing',
        progress: 5,
        executionId,
        workflowPhase: 'evidence_collection',
      },
    })
    const childMetadata = {
      researchWorkflow: true,
      researchRole: 'evidence_collection',
      researchEvidence: true,
      internalLocalExecution: true,
      executionId,
      parentJobId: parent.id,
      appGrantSnapshot: researchGrant,
      appGrantSnapshotSource: researchSnapshot?.source ?? 'resolved',
      appGrantSnapshotAt: createdAt,
      executionProfile: 'external_app',
    }
    const child = await prisma.job.create({
      data: {
        appSlug,
        capability: 'research',
        prompt: parsed.data.query,
        inputJson: JSON.stringify(parsed.data),
        metadataJson: JSON.stringify(childMetadata),
        traceId: `${parent.traceId}_evidence_collection`,
        status: 'queued',
        parentJobId: parent.id,
        executionId,
        workflowPhase: 'evidence_collection_queued',
        queuedAt: new Date(),
      },
    })
    await prisma.job.update({
      where: { id: parent.id },
      data: { metadataJson: JSON.stringify({ ...parentMetadata, evidenceJobId: child.id }) },
    })
    const payload: JobPayload = {
      jobId: child.id,
      appSlug,
      capability: 'research',
      executionProfile: 'external_app',
      prompt: child.prompt,
      input: parsed.data,
      metadata: childMetadata,
      traceId: child.traceId,
      routingMode: 'automatic',
      appGrantSnapshot: researchGrant,
    }
    try {
      await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
      await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id, queuedAt: new Date() } })
      return reply.status(202).send({
        executionId,
        parentJobId: parent.id,
        evidenceJobId: child.id,
        status: 'processing',
        phase: 'evidence_collection',
        executionAuthority: 'amarktai-network',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research queue submission failed'
      await prisma.job.update({
        where: { id: child.id },
        data: { status: 'failed', workflowPhase: 'evidence_collection_queue_failed', error: message, completedAt: new Date() },
      })
      await prisma.job.update({
        where: { id: parent.id },
        data: { status: 'failed', workflowPhase: 'evidence_collection_queue_failed', error: message, completedAt: new Date() },
      })
      return reply.status(500).send({ error: true, code: 'RESEARCH_QUEUE_FAILED', message })
    }
  })

  app.get('/api/v1/research/executions/:id', async (request, reply) => {
    const authentication = await authenticateAppKey(request.headers.authorization)
    if (!authentication.ok) {
      return reply.status(authentication.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: authentication.error,
      })
    }
    const { id } = request.params as { id: string }
    const appSlug = authentication.app!.slug
    const parent = await prisma.job.findFirst({
      where: {
        appSlug,
        parentJobId: null,
        capability: 'research',
        OR: [{ id }, { executionId: id }],
      },
    })
    if (!parent || safeJson(parent.metadataJson).researchWorkflow !== true) {
      return reply.status(404).send({
        error: true,
        code: 'RESEARCH_EXECUTION_NOT_FOUND',
        message: 'Research execution was not found for the authenticated app.',
      })
    }
    const children = await prisma.job.findMany({
      where: { appSlug, parentJobId: parent.id },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({
      executionId: parent.executionId,
      parentJobId: parent.id,
      status: parent.status,
      phase: parent.workflowPhase,
      progress: parent.progress,
      artifactId: parent.artifactId,
      error: parent.error,
      result: parent.output ? safeJson(parent.output) : null,
      evidence: children.map(childEvidence),
    })
  })
}
