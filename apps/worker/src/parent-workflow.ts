import type { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { advanceLongFormWorkflow } from './long-form-workflow.js'
import { refreshSocialAdAssemblyParent } from './social-ad-assembly-workflow.js'
import { ensureSocialAdCopyGrantSnapshot } from './social-ad-copy-grant.js'
import { advanceSocialAdCopyWorkflow } from './social-ad-copy-workflow.js'
import { ensureSocialAdQualityGrantSnapshot } from './social-ad-quality-grant.js'
import { advanceSocialAdQualityWorkflow } from './social-ad-quality-workflow.js'
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
    if (['assembly_queued', 'assembly_processing', 'assembly_queue_failed'].includes(parent.workflowPhase)) {
      const assembly = await refreshSocialAdAssemblyParent(parent.id)
      if (assembly?.phase === 'social_copy_pending') {
        await ensureSocialAdCopyGrantSnapshot(parent.id)
        await advanceSocialAdCopyWorkflow(parent.id, queue)
      }
      return { kind, advanced: true }
    }
    if (['social_copy_pending', 'social_copy_generation', 'copy_jobs_queued'].includes(parent.workflowPhase)) {
      await ensureSocialAdCopyGrantSnapshot(parent.id)
      await advanceSocialAdCopyWorkflow(parent.id, queue)
      return { kind, advanced: true }
    }
    if ([
      'completed',
      'assembly_failed',
      'revision_required',
      'human_approval_pending',
      'assembly_pending',
      'copy_quality_failed',
      'final_approval_pending',
      'final_revision_required',
    ].includes(parent.workflowPhase)) {
      return { kind, advanced: false }
    }
    const generation = await refreshSocialAdParentState(parent.id)
    if (generation?.state.phase === 'candidate_quality_pending') {
      await ensureSocialAdQualityGrantSnapshot(parent.id)
      await advanceSocialAdQualityWorkflow(parent.id, queue)
    }
    return { kind, advanced: true }
  }
  return { kind: 'unknown', advanced: false }
}
