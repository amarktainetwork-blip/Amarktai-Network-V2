import type { CapabilityKey } from './capabilities.js'
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

/**
 * Durable composite workflows use authenticated API/worker/persistence/recovery
 * registrations rather than one atomic provider executor. This projection keeps
 * the atomic model truth intact while preventing those proven workflows from
 * being reported as NOT_IMPLEMENTED merely because they have no direct model row.
 */
export function normalizeDurableWorkflowRuntimeTruth<T extends RuntimeTruth>(truth: T): T {
  type WorkflowRegistration = (typeof DURABLE_WORKFLOW_REGISTRATIONS)[number]
  const workflows = new Map<CapabilityKey, WorkflowRegistration>(
    DURABLE_WORKFLOW_REGISTRATIONS.map((workflow) => [workflow.capability, workflow]),
  )
  const readiness = new Map(truth.releaseReadiness.map((entry) => [entry.capability, entry]))

  const capabilities = truth.capabilities.map((row): CapabilityRuntimeTruth => {
    const workflow = workflows.get(row.capability)
    if (!workflow) return row
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
  })

  const countsByClassification = Object.fromEntries(
    CAPABILITY_RUNTIME_CLASSIFICATIONS.map((classification) => [
      classification,
      capabilities.filter((capability) => capability.classification === classification).length,
    ]),
  ) as Record<CapabilityRuntimeClassification, number>

  return { ...truth, capabilities, countsByClassification }
}
