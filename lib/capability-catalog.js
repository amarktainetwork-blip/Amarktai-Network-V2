import { CAPABILITY_CATALOG } from '../packages/core/src/capabilities.ts'

export const TARGET_CAPABILITY_CATALOG = CAPABILITY_CATALOG

export function groupedCapabilities() {
  return TARGET_CAPABILITY_CATALOG.reduce((groups, capability) => {
    const existing = groups.find((group) => group.family === capability.family)
    if (existing) {
      existing.items.push(capability)
    } else {
      groups.push({ family: capability.family, items: [capability] })
    }
    return groups
  }, [])
}
