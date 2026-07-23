import type { CapabilityKey } from './capabilities.js'
import { CAPABILITY_ACTIVATION_BLOCKERS, getCapabilityActivationBlocker } from './capability-activation-blockers.js'
import { INTERNAL_EXECUTOR_REGISTRATIONS } from './internal-executor-registry.js'
import { DURABLE_WORKFLOW_REGISTRATIONS } from './long-form-execution.js'
import {
  CAPABILITY_RUNTIME_CLASSIFICATIONS,
  type CapabilityOperationalState,
  type CapabilityRuntimeClassification,
  type CapabilityRuntimeTruth,
  type RuntimeTruth,
} from './runtime-truth.js'

const STRUCTURAL_ATOMIC_BLOCKERS = new Set([
  'provider_client_missing',
  'adapter_missing',
  'executor_missing',
  'request_shape_unknown',
  'response_shape_unknown',
  'route_missing',
  'queue_path_missing',
  'artifact_support_missing',
  'no_executor_compatible_catalogued_model',
  'no_catalogued_model_claim',
])

const INTERNAL_PROVIDER_BLOCKERS = new Set([
  ...STRUCTURAL_ATOMIC_BLOCKERS,
  'credentials_missing',
  'provider_configuration_missing',
  'client_missing',
  'executor_or_workflow_missing',
  'no_callable_executor_or_durable_workflow',
  'live_proof_missing',
])

function classifyWorkflow(input: {
  liveProven: boolean
  locallyProven: boolean
  executableNow: boolean
  policyAllowed: boolean
}): CapabilityRuntimeClassification {
  if (!input.policyAllowed) return 'POLICY_RESTRICTED'
  if (input.liveProven) return 'LIVE_PROVEN'
  if (input.locallyProven) return 'LOCALLY_PROVEN'
  if (input.executableNow) return 'EXECUTABLE_NOT_LIVE_PROVEN'
  return 'EXECUTOR_PRESENT'
}

function classifyInternal(input: {
  locallyProven: boolean
  executableNow: boolean
  infrastructureReady: boolean
  policyAllowed: boolean
}): CapabilityRuntimeClassification {
  if (!input.policyAllowed) return 'POLICY_RESTRICTED'
  if (input.locallyProven && input.executableNow) return 'LOCALLY_PROVEN'
  if (input.executableNow) return 'EXECUTABLE_NOT_LIVE_PROVEN'
  if (!input.infrastructureReady) return 'BLOCKED'
  return 'EXECUTOR_PRESENT'
}

function workflowOperationalState(input: {
  liveProven: boolean
  executableNow: boolean
  configured: boolean
  infrastructureReady: boolean
  policyAllowed: boolean
}): CapabilityOperationalState {
  if (!input.policyAllowed) return 'setup_required'
  if (input.liveProven) return 'live_proven'
  if (input.executableNow) return 'executable'
  if (!input.configured) return 'setup_required'
  if (!input.infrastructureReady) return 'provider_temporarily_unavailable'
  return 'compatible_route_available'
}

function internalOperationalState(input: {
  executableNow: boolean
  infrastructureReady: boolean
  policyAllowed: boolean
}): CapabilityOperationalState {
  if (!input.policyAllowed) return 'setup_required'
  if (input.executableNow) return 'executable'
  if (!input.infrastructureReady) return 'setup_required'
  return 'compatible_route_available'
}

/**
 * Effective runtime truth keeps four execution classes separate:
 * - provider-backed atomic executors remain grounded in model compatibility;
 * - durable composite workflows are grounded in workflow registrations;
 * - internal atomic executors are grounded in their local engine, queue, worker,
 *   artifact and fixture registrations and never acquire a fake provider/model;
 * - activation-blocked capabilities retain their canonical contract while the
 *   exact live account/schema or internal executor evidence remains outstanding.
 */
