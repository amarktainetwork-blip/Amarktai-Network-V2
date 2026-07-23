import type { Queue } from 'bullmq'
import type { AppCapabilityGrantContext, CapabilityKey } from '@amarktai/core'
import { ragNamespaceAllowed } from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

export type RagQueueGetter = () => Queue
export type RagGrantSnapshot = NonNullable<Awaited<ReturnType<typeof resolveAppCapabilityGrantSnapshot>>>

export function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export async function grantSnapshot(
  appSlug: string,
  capability: CapabilityKey,
  allowedCapabilities: readonly string[],
): Promise<RagGrantSnapshot | null> {
  return resolveAppCapabilityGrantSnapshot(appSlug, capability, allowedCapabilities)
}

export function validNamespace(grant: AppCapabilityGrantContext, namespace: string): boolean {
  return grant.enabled && ragNamespaceAllowed(grant.ragNamespaces, namespace)
}

export function statusEvidence(job: Awaited<ReturnType<typeof prisma.job.findMany>>[number]) {
  const metadata = safeJson(job.metadataJson)
  return {
    jobId: job.id,
    role: metadata.ragRole ?? null,
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
