import { createHash } from 'node:crypto'
import { AppCapabilityGrantSnapshotSchema, DEFAULT_JOB_OPTIONS, type JobPayload } from '@amarktai/core'
import { prisma } from './client.js'
import { refreshLongFormParentState } from './long-form-parent-state.js'

type QueueLike = {
  add: (...args: any[]) => Promise<unknown>
}

function safeJson(value: unknown): Record<string, unknown> {
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

export function longFormAssemblyJobId(parentJobId: string): string {
  const hex = createHash('sha256').update(`amarktai-long-form-assembly:${parentJobId}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16]!, 16) % 4]!
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export async function advanceLongFormWorkflow(parentJobId: string, queue: QueueLike): Promise<{ scheduled: boolean; assemblyJobId: string | null }> {
  const refreshed = await refreshLongFormParentState(parentJobId)
  if (!refreshed || !refreshed.componentState.readyToQueueAssembly) {
    return { scheduled: false, assemblyJobId: refreshed?.componentState.assembly.jobId ?? null }
  }

  const parsedGrant = AppCapabilityGrantSnapshotSchema.safeParse(refreshed.metadata.appGrantSnapshot)
  if (!parsedGrant.success
    || parsedGrant.data.appSlug !== refreshed.parent.appSlug
    || parsedGrant.data.capability !== 'long_form_video'
    || parsedGrant.data.enabled !== true
    || parsedGrant.data.artifactRead !== true
    || parsedGrant.data.artifactWrite !== true) {
    throw new Error("Long-form assembly requires the parent's valid immutable long_form_video AppCapabilityGrant snapshot with artifact read/write authority.")
  }
  const appGrantSnapshot = parsedGrant.data

  const id = longFormAssemblyJobId(parentJobId)
  const metadata = {
    executionProfile: 'internal_dashboard',
    longFormVideo: true,
    longFormAssembly: true,
    internalLocalExecution: true,
    parentJobId,
    executionId: refreshed.parent.executionId,
    appGrantSnapshot,
    appGrantSnapshotSource: typeof refreshed.metadata.appGrantSnapshotSource === 'string'
      ? refreshed.metadata.appGrantSnapshotSource
      : 'parent_job_snapshot',
    appGrantSnapshotAt: typeof refreshed.metadata.appGrantSnapshotAt === 'string'
      ? refreshed.metadata.appGrantSnapshotAt
      : new Date().toISOString(),
  }
  let assembly = await prisma.job.findUnique({ where: { id } })
  if (!assembly) {
    try {
      assembly = await prisma.job.create({ data: {
        id,
        appSlug: refreshed.parent.appSlug,
        capability: 'long_form_video',
        prompt: `Assemble long-form execution ${refreshed.parent.executionId}`,
        inputJson: '{}',
        metadataJson: JSON.stringify(metadata),
        traceId: `trace_longform_${refreshed.parent.executionId}_assembly`,
        status: 'planned',
        parentJobId,
        executionId: refreshed.parent.executionId,
        workflowPhase: 'assembly_planned',
      } })
    } catch {
      assembly = await prisma.job.findUnique({ where: { id } })
    }
  }

  if (!assembly || assembly.status === 'completed' || assembly.status === 'processing' || (assembly.status === 'queued' && assembly.queueJobId)) {
    return { scheduled: false, assemblyJobId: assembly?.id ?? id }
  }
  const claim = await prisma.job.updateMany({
    where: { id, status: { in: ['planned', 'failed'] }, queueJobId: '' },
    data: {
      status: 'queued',
      queueJobId: id,
      queuedAt: new Date(),
      error: null,
      completedAt: null,
      startedAt: null,
      workflowPhase: 'assembly_queued',
      metadataJson: JSON.stringify({ ...safeJson(assembly.metadataJson), ...metadata }),
    },
  })
  if (claim.count !== 1) return { scheduled: false, assemblyJobId: id }

  const payload: JobPayload = {
    jobId: id,
    appSlug: refreshed.parent.appSlug,
    capability: 'long_form_video',
    executionProfile: 'internal_dashboard',
    prompt: assembly.prompt,
    input: {},
    metadata,
    traceId: assembly.traceId,
    routingMode: 'balanced',
    appGrantSnapshot,
  }
  try {
    await queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: id })
  } catch (error) {
    await prisma.job.updateMany({
      where: { id, status: 'queued', queueJobId: id },
      data: {
        status: 'planned',
        queueJobId: '',
        queuedAt: null,
        error: error instanceof Error ? error.message : 'assembly queue failed',
      },
    })
    throw error
  }
  await refreshLongFormParentState(parentJobId)
  return { scheduled: true, assemblyJobId: id }
}
