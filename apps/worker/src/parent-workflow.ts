import type { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { advanceLongFormWorkflow } from './long-form-workflow.js'
import { refreshSocialAdParentState } from './social-ad-workflow.js'

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

export type ParentWorkflowKind = 'long_form_video' | 'social_ad_video' | 'unknown'

export function classifyParentWorkflow(parent: {
  capability: string
  metadataJson: unknown
}): ParentWorkflowKind {
  const metadata = safeJson(parent.metadataJson)
  if (parent.capability === 'long_form_video') return 'long_form_video'
  if (parent.capability === 'social_content_generation' && metadata.socialAdVideo === true) {
    return 'social_ad_video'
  }
  return 'unknown'
}

export async function advanceParentWorkflow(parentJobId: string, queue: Queue): Promise<{
  kind: ParentWorkflowKind
  advanced: boolean
}> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) return { kind: 'unknown', advanced: false }

  const kind = classifyParentWorkflow(parent)
  if (kind === 'long_form_video') {
    await advanceLongFormWorkflow(parent.id, queue)
    return { kind, advanced: true }
  }
  if (kind === 'social_ad_video') {
    await refreshSocialAdParentState(parent.id)
    return { kind, advanced: true }
  }
  return { kind, advanced: false }
}
