import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'

export function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function booleanValue(value: unknown): boolean {
  return value === true
}

export function grantFromParent(input: {
  parentMetadata: Record<string, unknown>
  key: string
  capability: CapabilityKey
  appSlug: string
}): AppCapabilityGrantContext {
  const value = input.parentMetadata[input.key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`RAG parent is missing immutable ${input.capability} grant authority`)
  }
  const grant = value as AppCapabilityGrantContext
  if (grant.appSlug !== input.appSlug || grant.capability !== input.capability || !grant.enabled) {
    throw new Error(`RAG ${input.capability} grant authority is invalid`)
  }
  return Object.freeze({ ...grant })
}

export function parseEmbeddingOutput(output: unknown): {
  vectors: number[][]
  dimensions: number
} {
  const parsed = safeJson(output)
  if (!Array.isArray(parsed.vectors) || parsed.vectors.length === 0) {
    throw new Error('RAG embedding output has no vectors')
  }
  const vectors = parsed.vectors.map((vector, index) => {
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`RAG embedding vector ${index} is invalid`)
    }
    return vector as number[]
  })
  const dimensions = numberValue(parsed.dimensions, vectors[0]!.length)
  if (!Number.isInteger(dimensions) || dimensions !== vectors[0]!.length || vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('RAG embedding dimensions are inconsistent')
  }
  return { vectors, dimensions }
}

export function parseRerankOutput(output: unknown, documentCount: number): Array<{ index: number; score: number }> {
  const parsed = safeJson(output)
  if (!Array.isArray(parsed.results)) throw new Error('RAG reranking output has no results')
  const seen = new Set<number>()
  const results = parsed.results.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RAG reranking result is invalid')
    const record = value as Record<string, unknown>
    const index = Number(record.index)
    const score = Number(record.score)
    if (!Number.isInteger(index) || index < 0 || index >= documentCount || seen.has(index)) {
      throw new Error('RAG reranking index is invalid')
    }
    if (!Number.isFinite(score)) throw new Error('RAG reranking score is invalid')
    seen.add(index)
    return { index, score }
  })
  if (results.length === 0) throw new Error('RAG reranking returned zero results')
  return results
}

export function parseAnswerOutput(output: unknown, allowedSourceIds: readonly string[]): {
  answer: string
  supportedByContext: boolean
  sourceIds: string[]
} {
  const parsed = safeJson(output)
  const answer = stringValue(parsed.answer).trim()
  if (!answer) throw new Error('RAG answer is empty')
  const supportedByContext = parsed.supportedByContext === true
  const sourceIds = Array.isArray(parsed.sourceIds)
    ? parsed.sourceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const allowed = new Set(allowedSourceIds)
  if (sourceIds.some((sourceId) => !allowed.has(sourceId))) {
    throw new Error('RAG answer cites a source outside the retrieved context')
  }
  if (supportedByContext && sourceIds.length === 0) {
    throw new Error('Context-supported RAG answer has no citations')
  }
  return { answer, supportedByContext, sourceIds }
}

export function ragRole(job: { metadataJson: string }): string {
  return stringValue(safeJson(job.metadataJson).ragRole)
}

export async function findRagChild(parentId: string, appSlug: string, role: string) {
  const children = await prisma.job.findMany({
    where: { parentJobId: parentId, appSlug },
    orderBy: { createdAt: 'asc' },
  })
  return children.find((child) => ragRole(child) === role) ?? null
}

export async function queueRagChild(input: {
  parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>
  queue: Queue
  role: string
  capability: CapabilityKey
  prompt: string
  requestInput: Record<string, unknown>
  grant: AppCapabilityGrantContext
  grantSource: unknown
  phase: string
}): Promise<NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>> {
  const existing = await findRagChild(input.parent.id, input.parent.appSlug, input.role)
  if (existing) return existing
  const createdAt = new Date().toISOString()
  const metadata = {
    ragWorkflow: true,
    ragKind: safeJson(input.parent.metadataJson).ragKind,
    ragRole: input.role,
    executionId: input.parent.executionId,
    parentJobId: input.parent.id,
    namespace: safeJson(input.parent.metadataJson).namespace,
    appGrantSnapshot: input.grant,
    appGrantSnapshotSource: input.grantSource ?? 'parent_snapshot',
    appGrantSnapshotAt: createdAt,
    routingMode: input.grant.routingMode ?? 'automatic',
    executionProfile: 'external_app',
  }
  const job = await prisma.job.create({
    data: {
      appSlug: input.parent.appSlug,
      capability: input.capability,
      prompt: input.prompt,
      inputJson: JSON.stringify(input.requestInput),
      metadataJson: JSON.stringify(metadata),
      traceId: `${input.parent.traceId}_${input.role}`,
      status: 'queued',
      parentJobId: input.parent.id,
      executionId: input.parent.executionId,
      workflowPhase: `${input.phase}_queued`,
      queuedAt: new Date(),
    },
  })
  const payload: JobPayload = {
    jobId: job.id,
    appSlug: job.appSlug,
    capability: input.capability,
    executionProfile: 'external_app',
    prompt: job.prompt,
    input: input.requestInput,
    metadata,
    traceId: job.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'automatic',
    appGrantSnapshot: input.grant,
  }
  try {
    await input.queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
    await prisma.job.update({ where: { id: job.id }, data: { queueJobId: job.id, queuedAt: new Date() } })
    return job
  } catch (error) {
    const message = error instanceof Error ? error.message : `RAG ${input.role} queue submission failed`
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'failed', workflowPhase: `${input.phase}_queue_failed`, error: message, completedAt: new Date() },
    })
    throw new Error(message)
  }
}

export async function failRagParent(parentId: string, phase: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await prisma.job.update({
    where: { id: parentId },
    data: { status: 'failed', workflowPhase: phase, progress: 0, error: message, completedAt: new Date() },
  })
}
