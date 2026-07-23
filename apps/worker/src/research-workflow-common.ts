import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  validateDirectProviderRequest,
  type AppCapabilityGrantContext,
  type JobPayload,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'
import type { ResearchSource } from '@amarktai/core/research-platform'

export function researchSafeJson(value: unknown): Record<string, unknown> {
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

export function researchRole(job: { metadataJson: string }): string {
  const value = researchSafeJson(job.metadataJson).researchRole
  return typeof value === 'string' ? value : ''
}

export async function findResearchChild(parentId: string, appSlug: string, role: string) {
  const children = await prisma.job.findMany({
    where: { parentJobId: parentId, appSlug },
    orderBy: { createdAt: 'asc' },
  })
  return children.find((child) => researchRole(child) === role) ?? null
}

export function researchGrantFromParent(input: {
  metadata: Record<string, unknown>
  key: string
  capability: 'research' | 'question_answering'
  appSlug: string
}): AppCapabilityGrantContext {
  const value = input.metadata[input.key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Research parent is missing immutable ${input.capability} grant authority`)
  }
  const grant = value as AppCapabilityGrantContext
  if (grant.appSlug !== input.appSlug || grant.capability !== input.capability || !grant.enabled) {
    throw new Error(`Research ${input.capability} grant authority is invalid`)
  }
  return Object.freeze({ ...grant })
}

export function researchContext(sources: readonly ResearchSource[], maxCharacters = 450_000): string {
  const sections: string[] = []
  let length = 0
  for (const source of sources) {
    const section = [
      `[${source.citationId}] ${source.title}`,
      `URL: ${source.canonicalUrl}`,
      `Retrieved: ${source.retrievedAt}`,
      source.extractedText,
    ].join('\n')
    if (length + section.length > maxCharacters) {
      const remaining = maxCharacters - length
      if (remaining > 500) sections.push(section.slice(0, remaining))
      break
    }
    sections.push(section)
    length += section.length + 2
  }
  const context = sections.join('\n\n')
  if (!context.trim()) throw new Error('Research evidence produced no answer context')
  return context
}

export function parseResearchAnswer(output: unknown, allowedCitationIds: readonly string[]): {
  answer: string
  supportedByContext: true
  sourceIds: string[]
} {
  const parsed = researchSafeJson(output)
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer) throw new Error('Research answer is empty')
  if (parsed.supportedByContext !== true) throw new Error('Research answer is not supported by fetched sources')
  const sourceIds = Array.isArray(parsed.sourceIds)
    ? parsed.sourceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  if (sourceIds.length === 0) throw new Error('Research answer contains no citations')
  const allowed = new Set(allowedCitationIds)
  if (sourceIds.some((sourceId) => !allowed.has(sourceId))) {
    throw new Error('Research answer cites a source outside the fetched evidence')
  }
  return { answer, supportedByContext: true, sourceIds: [...new Set(sourceIds)] }
}

export async function queueResearchAnswerChild(input: {
  parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>
  queue: Queue
  sources: readonly ResearchSource[]
  grant: AppCapabilityGrantContext
  grantSource: unknown
}): Promise<NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>> {
  const existing = await findResearchChild(input.parent.id, input.parent.appSlug, 'answer_generation')
  if (existing) return existing
  const parentInput = researchSafeJson(input.parent.inputJson)
  const question = typeof parentInput.query === 'string' ? parentInput.query : input.parent.prompt
  const requestInput = {
    question,
    context: researchContext(input.sources),
    sourceIds: input.sources.map((source) => source.citationId),
  }
  const validation = validateDirectProviderRequest('question_answering', question, requestInput)
  if (!validation.success) throw new Error(`Research answer request is invalid: ${validation.error}`)
  const createdAt = new Date().toISOString()
  const metadata = {
    researchWorkflow: true,
    researchRole: 'answer_generation',
    executionId: input.parent.executionId,
    parentJobId: input.parent.id,
    appGrantSnapshot: input.grant,
    appGrantSnapshotSource: input.grantSource ?? 'parent_snapshot',
    appGrantSnapshotAt: createdAt,
    routingMode: input.grant.routingMode ?? 'automatic',
    executionProfile: 'external_app',
  }
  const child = await prisma.job.create({
    data: {
      appSlug: input.parent.appSlug,
      capability: 'question_answering',
      prompt: question,
      inputJson: JSON.stringify(validation.data),
      metadataJson: JSON.stringify(metadata),
      traceId: `${input.parent.traceId}_answer_generation`,
      status: 'queued',
      parentJobId: input.parent.id,
      executionId: input.parent.executionId,
      workflowPhase: 'answer_generation_queued',
      queuedAt: new Date(),
    },
  })
  const payload: JobPayload = {
    jobId: child.id,
    appSlug: child.appSlug,
    capability: 'question_answering',
    executionProfile: 'external_app',
    prompt: child.prompt,
    input: validation.data as Record<string, unknown>,
    metadata,
    traceId: child.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'automatic',
    appGrantSnapshot: input.grant,
  }
  try {
    await input.queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
    await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id, queuedAt: new Date() } })
    return child
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research answer queue submission failed'
    await prisma.job.update({
      where: { id: child.id },
      data: { status: 'failed', workflowPhase: 'answer_generation_queue_failed', error: message, completedAt: new Date() },
    })
    throw new Error(message)
  }
}

export async function failResearchParent(parentId: string, phase: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await prisma.job.update({
    where: { id: parentId },
    data: { status: 'failed', workflowPhase: phase, progress: 0, error: message, completedAt: new Date() },
  })
}
