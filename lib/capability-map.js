import { CAPABILITY_CATALOG } from '../packages/core/src/capabilities.ts'

const canonicalMappings = Object.fromEntries(
  CAPABILITY_CATALOG.map((capability) => [capability.dashboardType, {
    backendCapability: capability.key,
    missing: false,
    governed: capability.governed,
    adult: capability.adult,
  }]),
)

// Frontend-only modes remain explicit and cannot be mistaken for registered
// backend capabilities.
const frontendOnlyMappings = {
  'video.edit': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'video_edit',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'multimodal.request': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'multimodal',
    note: 'No canonical backend capability exists for this frontend mode.',
  },
  'app.request': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'app_request',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'agent.task': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'agent_task',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'workflow.automation': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'workflow_automation',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'uncensored.text': {
    backendCapability: 'adult_text',
    missing: false,
    governed: true,
    adult: true,
    note: 'Alias for the governed adult_text capability.',
  },
}

export const DASHBOARD_TO_BACKEND_CAPABILITY_MAP = {
  ...canonicalMappings,
  ...frontendOnlyMappings,
}

export function getBackendCapability(dashboardType) {
  return DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardType] ?? {
    backendCapability: null,
    missing: true,
    note: `No dashboard capability mapping exists for ${dashboardType}.`,
  }
}
