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
  'music.generate': { backendCapability: 'music_generation', missing: false },
  'voice.tts': { backendCapability: 'tts', missing: false },
  'voice.stt': { backendCapability: 'stt', missing: false },
  'avatar.generate': { backendCapability: 'avatar_generation', missing: false },
  'scrape.crawl': { backendCapability: 'brand_scrape', missing: false },
  'rag.ingest': { backendCapability: 'rag_ingest', missing: false },
  'rag.query': { backendCapability: 'rag_search', missing: false },
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
