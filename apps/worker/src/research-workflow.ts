import { Buffer } from 'node:buffer'
import type { Queue } from 'bullmq'
import {
  ResearchReportSchema,
  ResearchRequestSchema,
  validateResearchCitationSet,
  type ResearchCitation,
  type ResearchReport,
  type ResearchSource,
} from '@amarktai/core/research-platform'
import {
  findCompletedArtifactByTraceId,
  saveArtifact,
} from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import { readResearchEvidenceArtifact } from './research-evidence-executor.js'
import {
  failResearchParent,
  findResearchChild,
  parseResearchAnswer,
  queueResearchAnswerChild,
  researchGrantFromParent,
  researchSafeJson,
} from './research-workflow-common.js'

function excerpt(source: ResearchSource): string {
  return source.extractedText.replace(/\s+/g, ' ').trim().slice(0, 1_500)
}

function citationsForAnswer(input: {
  answer: string
  sourceIds: readonly string[]
  sources: readonly ResearchSource[]
}): ResearchCitation[] {
  const byCitation = new Map(input.sources.map((source) => [source.citationId, source]))
  return input.sourceIds.map((citationId) => {
    const source = byCitation.get(citationId)
    if (!source) throw new Error(`Research answer citation was not fetched: ${citationId}`)
    return {
      citationId,
      sourceId: source.sourceId,
      url: source.canonicalUrl,
      title: source.title,
      claim: input.answer.slice(0, 5_000),
      excerpt: excerpt(source),
    }
  })
}

async function completeResearchParent(input: {
  parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>
  evidence: Awaited<ReturnType<typeof readResearchEvidenceArtifact>>
  answer: string
  supportedBySources: boolean
  sourceIds: readonly string[]
}): Promise<void> {
  const existing = await findCompletedArtifactByTraceId(input.parent.traceId, 'research_report')
  if (existing) {
    await prisma.job.update({
      where: { id: input.parent.id },
      data: {
        status: 'completed',
        workflowPhase: 'completed',
        progress: 100,
        artifactId: existing.id,
        output: JSON.stringify({
          reportArtifactId: existing.id,
          answer: input.answer,
          supportedBySources: input.supportedBySources,
          citationCount: input.sourceIds.length,
          sourceCount: input.evidence.sources.length,
          reused: true,
        }),
        error: null,
        completedAt: new Date(),
      },
    })
    return
  }

  const citations = input.supportedBySources
    ? citationsForAnswer({ answer: input.answer, sourceIds: input.sourceIds, sources: input.evidence.sources })
    : []
  validateResearchCitationSet({ citations, sources: input.evidence.sources })
  const report: ResearchReport = ResearchReportSchema.parse({
    version: 1,
    query: input.evidence.query,
    answer: input.answer,
    supportedBySources: input.supportedBySources,
    citations,
    sources: input.evidence.sources,
    searchedAt: input.evidence.searchedAt,
    completedAt: new Date().toISOString(),
    searchEvidence: input.evidence.searchEvidence,
    warnings: input.evidence.warnings,
    executionEvidence: {
      appSlug: input.parent.appSlug,
      executionId: input.parent.executionId ?? input.parent.id,
      sourceCount: input.evidence.sources.length,
      fetchedCount: input.evidence.sources.length,
      failedCount: input.evidence.failedCount,
      blockedCount: input.evidence.blockedCount,
    },
  })
  const artifact = await saveArtifact({
    input: {
      appSlug: input.parent.appSlug,
      type: 'document',
      subType: 'research_report',
      title: `Research report: ${report.query.slice(0, 120)}`,
      description: 'Governed cited research report with source lineage and execution evidence.',
      provider: 'amarktai-network',
      model: 'cited-research-report-v1',
      traceId: input.parent.traceId,
      mimeType: 'application/json',
      metadata: {
        researchReport: true,
        parentJobId: input.parent.id,
        executionId: input.parent.executionId,
        sourceCount: report.sources.length,
        citationCount: report.citations.length,
        supportedBySources: report.supportedBySources,
      },
    },
    data: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
    explicitMimeType: 'application/json',
  })
  const metadata = researchSafeJson(input.parent.metadataJson)
  await prisma.job.update({
    where: { id: input.parent.id },
    data: {
      status: 'completed',
      workflowPhase: 'completed',
      progress: 100,
      artifactId: artifact.id,
      output: JSON.stringify({
        reportArtifactId: artifact.id,
        answer: report.answer,
        supportedBySources: report.supportedBySources,
        citationCount: report.citations.length,
        sourceCount: report.sources.length,
      }),
      metadataJson: JSON.stringify({
        ...metadata,
        currentPhase: 'completed',
        reportArtifactId: artifact.id,
        sourceCount: report.sources.length,
        citationCount: report.citations.length,
      }),
      error: null,
      completedAt: new Date(),
    },
  })
}

export async function advanceResearchWorkflow(parentJobId: string, queue: Queue): Promise<void> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || parent.capability !== 'research' || parent.parentJobId !== null) return
  const metadata = researchSafeJson(parent.metadataJson)
  if (metadata.researchWorkflow !== true) return
  if (['completed', 'failed', 'cancelled', 'cancelling'].includes(parent.status)) return

  try {
    const request = ResearchRequestSchema.parse(researchSafeJson(parent.inputJson))
    const evidenceChild = await findResearchChild(parent.id, parent.appSlug, 'evidence_collection')
    if (!evidenceChild) throw new Error('Research evidence child is missing')
    if (evidenceChild.status === 'failed' || evidenceChild.status === 'cancelled') {
      throw new Error(evidenceChild.error || 'Research evidence collection failed')
    }
    if (evidenceChild.status !== 'completed' || !evidenceChild.artifactId) {
      await prisma.job.update({
        where: { id: parent.id },
        data: { workflowPhase: 'evidence_collection', progress: Math.max(parent.progress, 15) },
      })
      return
    }

    const evidence = await readResearchEvidenceArtifact(evidenceChild.artifactId)
    const currentMetadata = {
      ...metadata,
      currentPhase: request.answer ? 'answer_generation' : 'report_finalization',
      evidenceArtifactId: evidenceChild.artifactId,
      sourceCount: evidence.sources.length,
      failedCount: evidence.failedCount,
      blockedCount: evidence.blockedCount,
    }
    if (!request.answer) {
      await completeResearchParent({
        parent,
        evidence,
        answer: '',
        supportedBySources: false,
        sourceIds: [],
      })
      return
    }

    const grant = researchGrantFromParent({
      metadata,
      key: 'answerGrantSnapshot',
      capability: 'question_answering',
      appSlug: parent.appSlug,
    })
    const answerChild = await queueResearchAnswerChild({
      parent,
      queue,
      sources: evidence.sources,
      grant,
      grantSource: metadata.answerGrantSnapshotSource,
    })
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        workflowPhase: 'answer_generation',
        progress: Math.max(parent.progress, 70),
        metadataJson: JSON.stringify({ ...currentMetadata, answerJobId: answerChild.id }),
      },
    })
    if (answerChild.status === 'failed' || answerChild.status === 'cancelled') {
      throw new Error(answerChild.error || 'Research answer generation failed')
    }
    if (answerChild.status !== 'completed' || !answerChild.output) return

    const parsed = parseResearchAnswer(answerChild.output, evidence.sources.map((source) => source.citationId))
    await completeResearchParent({
      parent,
      evidence,
      answer: parsed.answer,
      supportedBySources: true,
      sourceIds: parsed.sourceIds,
    })
  } catch (error) {
    await failResearchParent(parent.id, 'research_failed', error)
  }
}
