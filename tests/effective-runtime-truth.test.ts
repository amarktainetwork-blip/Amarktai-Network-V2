import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_RUNTIME_CLASSIFICATIONS, getRuntimeTruth } from '../packages/core/src/runtime-truth.js'
import { DURABLE_WORKFLOW_REGISTRATIONS } from '../packages/core/src/long-form-execution.js'
import { normalizeDurableWorkflowRuntimeTruth } from '../packages/core/src/effective-runtime-truth.js'

const root = process.cwd()

function executableWorkflowTruth() {
  const capabilities = Object.fromEntries(
    DURABLE_WORKFLOW_REGISTRATIONS.flatMap((workflow) => [
      [workflow.capability, { configured: true, infrastructureReady: true, policyAllowed: true, locallyProven: true }],
      ...workflow.requiredCapabilities.map((capability) => [capability, {
        configured: true,
        infrastructureReady: true,
        policyAllowed: true,
        routeImplemented: true,
        queuePathImplemented: true,
        artifactPathImplemented: true,
      }]),
    ]),
  )
  const localStaticEvidence = Object.fromEntries(
    DURABLE_WORKFLOW_REGISTRATIONS.map((workflow) => [workflow.capability, true]),
  )
  return normalizeDurableWorkflowRuntimeTruth(getRuntimeTruth({
    capabilities,
    localStaticEvidence,
    longFormComponents: {
      plannerReady: true,
      durableParentReady: true,
      durablePlanReady: true,
      sceneLinkageReady: true,
      sceneSubmissionReady: true,
      sceneExecutionReady: true,
      retryResumeReady: true,
      progressTrackingReady: true,
      batchStructureReady: true,
      assemblyHandoffReady: true,
      videoOnlyAssemblyReady: true,
      voiceoverReady: true,
      subtitlesReady: true,
      musicBedReady: true,
      fullMultimediaReady: true,
    },
  }))
}

describe('effective runtime truth', () => {
  it('never reports a registered durable workflow as not implemented', () => {
    const truth = executableWorkflowTruth()
    for (const workflow of DURABLE_WORKFLOW_REGISTRATIONS) {
      const row = truth.capabilities.find((capability) => capability.capability === workflow.capability)
      expect(row, workflow.capability).toBeDefined()
      expect(row?.classification, workflow.capability).not.toBe('NOT_IMPLEMENTED')
      expect(row?.implementationReady, workflow.capability).toBe(true)
      expect(row?.clientImplemented, workflow.capability).toBe(true)
      expect(row?.adapterPresent, workflow.capability).toBe(true)
      expect(row?.executorRegistered, workflow.capability).toBe(true)
      expect(row?.routeImplemented, workflow.capability).toBe(true)
      expect(row?.queuePathImplemented, workflow.capability).toBe(true)
      expect(row?.artifactPathImplemented, workflow.capability).toBe(true)
      expect(row?.executorRegistrationIds).toContain(`workflow:${workflow.id}`)
      expect(row?.blockedReasons).not.toContain('executor_missing')
      expect(row?.blockedReasons).not.toContain('no_catalogued_model_claim')
    }
  })

  it('recomputes classification counts from the effective rows', () => {
    const truth = executableWorkflowTruth()
    const counted = Object.fromEntries(
      CAPABILITY_RUNTIME_CLASSIFICATIONS.map((classification) => [
        classification,
        truth.capabilities.filter((capability) => capability.classification === classification).length,
      ]),
    )
    expect(truth.countsByClassification).toEqual(counted)
  })

  it('makes the effective projection the admin-facing truth endpoint', () => {
    const route = readFileSync(resolve(root, 'apps/api/src/routes/admin-truth.ts'), 'utf8')
    const projection = readFileSync(resolve(root, 'apps/api/src/lib/effective-admin-runtime-truth.ts'), 'utf8')
    expect(route).toContain('buildEffectiveAdminRuntimeTruth')
    expect(route).not.toContain("from '../lib/admin-runtime-truth.js'")
    expect(projection).toContain('normalizeDurableWorkflowRuntimeTruth')
    expect(projection).toContain('buildAdminRuntimeTruth')
  })
})
