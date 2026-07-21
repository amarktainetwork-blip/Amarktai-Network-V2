import { prisma } from '@amarktai/db'

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

function isAssemblyJob(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdAssembly === true
}

export async function refreshSocialAdAssemblyParent(parentJobId: string): Promise<{
  phase: 'assembly_processing' | 'assembly_failed' | 'social_copy_pending' | 'completed'
  artifactId: string | null
} | null> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || safeJson(parent.metadataJson).socialAdVideo !== true) return null
  const parentMetadata = safeJson(parent.metadataJson)
  const children = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: { createdAt: 'asc' },
  })
  const assembly = children.find((child) => isAssemblyJob(child.metadataJson))
  if (!assembly || ['planned', 'queued', 'processing'].includes(assembly.status)) {
    return { phase: 'assembly_processing', artifactId: assembly?.artifactId ?? null }
  }
  if (assembly.status !== 'completed' || !assembly.artifactId) {
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        status: 'failed',
        workflowPhase: 'assembly_failed',
        progress: 87,
        error: assembly.error || 'Social-ad assembly failed without a final artifact.',
        completedAt: parent.completedAt ?? new Date(),
        metadataJson: JSON.stringify({
          ...parentMetadata,
          currentPhase: 'assembly_failed',
          assemblyJobId: assembly.id,
          assemblyError: assembly.error,
          assemblyFailedAt: new Date().toISOString(),
        }),
      },
    })
    return { phase: 'assembly_failed', artifactId: null }
  }

  const output = safeJson(assembly.output)
  const socialCopyStatus = output.socialCopyStatus
  const copyPending = socialCopyStatus === 'pending_text_quality_workflow'
  const phase = copyPending ? 'social_copy_pending' : 'completed'
  const metadata = {
    ...parentMetadata,
    currentPhase: phase,
    assemblyJobId: assembly.id,
    assemblyArtifactId: assembly.artifactId,
    deliveryVariants: output.variants ?? [],
    subtitleArtifactIds: output.subtitleArtifactIds ?? [],
    thumbnailArtifactId: output.thumbnailArtifactId ?? null,
    deliveryReportArtifactId: output.reportArtifactId ?? null,
    socialCopyStatus: socialCopyStatus ?? 'not_requested',
    assemblyCompletedAt: new Date().toISOString(),
  }
  await prisma.job.update({
    where: { id: parent.id },
    data: {
      status: copyPending ? 'processing' : 'completed',
      workflowPhase: phase,
      progress: copyPending ? 93 : 100,
      artifactId: assembly.artifactId,
      error: null,
      completedAt: copyPending ? null : new Date(),
      metadataJson: JSON.stringify(metadata),
    },
  })
  return { phase, artifactId: assembly.artifactId }
}
