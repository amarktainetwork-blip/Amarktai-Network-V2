/**
 * Canonical capability definitions — SINGLE SOURCE OF TRUTH.
 *
 * Every capability the platform supports is declared here exactly once.
 * All routing, validation, worker dispatch, and dashboard display
 * import from this module. No other file may duplicate these definitions.
 */

import { z } from 'zod'

// ── Capability Category Enum ──────────────────────────────────────────────────

export const CAPABILITY_CATEGORIES = [
  'text',
  'image',
  'audio',
  'video',
  'code',
  'multimodal',
  'system_ops',
  'scraping',
  'retrieval',
  'document',
] as const

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

// ── Canonical Capability Keys ─────────────────────────────────────────────────

export const CAPABILITY_KEYS = [
  'chat',
  'reasoning',
  'code',
  'summarization',
  'translation',
  'classification',
  'extraction',
  'image_generation',
  'image_edit',
  'image_to_video',
  'long_form_video',
  'tts',
  'stt',
  'video_generation',
  'music_generation',
  'avatar_generation',
  'embeddings',
  'reranking',
  'research',
  'multimodal',
  'tool_use',
  'structured_output',
  'brand_scrape',
  'rag_ingest',
  'rag_search',
  'document_qa',
  'ocr',
  'campaign_generation',
  'social_content_generation',
  'adult_text',
  'adult_image',
  'adult_voice',
  'adult_avatar',
  'adult_video',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

// ── Capability → Category Mapping (canonical) ─────────────────────────────────

export const CAPABILITY_CATEGORY_MAP: Record<CapabilityKey, CapabilityCategory> = {
  chat: 'text',
  reasoning: 'text',
  code: 'code',
  summarization: 'text',
  translation: 'text',
  classification: 'text',
  extraction: 'text',
  image_generation: 'image',
  image_edit: 'image',
  image_to_video: 'video',
  long_form_video: 'video',
  tts: 'audio',
  stt: 'audio',
  video_generation: 'video',
  music_generation: 'audio',
  avatar_generation: 'video',
  embeddings: 'text',
  reranking: 'text',
  research: 'text',
  multimodal: 'multimodal',
  tool_use: 'system_ops',
  structured_output: 'system_ops',
  brand_scrape: 'scraping',
  rag_ingest: 'retrieval',
  rag_search: 'retrieval',
  document_qa: 'document',
  ocr: 'document',
  campaign_generation: 'text',
  social_content_generation: 'text',
  adult_text: 'text',
  adult_image: 'image',
  adult_voice: 'audio',
  adult_avatar: 'video',
  adult_video: 'video',
}

// ── Capability → Prefix Mapping (for job routing) ─────────────────────────────

export const CAPABILITY_PREFIX_MAP: Record<CapabilityKey, string> = {
  chat: 'text',
  reasoning: 'text',
  code: 'text',
  summarization: 'text',
  translation: 'text',
  classification: 'text',
  extraction: 'text',
  image_generation: 'image',
  image_edit: 'image',
  image_to_video: 'video',
  long_form_video: 'video',
  tts: 'voice',
  stt: 'voice',
  video_generation: 'video',
  music_generation: 'voice',
  avatar_generation: 'video',
  embeddings: 'text',
  reranking: 'text',
  research: 'text',
  multimodal: 'text',
  tool_use: 'text',
  structured_output: 'text',
  brand_scrape: 'scrape',
  rag_ingest: 'rag',
  rag_search: 'rag',
  document_qa: 'rag',
  ocr: 'image',
  campaign_generation: 'text',
  social_content_generation: 'text',
  adult_text: 'text',
  adult_image: 'image',
  adult_voice: 'voice',
  adult_avatar: 'video',
  adult_video: 'video',
}

// ── Capability Definition Schema ──────────────────────────────────────────────

export const CapabilityDefinitionSchema = z.object({
  key: z.enum(CAPABILITY_KEYS),
  label: z.string(),
  description: z.string().default(''),
  category: z.enum(CAPABILITY_CATEGORIES),
  enabled: z.boolean().default(true),
  requiredFlags: z.array(z.string()).default([]),
  allowedProviders: z.array(z.string()).default([]),
  inputContract: z.array(z.string()).default([]),
  outputType: z.string().default('text'),
  artifactRequired: z.boolean().default(false),
  policyRequirement: z.string().default('standard'),
  proofStatus: z.enum(['proven', 'unproven']).default('unproven'),
  readyForDashboardExecution: z.boolean().default(false),
})

export type CapabilityDefinition = z.infer<typeof CapabilityDefinitionSchema>

// ── Built-in Capability Catalog ───────────────────────────────────────────────

const CAPABILITY_METADATA: Record<CapabilityKey, Omit<CapabilityDefinition, 'key' | 'category' | 'enabled' | 'allowedProviders' | 'proofStatus' | 'readyForDashboardExecution'>> = {
  chat: { label: 'Chat', description: 'Conversational text generation for external app requests.', requiredFlags: [], inputContract: ['prompt', 'input.context?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  reasoning: { label: 'Reasoning', description: 'Structured analysis and decision support.', requiredFlags: [], inputContract: ['prompt', 'input.constraints?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  code: { label: 'Code', description: 'Code generation, review, and repair planning.', requiredFlags: [], inputContract: ['prompt', 'input.repoContext?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  summarization: { label: 'Summarization', description: 'Condense documents, transcripts, or long prompts.', requiredFlags: [], inputContract: ['prompt', 'input.sourceText'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  translation: { label: 'Translation', description: 'Translate text between requested languages.', requiredFlags: [], inputContract: ['prompt', 'input.sourceLanguage?', 'input.targetLanguage'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  classification: { label: 'Classification', description: 'Classify text, media metadata, or app payloads into controlled labels.', requiredFlags: [], inputContract: ['prompt', 'input.labels[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  extraction: { label: 'Extraction', description: 'Extract structured fields from unstructured text or documents.', requiredFlags: [], inputContract: ['prompt', 'input.schema?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  image_generation: { label: 'Image Generation', description: 'Generate an image artifact from a text prompt.', requiredFlags: [], inputContract: ['prompt', 'input.aspectRatio?', 'input.style?'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_edit: { label: 'Image Edit', description: 'Edit or transform source images.', requiredFlags: [], inputContract: ['prompt', 'input.sourceImage'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_to_video: { label: 'Image To Video', description: 'Animate an image into a video artifact.', requiredFlags: [], inputContract: ['prompt', 'input.sourceImage'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  long_form_video: { label: 'Long-form Video', description: 'Plan and assemble multi-scene video outputs.', requiredFlags: [], inputContract: ['prompt', 'input.script?', 'input.scenes[]?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  tts: { label: 'Text To Speech', description: 'Render text into spoken audio.', requiredFlags: [], inputContract: ['prompt', 'input.voice?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  stt: { label: 'Speech To Text', description: 'Transcribe uploaded or referenced audio.', requiredFlags: [], inputContract: ['input.audio'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  video_generation: { label: 'Video Generation', description: 'Generate a short video artifact from a prompt.', requiredFlags: [], inputContract: ['prompt', 'input.duration?', 'input.aspectRatio?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  music_generation: { label: 'Music Generation', description: 'Create music or song audio artifacts.', requiredFlags: [], inputContract: ['prompt', 'input.genre?', 'input.lyrics?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  avatar_generation: { label: 'Avatar Generation', description: 'Create avatar imagery or avatar video assets.', requiredFlags: [], inputContract: ['prompt', 'input.avatarImage?', 'input.voice?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  embeddings: { label: 'Embeddings', description: 'Create vector embeddings for retrieval workflows.', requiredFlags: [], inputContract: ['input.texts[]'], outputType: 'embedding', artifactRequired: false, policyRequirement: 'standard' },
  reranking: { label: 'Reranking', description: 'Rerank retrieved candidates for relevance.', requiredFlags: [], inputContract: ['prompt', 'input.documents[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  research: { label: 'Research', description: 'Gather and synthesize research with citations once wired.', requiredFlags: [], inputContract: ['prompt', 'input.sources?'], outputType: 'document', artifactRequired: true, policyRequirement: 'standard' },
  multimodal: { label: 'Multimodal', description: 'Handle mixed text, image, audio, or video context.', requiredFlags: [], inputContract: ['prompt', 'input.assets[]'], outputType: 'mixed', artifactRequired: false, policyRequirement: 'standard' },
  tool_use: { label: 'Tool Use', description: 'Allow runtime-selected internal tools under policy gates.', requiredFlags: [], inputContract: ['prompt', 'input.allowedTools?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  structured_output: { label: 'Structured Output', description: 'Return JSON matching a requested schema.', requiredFlags: [], inputContract: ['prompt', 'input.schema'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  brand_scrape: { label: 'Brand Scrape', description: 'Crawl a site and extract brand assets or brand pack data.', requiredFlags: [], inputContract: ['input.url', 'input.depth?'], outputType: 'json', artifactRequired: true, policyRequirement: 'standard' },
  rag_ingest: { label: 'RAG Ingest', description: 'Chunk and index documents for retrieval.', requiredFlags: [], inputContract: ['input.documents[]', 'input.collection?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  rag_search: { label: 'RAG Search', description: 'Query indexed knowledge with citations.', requiredFlags: [], inputContract: ['prompt', 'input.collection?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  document_qa: { label: 'Document Q&A', description: 'Answer questions against supplied documents.', requiredFlags: [], inputContract: ['prompt', 'input.documents[]'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  ocr: { label: 'OCR', description: 'Extract text from images or document scans.', requiredFlags: [], inputContract: ['input.imageOrDocument'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  campaign_generation: { label: 'Campaign Generation', description: 'Generate multi-channel campaign content plans and assets.', requiredFlags: [], inputContract: ['prompt', 'input.brand?', 'input.platforms[]?'], outputType: 'mixed', artifactRequired: true, policyRequirement: 'standard' },
  social_content_generation: { label: 'Social Content Generation', description: 'Generate social post and reel-pack content.', requiredFlags: [], inputContract: ['prompt', 'input.platforms[]?'], outputType: 'mixed', artifactRequired: true, policyRequirement: 'standard' },
  adult_text: { label: 'Adult Text', description: 'Governed adult text capability; not enabled without explicit app and policy gates.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'text', artifactRequired: false, policyRequirement: 'adult_permission' },
  adult_image: { label: 'Adult Image', description: 'Governed adult image capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'image', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_voice: { label: 'Adult Voice', description: 'Governed adult voice capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'audio', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_avatar: { label: 'Adult Avatar', description: 'Governed adult avatar capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'video', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_video: { label: 'Adult Video', description: 'Governed adult video capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'video', artifactRequired: true, policyRequirement: 'adult_permission' },
}

export const CAPABILITY_CATALOG: CapabilityDefinition[] = CAPABILITY_KEYS.map((key) => ({
  key,
  ...CAPABILITY_METADATA[key],
  category: CAPABILITY_CATEGORY_MAP[key],
  enabled: true,
  allowedProviders: [],
  proofStatus: 'unproven',
  readyForDashboardExecution: false,
}))

// ── Validation helpers ────────────────────────────────────────────────────────

export function isValidCapability(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key)
}

export function getCapabilityCategory(key: CapabilityKey): CapabilityCategory {
  return CAPABILITY_CATEGORY_MAP[key]
}

export function getCapabilityPrefix(key: CapabilityKey): string {
  return CAPABILITY_PREFIX_MAP[key]
}
