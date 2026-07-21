import type { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { advanceRagIngestWorkflow } from './rag-ingest-workflow.js'
import { advanceRagSearchWorkflow } from './rag-search-workflow.js'
import { safeJson } from './rag-workflow-common.js'

export type RagWorkflowKind = 'ingest' | 'search'

export function classifyRagWorkflow(parent: {
  capability: string
  metadataJson: unknown
}): RagWorkflowKind | null {
  const metadata = safeJson(parent.metadataJson)
  if (metadata.ragWorkflow !== true) return null
  if (parent.capability === 'rag_ingest' && metadata.ragKind === 'ingest') return 'ingest'
  if (parent.capability === 'rag_search' && metadata.ragKind === 'search') return 'search'
  return null
}

export async function advanceRagWorkflow(parentId: string, queue: Queue): Promise<{
  kind: RagWorkflowKind
  phase: string
  artifactId?: string
} | null> {
  const parent = await prisma.job.findUnique({ where: { id: parentId } })
  if (!parent) return null
  const kind = classifyRagWorkflow(parent)
  if (!kind) return null
  if (kind === 'ingest') {
    const result = await advanceRagIngestWorkflow(parent.id)
    return { kind, ...result }
  }
  const result = await advanceRagSearchWorkflow(parent.id, queue)
  return { kind, ...result }
}
