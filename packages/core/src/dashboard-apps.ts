import { CAPABILITY_BY_KEY, type CapabilityKey } from './capabilities.js'
import { EXECUTOR_REGISTRATIONS } from './executor-registry.js'
import { DURABLE_WORKFLOW_REGISTRATIONS } from './long-form-execution.js'

export interface InternalDashboardAppDefinition {
  appSlug: string
  appName: string
  capabilities: CapabilityKey[]
}

/**
 * The release set is a projection over callable executors and durable workflow
 * registrations. Catalogue membership alone can never add a release candidate.
 */
export function getReleaseCandidateCapabilityKeys(): CapabilityKey[] {
  return [...new Set<CapabilityKey>([
    ...EXECUTOR_REGISTRATIONS.map((registration) => registration.capability),
    ...DURABLE_WORKFLOW_REGISTRATIONS.map((registration) => registration.capability),
  ])]
}

/**
 * Resolve the immutable internal app authority from the canonical Studio mode.
 * The browser never supplies or overrides this value.
 */
export function getDashboardAppSlug(capability: CapabilityKey): string {
  const mode = CAPABILITY_BY_KEY[capability].studioMode
  if (mode === 'longvideo') return 'dashboard-long-form'
  if (mode === 'image') return 'dashboard-image'
  if (mode === 'music') return 'dashboard-music'
  if (mode === 'voice' || mode === 'voice_stt') return 'dashboard-voice'
  if (mode === 'video' || mode === 'image_to_video' || mode === 'video_to_video') return 'dashboard-video'
  if (mode === 'chat' || mode === 'streaming_chat') return 'dashboard-studio'
  return 'dashboard-capability-lab'
}

export function getInternalDashboardApps(): InternalDashboardAppDefinition[] {
  const grouped = new Map<string, CapabilityKey[]>()
  for (const capability of getReleaseCandidateCapabilityKeys()) {
    const appSlug = getDashboardAppSlug(capability)
    const existing = grouped.get(appSlug) ?? []
    existing.push(capability)
    grouped.set(appSlug, existing)
  }
  for (const workflow of DURABLE_WORKFLOW_REGISTRATIONS) {
    const appSlug = getDashboardAppSlug(workflow.capability)
    const existing = grouped.get(appSlug) ?? []
    for (const required of workflow.requiredCapabilities) {
      if (!existing.includes(required)) existing.push(required)
    }
    grouped.set(appSlug, existing)
  }

  return [...grouped.entries()].map(([appSlug, capabilities]) => ({
    appSlug,
    appName: appSlug
      .replace(/^dashboard-/, 'Dashboard ')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    capabilities,
  }))
}

export function canReadSourceArtifactForApp(requestAppSlug: string, artifactAppSlug: string): boolean {
  if (requestAppSlug === artifactAppSlug) return true
  const internal = new Set(getInternalDashboardApps().map((app) => app.appSlug))
  return internal.has(requestAppSlug) && internal.has(artifactAppSlug)
}
