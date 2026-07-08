// Maps dashboard-facing mode/type keys to backend canonical capability keys.
// Missing backend keys are explicit so the UI does not pretend they work.

export const DASHBOARD_TO_BACKEND_CAPABILITY_MAP = {
  'text.chat': { backendCapability: 'chat', missing: false },
  'text.reasoning': { backendCapability: 'reasoning', missing: false },
  'text.code': { backendCapability: 'code', missing: false },
  'text.summarization': { backendCapability: 'summarization', missing: false },
  'text.translation': { backendCapability: 'translation', missing: false },
  'text.classification': { backendCapability: 'classification', missing: false },
  'text.extraction': { backendCapability: 'extraction', missing: false },
  'text.structured_output': { backendCapability: 'structured_output', missing: false },
  'text.tool_use': { backendCapability: 'tool_use', missing: false },
  'image.generate': { backendCapability: 'image_generation', missing: false },
  'image.edit': { backendCapability: 'image_edit', missing: false },
  'video.generate': { backendCapability: 'video_generation', missing: false },
  'video.longform': { backendCapability: 'long_form_video', missing: false },
  'video.image_to_video': { backendCapability: 'image_to_video', missing: false },
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
    backendCapability: 'campaign_generation',
    missing: false,
  },
  'social.reel_pack': {
    backendCapability: 'social_content_generation',
    missing: false,
  },
  'rag.ingest': { backendCapability: 'rag_ingest', missing: false },
  'rag.query': { backendCapability: 'rag_search', missing: false },
  'knowledge.embeddings': { backendCapability: 'embeddings', missing: false },
  'knowledge.reranking': { backendCapability: 'reranking', missing: false },
  'document.qa': { backendCapability: 'document_qa', missing: false },
  'document.ocr': { backendCapability: 'ocr', missing: false },
  'multimodal.request': { backendCapability: 'multimodal', missing: false },
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
    backendCapability: 'research',
    missing: false,
  },
  'uncensored.text': {
    backendCapability: 'adult_text',
    missing: false,
    gated: true,
    providerId: 'deepinfra',
    note: 'Adult governed text capability exists in the catalog but is not proof-ready.',
  },
  'adult.text': { backendCapability: 'adult_text', missing: false, adult: true },
  'adult.image': { backendCapability: 'adult_image', missing: false, adult: true },
  'adult.voice': { backendCapability: 'adult_voice', missing: false, adult: true },
  'adult.avatar': { backendCapability: 'adult_avatar', missing: false, adult: true },
  'adult.video': { backendCapability: 'adult_video', missing: false, adult: true },
}

export function getBackendCapability(dashboardType) {
  return DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardType] ?? {
    backendCapability: null,
    missing: true,
    note: `No dashboard capability mapping exists for ${dashboardType}.`,
  }
}
