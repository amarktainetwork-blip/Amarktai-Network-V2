import { prisma } from '@amarktai/db'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'
import { executeWithProvider } from './provider-executor.js'

type RouteAttempt = {
  provider?: unknown
  model?: unknown
  executorId?: unknown
  success?: unknown
  error?: unknown
}

type DurableJobState = {
  status: string
  providerClaimAt: Date | null
  metadataJson: string | null
}

const CLAIM_CONFLICT = 'Execution already claimed by another worker'

function parseObject(value: unknown): Record<string, unknown> {
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

function asRouteAttempt(value: unknown): RouteAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as RouteAttempt
}

function routeIdentity(attempt: RouteAttempt): { provider: string; model: string; executorId: string } | null {
  if (typeof attempt.provider !== 'string' || !attempt.provider) return null
  if (typeof attempt.model !== 'string' || !attempt.model) return null
  if (typeof attempt.executorId !== 'string' || !attempt.executorId) return null
  return { provider: attempt.provider, model: attempt.model, executorId: attempt.executorId }
}

function claimConflict(error: unknown): boolean {
  return typeof error === 'string' && error.includes(CLAIM_CONFLICT)
}

function isInternalLongFormAssembly(payload: WorkerJobData): boolean {
  return payload.capability === 'long_form_video'
    && payload.metadata?.longFormAssembly === true
    && payload.metadata.internalLocalExecution === true
}

function isInternalSocialAdAssembly(payload: WorkerJobData): boolean {
  return payload.capability === 'social_content_generation'
    && payload.metadata?.socialAdAssembly === true
    && payload.metadata.internalLocalExecution === true
}

function isInternalResearchEvidence(payload: WorkerJobData): boolean {
  return payload.capability === 'research'
    && payload.metadata?.researchEvidence === true
    && payload.metadata.internalLocalExecution === true
}

function isInternalDocumentExtraction(payload: WorkerJobData): boolean {
  return payload.capability === 'document_ingest'
    && payload.metadata?.documentExtraction === true
    && payload.metadata.internalLocalExecution === true
}

function isInternalLocalExecution(payload: WorkerJobData): boolean {
  return isInternalLongFormAssembly(payload)
    || isInternalSocialAdAssembly(payload)
    || isInternalResearchEvidence(payload)
    || isInternalDocumentExtraction(payload)
}

async function executeInitial(payload: WorkerJobData): Promise<ProcessorResult> {
  // Local workflow operations retain immutable app authority but never enter
  // Orchestra or claim a paid provider execution. Provider fallback applies
  // only to provider-backed jobs.
  if (isInternalLongFormAssembly(payload)) {
    const { executeLongFormAssembly } = await import('../long-form-assembly.js')
    return executeLongFormAssembly(payload)
  }
  if (isInternalSocialAdAssembly(payload)) {
    const { executeSocialAdAssembly } = await import('../social-ad-assembly.js')
    return executeSocialAdAssembly(payload)
  }
  if (isInternalResearchEvidence(payload)) {
    const { executeResearchEvidence } = await import('../research-evidence-executor.js')
    return executeResearchEvidence(payload)
  }
  if (isInternalDocumentExtraction(payload)) {
    const { executeDocumentExtraction } = await import('../document-extraction-executor.js')
    return executeDocumentExtraction(payload)
  }
  return executeWithProvider(payload)
}

function chooseRecoveryRoute(metadata: Record<string, unknown>, attempts: RouteAttempt[]): { provider: string; model: string; executorId: string } | null {
  // If the first route already submitted a durable GenX job, retry that exact
  // model so the executor resumes the remote job instead of submitting again.
  const remoteJobId = typeof metadata.genxProviderJobId === 'string' ? metadata.genxProviderJobId : ''
  const remoteModel = typeof metadata.genxProviderModel === 'string' ? metadata.genxProviderModel : ''
  if (remoteJobId && remoteModel) {
    for (const attempt of attempts) {
      const identity = routeIdentity(attempt)
      if (identity?.provider === 'genx' && identity.model === remoteModel) return identity
    }
    return null
  }

  // Otherwise the last recorded route is the fallback that was prevented from
  // running only because the preceding route owned the same durable job claim.
  const finalAttempt = attempts.at(-1)
  if (!finalAttempt || !claimConflict(finalAttempt.error)) return null
  return routeIdentity(finalAttempt)
}

function withRecoveryEvidence(result: ProcessorResult, route: { provider: string; model: string; executorId: string }): ProcessorResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      durableProviderFallbackRecovery: {
        recovered: result.success,
        provider: route.provider,
        model: route.model,
        executorId: route.executorId,
      },
    },
  }
}

/**
 * Execute internal local workflow operations directly; otherwise execute through
 * Orchestra and recover one very specific durable provider fallback race.
 *
 * Recovery is deliberately fail-closed:
 * - internal local operations never enter provider routing;
 * - the job must still be processing;
 * - a provider claim must exist;
 * - at least two route attempts must be durably recorded;
 * - the final attempt must be the exact claim-conflict error;
 * - clearing the claim is an atomic compare-and-set on the original timestamp;
 * - recovery runs at most once.
 */
export async function executeWithDurableProviderFallback(payload: WorkerJobData): Promise<ProcessorResult> {
  const initial = await executeInitial(payload)
  if (initial.success || !claimConflict(initial.error) || isInternalLocalExecution(payload)) return initial

  const job = await prisma.job.findUnique({
    where: { id: payload.jobId },
    select: { status: true, providerClaimAt: true, metadataJson: true },
  }) as DurableJobState | null

  if (!job || job.status !== 'processing' || !job.providerClaimAt) return initial

  const metadata = parseObject(job.metadataJson)
  const attempts = Array.isArray(metadata.orchestraRouteAttempts)
    ? metadata.orchestraRouteAttempts.map(asRouteAttempt).filter((attempt): attempt is RouteAttempt => attempt !== null)
    : []

  // A single claim conflict may represent a genuine concurrent owner. Only a
  // same-invocation primary+fallback sequence is recovery-eligible.
  if (attempts.length < 2 || !claimConflict(attempts.at(-1)?.error)) return initial

  const route = chooseRecoveryRoute(metadata, attempts)
  if (!route) return initial

  const recoveredMetadata = {
    ...metadata,
    orchestraSelectedProvider: route.provider,
    orchestraSelectedModel: route.model,
    orchestraSelectedExecutorId: route.executorId,
    durableProviderFallbackRecovery: {
      requestedAt: new Date().toISOString(),
      reason: 'same_execution_fallback_inherited_provider_claim',
      provider: route.provider,
      model: route.model,
      executorId: route.executorId,
      priorAttemptCount: attempts.length,
    },
  }

  const released = await prisma.job.updateMany({
    where: {
      id: payload.jobId,
      status: 'processing',
      providerClaimAt: job.providerClaimAt,
    },
    data: {
      providerClaimAt: null,
      metadataJson: JSON.stringify(recoveredMetadata),
    },
  })

  if (released.count !== 1) return initial

  const retried = await executeWithProvider(payload)
  return withRecoveryEvidence(retried, route)
}
