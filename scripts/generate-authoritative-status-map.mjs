#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CAPABILITY_KEYS } from '../packages/core/src/capabilities.ts'
import { DURABLE_WORKFLOW_REGISTRATIONS } from '../packages/core/src/long-form-execution.ts'
import { getRuntimeTruth } from '../packages/core/src/runtime-truth.ts'
import { normalizeDurableWorkflowRuntimeTruth } from '../packages/core/src/effective-runtime-truth.ts'

const outputArg = process.argv.find((value) => value.startsWith('--output='))
const outputPath = outputArg ? resolve(outputArg.slice('--output='.length)) : null
const truth = normalizeDurableWorkflowRuntimeTruth(getRuntimeTruth())
const workflows = new Map(DURABLE_WORKFLOW_REGISTRATIONS.map((workflow) => [workflow.capability, workflow]))

const statusMap = {
  schemaVersion: 1,
  generatedFrom: {
    capabilityCatalogue: 'packages/core/src/capabilities.ts',
    executorRegistry: 'packages/core/src/executor-registry.ts',
    modelCatalogue: 'packages/core/src/model-catalog.ts',
    durableWorkflowRegistry: 'packages/core/src/long-form-execution.ts',
    truthProjection: 'packages/core/src/effective-runtime-truth.ts',
  },
  providerPolicy: truth.providerPolicy,
  counts: {
    catalogue: CAPABILITY_KEYS.length,
    atomic: truth.metrics.atomicCapabilityCount,
    composite: truth.metrics.compositeCapabilityCount,
    durableWorkflows: DURABLE_WORKFLOW_REGISTRATIONS.length,
    byClassification: truth.countsByClassification,
  },
  capabilities: truth.capabilities.map((capability) => ({
    capability: capability.capability,
    kind: capability.kind,
    classification: capability.classification,
    operationalState: capability.operationalState,
    implementationReady: capability.implementationReady,
    executorRegistered: capability.executorRegistered,
    durableWorkflowId: workflows.get(capability.capability)?.id ?? null,
    eligibleProviders: capability.eligibleProviders,
    blockedReasons: capability.blockedReasons,
    remainingWork: capability.remainingWork,
    liveProven: capability.liveProven,
  })),
}

const json = `${JSON.stringify(statusMap, null, 2)}\n`
if (outputPath) {
  await writeFile(outputPath, json, 'utf8')
  console.log(`AUTHORITATIVE_STATUS_MAP=${outputPath}`)
} else {
  process.stdout.write(json)
}
