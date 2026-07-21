import { describe, expect, it } from 'vitest'
import { getExecutorRegistration, type CapabilityKey } from '@amarktai/core'

const SPECIALIST_CAPABILITIES: CapabilityKey[] = [
  'zero_shot_classification',
  'token_classification',
  'fill_mask',
  'table_qa',
]

describe('legacy callable executor registration selection', () => {
  it.each(SPECIALIST_CAPABILITIES)('%s resolves the callable semantic text fallback', (capability) => {
    const registration = getExecutorRegistration(capability, 'deepinfra')
    expect(registration?.id).toBe('deepinfra.text-transform')
    expect(registration?.capabilityMatchMode).toBe('semantic_text_fallback')
  })
})
