import type { StructuredOutputMode } from './executor-registry.js'

export interface StructuredOutputContract {
  supportedModes: StructuredOutputMode[]
  selectedMode: StructuredOutputMode
  validationMode: 'provider_json_schema' | 'provider_json_object_local_schema' | 'prompt_json_local_schema'
  providerEnforcedSchema: boolean
}

export function resolveStructuredOutputContract(modes: readonly string[] | undefined): StructuredOutputContract {
  const supportedModes = [...new Set((modes ?? []).filter((mode): mode is StructuredOutputMode => ['none', 'json_object', 'json_schema'].includes(mode)))]
  if (supportedModes.includes('json_schema')) return { supportedModes, selectedMode: 'json_schema', validationMode: 'provider_json_schema', providerEnforcedSchema: true }
  if (supportedModes.includes('json_object')) return { supportedModes, selectedMode: 'json_object', validationMode: 'provider_json_object_local_schema', providerEnforcedSchema: false }
  return { supportedModes: supportedModes.length ? supportedModes : ['none'], selectedMode: 'none', validationMode: 'prompt_json_local_schema', providerEnforcedSchema: false }
}

export function structuredResponseFormat(contract: StructuredOutputContract, name: string, schema: Record<string, unknown>): Record<string, unknown> | undefined {
  if (contract.selectedMode === 'json_schema') return { type: 'json_schema', json_schema: { name, strict: true, schema } }
  if (contract.selectedMode === 'json_object') return { type: 'json_object' }
  return undefined
}

export function downgradeStructuredOutput(contract: StructuredOutputContract): StructuredOutputContract | null {
  if (contract.selectedMode === 'json_schema' && contract.supportedModes.includes('json_object')) {
    return { ...contract, selectedMode: 'json_object', validationMode: 'provider_json_object_local_schema', providerEnforcedSchema: false }
  }
  if (contract.selectedMode !== 'none') {
    return { ...contract, selectedMode: 'none', validationMode: 'prompt_json_local_schema', providerEnforcedSchema: false }
  }
  return null
}
