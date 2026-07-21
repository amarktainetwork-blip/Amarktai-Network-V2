import { getExecutorRegistrations, getRuntimeTruth } from '../packages/core/src/index.ts'
import { EXECUTOR_HANDLERS } from '../apps/worker/src/providers/provider-executor.ts'

const registrations = getExecutorRegistrations('music_generation')
const registration = registrations.find((entry) => entry.provider === 'genx')
const truth = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'music_generation')

console.log(JSON.stringify({
  registrations,
  callable: Boolean(registration && typeof EXECUTOR_HANDLERS[registration.id] === 'function'),
  truth,
}))
