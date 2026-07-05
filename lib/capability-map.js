// Maps dashboard-facing mode/type keys to backend canonical capability keys.
// Missing backend keys are explicit so the UI does not pretend they work.

export const DASHBOARD_TO_BACKEND_CAPABILITY_MAP = {
  'text.chat': { backendCapability: 'chat', missing: false },
  'text.reasoning': { backendCapability: 'reasoning', missing: false },
  'text.code': { backendCapability: 'code', missing: false },
  'image.generate': { backendCapability: 'image_generation', missing: false },
  'image.edit': { backendCapability: 'image_edit', missing: false },
  'video.generate': { backendCapability: 'video_generation', missing: false },
  'video.longform': {
    backendCapability: null,
    missing: true,
    expectedBackendKey: 'long_form_video',
    note: 'Backend canonical capabilities do not currently include long_form_video.',
  },
  'video.image_to_video': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'image_to_video',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'video.edit': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'video_edit',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'music.generate': { backendCapability: 'music_generation', missing: false },
  'voice.tts': { backendCapability: 'tts', missing: false },
  'voice.stt': { backendCapability: 'stt', missing: false },
  'avatar.generate': { backendCapability: 'avatar_generation', missing: false },
  'scrape.crawl': { backendCapability: 'brand_scrape', missing: false },
  'campaign.generate': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'campaign_generation',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'social.reel_pack': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'social_reel_pack',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'rag.ingest': { backendCapability: 'rag_ingest', missing: false },
  'rag.query': { backendCapability: 'rag_search', missing: false },
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
  research: {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'research',
    note: 'Frontend Studio capability planned for backend wiring.',
  },
  'uncensored.text': {
    backendCapability: null,
    missing: true,
    plannedBackendKey: 'uncensored_text',
    gated: true,
    providerId: 'deepinfra',
    note: 'Planned gated DeepInfra lane. Backend canonical capability and gating are not implemented yet.',
  },
}

export function getBackendCapability(dashboardType) {
  return DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardType] ?? {
    backendCapability: null,
    missing: true,
    note: `No dashboard capability mapping exists for ${dashboardType}.`,
  }
}