export function normalizeEffectiveRuntimeTruth<T extends RuntimeTruth>(truth: T): T {
  type WorkflowRegistration = (typeof DURABLE_WORKFLOW_REGISTRATIONS)[number]
  type InternalRegistration = (typeof INTERNAL_EXECUTOR_REGISTRATIONS)[number]
  const workflows = new Map<CapabilityKey, WorkflowRegistration>(
    DURABLE_WORKFLOW_REGISTRATIONS.map((workflow) => [workflow.capability, workflow]),
  )
  const internals = new Map<CapabilityKey, InternalRegistration>(
    INTERNAL_EXECUTOR_REGISTRATIONS.map((registration) => [registration.capability, registration]),
  )
  const readiness = new Map(truth.releaseReadiness.map((entry) => [entry.capability, entry]))

  const capabilities = truth.capabilities.map((row): CapabilityRuntimeTruth => {
    const workflow = workflows.get(row.capability)
    if (workflow) {
      const projection = readiness.get(row.capability)
      const configured = projection ? !projection.blockedReasons.includes('provider_configuration_missing') : row.configured
      const infrastructureReady = projection ? !projection.blockedReasons.includes('infrastructure_missing') : row.infrastructureReady
      const policyAllowed = projection ? !projection.blockedReasons.includes('policy_restricted') : row.policyAllowed
      const executableNow = projection?.readyForDashboardExecution === true
      const locallyProven = row.locallyProven || projection?.locallyProven === true
      const liveProven = row.liveProven || projection?.liveProven === true
      const blockedReasons = [...new Set([
        ...(projection?.blockedReasons ?? []),
        ...row.blockedReasons.filter((reason) => !STRUCTURAL_ATOMIC_BLOCKERS.has(reason)),
      ])]
      const remainingWork = blockedReasons.filter((reason) => reason !== 'live_proof_missing')
      return {
        ...row,
        clientImplemented: true,
        adapterPresent: true,
        executorRegistered: true,
        executorRegistrationIds: [...new Set([...row.executorRegistrationIds, `workflow:${workflow.id}`])],
        requestShapeKnown: true,
        responseShapeKnown: true,
        routeImplemented: true,
        queuePathImplemented: true,
        artifactPathImplemented: true,
        implementationReady: true,
        configured,
        infrastructureReady,
        policyAllowed,
        executableNow,
        locallyProven,
        liveProven,
        blockedReasons,
        remainingWork,
        operationalState: workflowOperationalState({ liveProven, executableNow, configured, infrastructureReady, policyAllowed }),
        classification: classifyWorkflow({ liveProven, locallyProven, executableNow, policyAllowed }),
      }
    }

    const internal = internals.get(row.capability)
    if (internal) {
      const projection = readiness.get(row.capability)
      const infrastructureReady = row.infrastructureReady || (projection ? !projection.blockedReasons.includes('infrastructure_missing') : false)
      const policyAllowed = row.policyAllowed && !projection?.blockedReasons.includes('policy_restricted')
      const locallyProven = row.locallyProven || projection?.locallyProven === true
      const executableNow = infrastructureReady && policyAllowed
      const blockedReasons = row.blockedReasons.filter((reason) => !INTERNAL_PROVIDER_BLOCKERS.has(reason))
      if (!infrastructureReady) blockedReasons.push('infrastructure_missing')
      if (!policyAllowed) blockedReasons.push('policy_restricted')
      if (executableNow && !locallyProven) blockedReasons.push('local_proof_missing')
      const uniqueBlockers = [...new Set(blockedReasons)]

      return {
        ...row,
        clientImplemented: true,
        adapterPresent: true,
        executorRegistered: true,
        executorRegistrationIds: [...new Set([...row.executorRegistrationIds, `internal:${internal.id}`])],
        requestShapeKnown: true,
        responseShapeKnown: true,
        routeImplemented: true,
        queuePathImplemented: true,
        artifactPathImplemented: internal.artifactOutput !== null,
        implementationReady: true,
        configured: true,
        infrastructureReady,
        policyAllowed,
        executableNow,
        locallyProven,
        liveProven: false,
        eligibleProviders: [],
        eligibleModels: [],
        blockedReasons: uniqueBlockers,
        remainingWork: uniqueBlockers,
        operationalState: internalOperationalState({ executableNow, infrastructureReady, policyAllowed }),
        classification: classifyInternal({ locallyProven, executableNow, infrastructureReady, policyAllowed }),
      }
    }

    const activationBlocker = getCapabilityActivationBlocker(row.capability)
    if (!activationBlocker || !row.policyAllowed) return row
    const activationReason = `activation:${activationBlocker.blockerCode}`
    const blockedReasons = [...new Set([
      ...row.blockedReasons.filter((reason) => !STRUCTURAL_ATOMIC_BLOCKERS.has(reason)),
      activationReason,
    ])]
    return {
      ...row,
      configured: activationBlocker.provider === 'network' ? true : row.configured,
      executableNow: false,
      liveProven: false,
      blockedReasons,
      remainingWork: [activationReason],
      operationalState: activationBlocker.stage === 'staging_live_discovery' ? 'account_access_required' : 'contract_unknown',
      classification: 'BLOCKED',
    }
  })

  const capabilityMap = new Map(capabilities.map((capability) => [capability.capability, capability]))
  const releaseReadiness = truth.releaseReadiness.map((entry) => {
    const internal = internals.get(entry.capability)
    const activationBlocker = getCapabilityActivationBlocker(entry.capability)
    if (activationBlocker && !internal) {
      const capability = capabilityMap.get(entry.capability)!
      return {
        ...entry,
        releaseCandidate: true,
        catalogued: true,
        clientPresent: capability.clientImplemented,
        executorPresent: false,
        workflowPresent: false,
        schemaPresent: Boolean(capability.inputContractReference && capability.outputContractReference && capability.schemaKey),
        locallyProven: capability.locallyProven,
        liveProven: false,
        readyForDashboardExecution: false,
        blockedReasons: [`activation:${activationBlocker.blockerCode}`],
      }
    }
    if (!internal) return entry
    const capability = capabilityMap.get(entry.capability)!
    const blockedReasons: string[] = []
    if (!entry.appGrantPresent) blockedReasons.push('app_grant_missing')
    if (!capability.infrastructureReady) blockedReasons.push('infrastructure_missing')
    if (!capability.policyAllowed) blockedReasons.push('policy_restricted')
    if (capability.executableNow && !capability.locallyProven) blockedReasons.push('local_proof_missing')
    return {
      ...entry,
      releaseCandidate: true,
      catalogued: true,
      clientPresent: true,
      executorPresent: true,
      workflowPresent: false,
      schemaPresent: true,
      infrastructureRequired: [...internal.infrastructure],
      locallyProven: capability.locallyProven,
      liveProven: false,
      readyForDashboardExecution: entry.appGrantPresent && capability.executableNow,
      blockedReasons: [...new Set(blockedReasons)],
    }
  })

  const countsByClassification = Object.fromEntries(
    CAPABILITY_RUNTIME_CLASSIFICATIONS.map((classification) => [
      classification,
      capabilities.filter((capability) => capability.classification === classification).length,
    ]),
  ) as Record<CapabilityRuntimeClassification, number>

  return {
    ...truth,
    capabilities,
    releaseReadiness,
    releaseCandidateCapabilities: [...new Set([
      ...truth.releaseCandidateCapabilities,
      ...INTERNAL_EXECUTOR_REGISTRATIONS.map((registration) => registration.capability),
      ...CAPABILITY_ACTIVATION_BLOCKERS.map((blocker) => blocker.capability),
    ])],
    countsByClassification,
  }
}

/** Backward-compatible name used by existing admin and fixture consumers. */
export const normalizeDurableWorkflowRuntimeTruth = normalizeEffectiveRuntimeTruth
