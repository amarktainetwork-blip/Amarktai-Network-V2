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
  'three_d',
] as const

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

// ── Canonical Capability Keys ─────────────────────────────────────────────────

export const CAPABILITY_KEYS = [
  'chat',
  'streaming_chat',
  'reasoning',
  'code',
  'summarization',
  'translation',
  'question_answering',
  'classification',
  'zero_shot_classification',
  'extraction',
  'token_classification',
  'fill_mask',
  'feature_extraction',
  'sentence_similarity',
  'table_qa',
  'structured_output',
  'tool_use',
  'image_generation',
  'image_edit',
  'image_to_image',
  'image_upscale',
  'image_classification',
  'object_detection',
  'image_segmentation',
  'depth_estimation',
  'keypoint_detection',
  'visual_question_answering',
  'document_qa',
  'ocr',
  'zero_shot_object_detection',
  'mask_generation',
  'visual_document_retrieval',
  'video_generation',
  'image_to_video',
  'video_to_video',
  'long_form_video',
  'video_understanding',
  'video_classification',
  'storyboard_generation',
  'subtitle_generation',
  'lip_sync',
  'avatar_generation',
  'text_to_3d',
  'image_to_3d',
  'tts',
  'stt',
  'voice_clone',
  'voice_conversion',
  'text_to_audio',
  'audio_to_audio',
  'audio_classification',
  'voice_activity_detection',
  'music_generation',
  'song_generation',
  'embeddings',
  'reranking',
  'rag_ingest',
  'rag_search',
  'research',
  'brand_scrape',
  'document_ingest',
  'campaign_generation',
  'social_content_generation',
  'adult_text',
  'adult_image',
  'adult_voice',
  'adult_avatar',
  'adult_video',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

/** Canonical ModelRegistryEntry support field for each capability. */
export const CAPABILITY_FIELD_MAP: Record<CapabilityKey, string> = {
  chat: 'supportsChat',
  streaming_chat: 'supportsChat',
  reasoning: 'supportsReasoning',
  code: 'supportsCode',
  summarization: 'supportsText',
  translation: 'supportsText',
  question_answering: 'supportsText',
  classification: 'supportsText',
  zero_shot_classification: 'supportsText',
  extraction: 'supportsText',
  token_classification: 'supportsText',
  fill_mask: 'supportsText',
  feature_extraction: 'supportsText',
  sentence_similarity: 'supportsText',
  table_qa: 'supportsText',
  structured_output: 'supportsStructuredOutput',
  tool_use: 'supportsToolUse',
  image_generation: 'supportsImageGeneration',
  image_edit: 'supportsImageEditing',
  image_to_image: 'supportsImageEditing',
  image_upscale: 'supportsImageEditing',
  image_classification: 'supportsVision',
  object_detection: 'supportsVision',
  image_segmentation: 'supportsVision',
  depth_estimation: 'supportsVision',
  keypoint_detection: 'supportsVision',
  visual_question_answering: 'supportsVision',
  document_qa: 'supportsText',
  ocr: 'supportsVision',
  zero_shot_object_detection: 'supportsVision',
  mask_generation: 'supportsVision',
  visual_document_retrieval: 'supportsVision',
  video_generation: 'supportsVideoGeneration',
  image_to_video: 'supportsVideoGeneration',
  video_to_video: 'supportsVideoGeneration',
  long_form_video: 'supportsVideoGeneration',
  video_understanding: 'supportsVision',
  video_classification: 'supportsVision',
  storyboard_generation: 'supportsVision',
  subtitle_generation: 'supportsTts',
  lip_sync: 'supportsVideoGeneration',
  avatar_generation: 'supportsVideoGeneration',
  text_to_3d: 'supportsVision',
  image_to_3d: 'supportsVision',
  tts: 'supportsTts',
  stt: 'supportsStt',
  voice_clone: 'supportsTts',
  voice_conversion: 'supportsTts',
  text_to_audio: 'supportsTts',
  audio_to_audio: 'supportsTts',
  audio_classification: 'supportsStt',
  voice_activity_detection: 'supportsStt',
  music_generation: 'supportsMusicGeneration',
  song_generation: 'supportsMusicGeneration',
  embeddings: 'supportsEmbeddings',
  reranking: 'supportsReranking',
  rag_ingest: 'supportsText',
  rag_search: 'supportsText',
  research: 'supportsResearch',
  brand_scrape: 'supportsText',
  document_ingest: 'supportsText',
  campaign_generation: 'supportsText',
  social_content_generation: 'supportsText',
  adult_text: 'supportsChat',
  adult_image: 'supportsImageGeneration',
  adult_voice: 'supportsTts',
  adult_avatar: 'supportsVideoGeneration',
  adult_video: 'supportsVideoGeneration',
}

// ── Capability → Category Mapping (canonical) ─────────────────────────────────

export const CAPABILITY_CATEGORY_MAP: Record<CapabilityKey, CapabilityCategory> = {
  // Language and Agent
  chat: 'text',
  streaming_chat: 'text',
  reasoning: 'text',
  code: 'code',
  summarization: 'text',
  translation: 'text',
  question_answering: 'text',
  classification: 'text',
  zero_shot_classification: 'text',
  extraction: 'text',
  token_classification: 'text',
  fill_mask: 'text',
  feature_extraction: 'text',
  sentence_similarity: 'text',
  table_qa: 'text',
  structured_output: 'system_ops',
  tool_use: 'system_ops',
  // Image and Vision
  image_generation: 'image',
  image_edit: 'image',
  image_to_image: 'image',
  image_upscale: 'image',
  image_classification: 'image',
  object_detection: 'image',
  image_segmentation: 'image',
  depth_estimation: 'image',
  keypoint_detection: 'image',
  visual_question_answering: 'image',
  document_qa: 'document',
  ocr: 'document',
  zero_shot_object_detection: 'image',
  mask_generation: 'image',
  visual_document_retrieval: 'image',
  // Video, Avatar and 3D
  video_generation: 'video',
  image_to_video: 'video',
  video_to_video: 'video',
  long_form_video: 'video',
  video_understanding: 'video',
  video_classification: 'video',
  storyboard_generation: 'video',
  subtitle_generation: 'video',
  lip_sync: 'video',
  avatar_generation: 'video',
  text_to_3d: 'three_d',
  image_to_3d: 'three_d',
  // Audio, Voice and Music
  tts: 'audio',
  stt: 'audio',
  voice_clone: 'audio',
  voice_conversion: 'audio',
  text_to_audio: 'audio',
  audio_to_audio: 'audio',
  audio_classification: 'audio',
  voice_activity_detection: 'audio',
  music_generation: 'audio',
  song_generation: 'audio',
  // Retrieval, Research and Business
  embeddings: 'text',
  reranking: 'text',
  rag_ingest: 'retrieval',
  rag_search: 'retrieval',
  research: 'text',
  brand_scrape: 'scraping',
  document_ingest: 'document',
  campaign_generation: 'text',
  social_content_generation: 'text',
  // Governed Adult
  adult_text: 'text',
  adult_image: 'image',
  adult_voice: 'audio',
  adult_avatar: 'video',
  adult_video: 'video',
}

// ── Capability → Prefix Mapping (for job routing) ─────────────────────────────

export const CAPABILITY_PREFIX_MAP: Record<CapabilityKey, string> = {
  // Language and Agent
  chat: 'text',
  streaming_chat: 'text',
  reasoning: 'text',
  code: 'text',
  summarization: 'text',
  translation: 'text',
  question_answering: 'text',
  classification: 'text',
  zero_shot_classification: 'text',
  extraction: 'text',
  token_classification: 'text',
  fill_mask: 'text',
  feature_extraction: 'text',
  sentence_similarity: 'text',
  table_qa: 'text',
  structured_output: 'text',
  tool_use: 'text',
  // Image and Vision
  image_generation: 'image',
  image_edit: 'image',
  image_to_image: 'image',
  image_upscale: 'image',
  image_classification: 'image',
  object_detection: 'image',
  image_segmentation: 'image',
  depth_estimation: 'image',
  keypoint_detection: 'image',
  visual_question_answering: 'image',
  document_qa: 'rag',
  ocr: 'image',
  zero_shot_object_detection: 'image',
  mask_generation: 'image',
  visual_document_retrieval: 'image',
  // Video, Avatar and 3D
  video_generation: 'video',
  image_to_video: 'video',
  video_to_video: 'video',
  long_form_video: 'video',
  video_understanding: 'video',
  video_classification: 'video',
  storyboard_generation: 'video',
  subtitle_generation: 'video',
  lip_sync: 'video',
  avatar_generation: 'video',
  text_to_3d: 'three_d',
  image_to_3d: 'three_d',
  // Audio, Voice and Music
  tts: 'voice',
  stt: 'voice',
  voice_clone: 'voice',
  voice_conversion: 'voice',
  text_to_audio: 'voice',
  audio_to_audio: 'voice',
  audio_classification: 'voice',
  voice_activity_detection: 'voice',
  music_generation: 'voice',
  song_generation: 'voice',
  // Retrieval, Research and Business
  embeddings: 'text',
  reranking: 'text',
  rag_ingest: 'rag',
  rag_search: 'rag',
  research: 'text',
  brand_scrape: 'scrape',
  document_ingest: 'rag',
  campaign_generation: 'text',
  social_content_generation: 'text',
  // Governed Adult
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
  inputContractReference: z.string(),
  outputContractReference: z.string(),
  outputType: z.string().default('text'),
  artifactType: z.string().nullable().default(null),
  artifactRequired: z.boolean().default(false),
  orchestrated: z.boolean().default(false),
  governed: z.boolean().default(false),
  adult: z.boolean().default(false),
  requiresSourceArtifact: z.boolean().default(false),
  requiresQueueExecution: z.boolean().default(true),
  policyRequirement: z.string().default('standard'),
  family: z.string().default('Unsorted'),
  schemaKey: z.string().default(''),
  studioMode: z.string().default(''),
  dashboardType: z.string().default(''),
  proofStatus: z.enum(['proven', 'unproven']).default('unproven'),
  readyForDashboardExecution: z.boolean().default(false),
})

export type CapabilityDefinition = z.infer<typeof CapabilityDefinitionSchema>

// ── Built-in Capability Catalog ───────────────────────────────────────────────

const CAPABILITY_METADATA: Record<CapabilityKey, Omit<CapabilityDefinition,
  | 'key'
  | 'category'
  | 'enabled'
  | 'allowedProviders'
  | 'family'
  | 'schemaKey'
  | 'studioMode'
  | 'dashboardType'
  | 'inputContractReference'
  | 'outputContractReference'
  | 'artifactType'
  | 'orchestrated'
  | 'governed'
  | 'adult'
  | 'requiresSourceArtifact'
  | 'requiresQueueExecution'
  | 'proofStatus'
  | 'readyForDashboardExecution'
>> = {
  // Language and Agent
  chat: { label: 'Chat', description: 'Conversational text generation for external app requests.', requiredFlags: [], inputContract: ['prompt', 'input.context?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  streaming_chat: { label: 'Streaming Chat', description: 'Streaming conversational text generation with SSE/WebSocket.', requiredFlags: [], inputContract: ['prompt', 'input.context?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  reasoning: { label: 'Reasoning', description: 'Structured analysis and decision support.', requiredFlags: [], inputContract: ['prompt', 'input.constraints?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  code: { label: 'Code', description: 'Code generation, review, and repair planning.', requiredFlags: [], inputContract: ['prompt', 'input.repoContext?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  summarization: { label: 'Summarization', description: 'Condense documents, transcripts, or long prompts.', requiredFlags: [], inputContract: ['prompt', 'input.sourceText'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  translation: { label: 'Translation', description: 'Translate text between requested languages.', requiredFlags: [], inputContract: ['prompt', 'input.sourceLanguage?', 'input.targetLanguage'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  question_answering: { label: 'Question Answering', description: 'Answer questions from context or documents.', requiredFlags: [], inputContract: ['prompt', 'input.context?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  classification: { label: 'Classification', description: 'Classify text, media metadata, or app payloads into controlled labels.', requiredFlags: [], inputContract: ['prompt', 'input.labels[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  zero_shot_classification: { label: 'Zero-Shot Classification', description: 'Classify text into arbitrary labels without training.', requiredFlags: [], inputContract: ['prompt', 'input.labels[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  extraction: { label: 'Extraction', description: 'Extract structured fields from unstructured text or documents.', requiredFlags: [], inputContract: ['prompt', 'input.schema?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  token_classification: { label: 'Token Classification', description: 'Classify individual tokens in text (NER, POS).', requiredFlags: [], inputContract: ['prompt', 'input.schema?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  fill_mask: { label: 'Fill Mask', description: 'Predict masked tokens in text.', requiredFlags: [], inputContract: ['prompt'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  feature_extraction: { label: 'Feature Extraction', description: 'Extract features from text or media.', requiredFlags: [], inputContract: ['input.text', 'input.media?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  sentence_similarity: { label: 'Sentence Similarity', description: 'Compute similarity between sentences.', requiredFlags: [], inputContract: ['input.sentences[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  table_qa: { label: 'Table Q&A', description: 'Answer questions about tabular data.', requiredFlags: [], inputContract: ['prompt', 'input.table'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  structured_output: { label: 'Structured Output', description: 'Return JSON matching a requested schema.', requiredFlags: [], inputContract: ['prompt', 'input.schema'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  tool_use: { label: 'Tool Use', description: 'Allow runtime-selected internal tools under policy gates.', requiredFlags: [], inputContract: ['prompt', 'input.allowedTools?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  // Image and Vision
  image_generation: { label: 'Image Generation', description: 'Generate an image artifact from a text prompt.', requiredFlags: [], inputContract: ['prompt', 'input.aspectRatio?', 'input.style?'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_edit: { label: 'Image Edit', description: 'Edit or transform source images.', requiredFlags: [], inputContract: ['prompt', 'input.sourceImage'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_to_image: { label: 'Image To Image', description: 'Transform an image into another image.', requiredFlags: [], inputContract: ['prompt', 'input.sourceImage'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_upscale: { label: 'Image Upscale', description: 'Upscale image resolution.', requiredFlags: [], inputContract: ['input.sourceImage', 'input.scale?'], outputType: 'image', artifactRequired: true, policyRequirement: 'standard' },
  image_classification: { label: 'Image Classification', description: 'Classify images into categories.', requiredFlags: [], inputContract: ['input.image', 'input.labels?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  object_detection: { label: 'Object Detection', description: 'Detect objects in images.', requiredFlags: [], inputContract: ['input.image'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  image_segmentation: { label: 'Image Segmentation', description: 'Segment images into regions.', requiredFlags: [], inputContract: ['input.image'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  depth_estimation: { label: 'Depth Estimation', description: 'Estimate depth from images.', requiredFlags: [], inputContract: ['input.image'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  keypoint_detection: { label: 'Keypoint Detection', description: 'Detect keypoints in images.', requiredFlags: [], inputContract: ['input.image'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  visual_question_answering: { label: 'Visual Q&A', description: 'Answer questions about images.', requiredFlags: [], inputContract: ['prompt', 'input.image'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  document_qa: { label: 'Document Q&A', description: 'Answer questions against supplied documents.', requiredFlags: [], inputContract: ['prompt', 'input.documents[]'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  ocr: { label: 'OCR', description: 'Extract text from images or document scans.', requiredFlags: [], inputContract: ['input.imageOrDocument'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  zero_shot_object_detection: { label: 'Zero-Shot Object Detection', description: 'Detect objects by text description.', requiredFlags: [], inputContract: ['input.image', 'input.labels[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  mask_generation: { label: 'Mask Generation', description: 'Generate masks for objects in images.', requiredFlags: [], inputContract: ['input.image', 'input.labels?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  visual_document_retrieval: { label: 'Visual Document Retrieval', description: 'Retrieve documents by visual similarity.', requiredFlags: [], inputContract: ['input.image', 'input.collection?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  // Video, Avatar and 3D
  video_generation: { label: 'Video Generation', description: 'Generate a short video artifact from a prompt.', requiredFlags: [], inputContract: ['prompt', 'input.duration?', 'input.aspectRatio?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  image_to_video: { label: 'Image To Video', description: 'Animate an image into a video artifact.', requiredFlags: [], inputContract: ['prompt', 'input.sourceImage'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  video_to_video: { label: 'Video To Video', description: 'Transform a video into another video.', requiredFlags: [], inputContract: ['prompt', 'input.sourceVideo'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  long_form_video: { label: 'Long-form Video', description: 'Plan and assemble multi-scene video outputs.', requiredFlags: [], inputContract: ['prompt', 'input.script?', 'input.scenes[]?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  video_understanding: { label: 'Video Understanding', description: 'Analyze and understand video content.', requiredFlags: [], inputContract: ['input.video', 'input.prompt?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  video_classification: { label: 'Video Classification', description: 'Classify video content.', requiredFlags: [], inputContract: ['input.video', 'input.labels?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  storyboard_generation: { label: 'Storyboard Generation', description: 'Generate storyboards from scripts.', requiredFlags: [], inputContract: ['prompt', 'input.script'], outputType: 'json', artifactRequired: true, policyRequirement: 'standard' },
  subtitle_generation: { label: 'Subtitle Generation', description: 'Generate subtitles from audio/video.', requiredFlags: [], inputContract: ['input.video', 'input.format?'], outputType: 'text', artifactRequired: true, policyRequirement: 'standard' },
  lip_sync: { label: 'Lip Sync', description: 'Sync lip movements to audio.', requiredFlags: [], inputContract: ['input.video', 'input.audio'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  avatar_generation: { label: 'Avatar Generation', description: 'Create avatar imagery or avatar video assets.', requiredFlags: [], inputContract: ['prompt', 'input.avatarImage?', 'input.voice?'], outputType: 'video', artifactRequired: true, policyRequirement: 'standard' },
  text_to_3d: { label: 'Text To 3D', description: 'Generate 3D models from text.', requiredFlags: [], inputContract: ['prompt'], outputType: 'three_d', artifactRequired: true, policyRequirement: 'standard' },
  image_to_3d: { label: 'Image To 3D', description: 'Generate 3D models from images.', requiredFlags: [], inputContract: ['input.sourceImage'], outputType: 'three_d', artifactRequired: true, policyRequirement: 'standard' },
  // Audio, Voice and Music
  tts: { label: 'Text To Speech', description: 'Render text into spoken audio.', requiredFlags: [], inputContract: ['prompt', 'input.voice?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  stt: { label: 'Speech To Text', description: 'Transcribe uploaded or referenced audio.', requiredFlags: [], inputContract: ['input.audio'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  voice_clone: { label: 'Voice Clone', description: 'Clone a voice from samples.', requiredFlags: [], inputContract: ['input.samples[]', 'input.text'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  voice_conversion: { label: 'Voice Conversion', description: 'Convert voice characteristics.', requiredFlags: [], inputContract: ['input.audio', 'input.targetVoice'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  text_to_audio: { label: 'Text To Audio', description: 'Generate audio from text.', requiredFlags: [], inputContract: ['prompt'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  audio_to_audio: { label: 'Audio To Audio', description: 'Transform audio (enhance, denoise, separate).', requiredFlags: [], inputContract: ['input.audio', 'input.effect?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  audio_classification: { label: 'Audio Classification', description: 'Classify audio content.', requiredFlags: [], inputContract: ['input.audio', 'input.labels?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  voice_activity_detection: { label: 'Voice Activity Detection', description: 'Detect speech segments in audio.', requiredFlags: [], inputContract: ['input.audio'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  music_generation: { label: 'Music Generation', description: 'Create music or song audio artifacts.', requiredFlags: [], inputContract: ['prompt', 'input.genre?', 'input.lyrics?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  song_generation: { label: 'Song Generation', description: 'Generate complete songs with vocals.', requiredFlags: [], inputContract: ['prompt', 'input.lyrics', 'input.genre?'], outputType: 'audio', artifactRequired: true, policyRequirement: 'standard' },
  // Retrieval, Research and Business
  embeddings: { label: 'Embeddings', description: 'Create vector embeddings for retrieval workflows.', requiredFlags: [], inputContract: ['input.texts[]'], outputType: 'embedding', artifactRequired: false, policyRequirement: 'standard' },
  reranking: { label: 'Reranking', description: 'Rerank retrieved candidates for relevance.', requiredFlags: [], inputContract: ['prompt', 'input.documents[]'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  rag_ingest: { label: 'RAG Ingest', description: 'Chunk and index documents for retrieval.', requiredFlags: [], inputContract: ['input.documents[]', 'input.collection?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  rag_search: { label: 'RAG Search', description: 'Query indexed knowledge with citations.', requiredFlags: [], inputContract: ['prompt', 'input.collection?'], outputType: 'text', artifactRequired: false, policyRequirement: 'standard' },
  research: { label: 'Research', description: 'Gather and synthesize research with citations once wired.', requiredFlags: [], inputContract: ['prompt', 'input.sources?'], outputType: 'document', artifactRequired: true, policyRequirement: 'standard' },
  brand_scrape: { label: 'Brand Scrape', description: 'Crawl a site and extract brand assets or brand pack data.', requiredFlags: [], inputContract: ['input.url', 'input.depth?'], outputType: 'json', artifactRequired: true, policyRequirement: 'standard' },
  document_ingest: { label: 'Document Ingest', description: 'Ingest documents for retrieval.', requiredFlags: [], inputContract: ['input.documents[]', 'input.collection?'], outputType: 'json', artifactRequired: false, policyRequirement: 'standard' },
  campaign_generation: { label: 'Campaign Generation', description: 'Generate multi-channel campaign content plans and assets.', requiredFlags: [], inputContract: ['prompt', 'input.brand?', 'input.platforms[]?'], outputType: 'mixed', artifactRequired: true, policyRequirement: 'standard' },
  social_content_generation: { label: 'Social Content Generation', description: 'Generate social post and reel-pack content.', requiredFlags: [], inputContract: ['prompt', 'input.platforms[]?'], outputType: 'mixed', artifactRequired: true, policyRequirement: 'standard' },
  // Governed Adult
  adult_text: { label: 'Adult Text', description: 'Governed adult text capability; not enabled without explicit app and policy gates.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'text', artifactRequired: false, policyRequirement: 'adult_permission' },
  adult_image: { label: 'Adult Image', description: 'Governed adult image capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'image', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_voice: { label: 'Adult Voice', description: 'Governed adult voice capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'audio', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_avatar: { label: 'Adult Avatar', description: 'Governed adult avatar capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'video', artifactRequired: true, policyRequirement: 'adult_permission' },
  adult_video: { label: 'Adult Video', description: 'Governed adult video capability; requires explicit permission and proof.', requiredFlags: ['adult_permission'], inputContract: ['prompt', 'input.ageGateProof'], outputType: 'video', artifactRequired: true, policyRequirement: 'adult_permission' },
}

const CAPABILITY_DISPLAY_METADATA: Record<CapabilityKey, Pick<CapabilityDefinition, 'family' | 'schemaKey' | 'studioMode' | 'dashboardType'>> = {
  // Language and Agent
  chat: { family: 'Language', schemaKey: 'chat', studioMode: 'chat', dashboardType: 'text.chat' },
  streaming_chat: { family: 'Language', schemaKey: 'streaming_chat', studioMode: 'streaming_chat', dashboardType: 'text.streaming_chat' },
  reasoning: { family: 'Language', schemaKey: 'reasoning', studioMode: 'reasoning', dashboardType: 'text.reasoning' },
  code: { family: 'Language', schemaKey: 'code', studioMode: 'code', dashboardType: 'text.code' },
  summarization: { family: 'Language', schemaKey: 'summarization', studioMode: 'summarization', dashboardType: 'text.summarization' },
  translation: { family: 'Language', schemaKey: 'translation', studioMode: 'translation', dashboardType: 'text.translation' },
  question_answering: { family: 'Language', schemaKey: 'question_answering', studioMode: 'question_answering', dashboardType: 'text.question_answering' },
  classification: { family: 'Language', schemaKey: 'classification', studioMode: 'classification', dashboardType: 'text.classification' },
  zero_shot_classification: { family: 'Language', schemaKey: 'zero_shot_classification', studioMode: 'zero_shot_classification', dashboardType: 'text.zero_shot_classification' },
  extraction: { family: 'Language', schemaKey: 'extraction', studioMode: 'extraction', dashboardType: 'text.extraction' },
  token_classification: { family: 'Language', schemaKey: 'token_classification', studioMode: 'token_classification', dashboardType: 'text.token_classification' },
  fill_mask: { family: 'Language', schemaKey: 'fill_mask', studioMode: 'fill_mask', dashboardType: 'text.fill_mask' },
  feature_extraction: { family: 'Language', schemaKey: 'feature_extraction', studioMode: 'feature_extraction', dashboardType: 'text.feature_extraction' },
  sentence_similarity: { family: 'Language', schemaKey: 'sentence_similarity', studioMode: 'sentence_similarity', dashboardType: 'text.sentence_similarity' },
  table_qa: { family: 'Language', schemaKey: 'table_qa', studioMode: 'table_qa', dashboardType: 'text.table_qa' },
  structured_output: { family: 'Language', schemaKey: 'structured_output', studioMode: 'structured_output', dashboardType: 'text.structured_output' },
  tool_use: { family: 'Language', schemaKey: 'tool_use', studioMode: 'tool_use', dashboardType: 'text.tool_use' },
  // Image and Vision
  image_generation: { family: 'Image', schemaKey: 'image', studioMode: 'image', dashboardType: 'image.generate' },
  image_edit: { family: 'Image', schemaKey: 'image_edit', studioMode: 'image_edit', dashboardType: 'image.edit' },
  image_to_image: { family: 'Image', schemaKey: 'image_to_image', studioMode: 'image_to_image', dashboardType: 'image.to_image' },
  image_upscale: { family: 'Image', schemaKey: 'image_upscale', studioMode: 'image_upscale', dashboardType: 'image.upscale' },
  image_classification: { family: 'Image', schemaKey: 'image_classification', studioMode: 'image_classification', dashboardType: 'image.classification' },
  object_detection: { family: 'Image', schemaKey: 'object_detection', studioMode: 'object_detection', dashboardType: 'image.object_detection' },
  image_segmentation: { family: 'Image', schemaKey: 'image_segmentation', studioMode: 'image_segmentation', dashboardType: 'image.segmentation' },
  depth_estimation: { family: 'Image', schemaKey: 'depth_estimation', studioMode: 'depth_estimation', dashboardType: 'image.depth_estimation' },
  keypoint_detection: { family: 'Image', schemaKey: 'keypoint_detection', studioMode: 'keypoint_detection', dashboardType: 'image.keypoint_detection' },
  visual_question_answering: { family: 'Image', schemaKey: 'visual_question_answering', studioMode: 'visual_question_answering', dashboardType: 'image.vqa' },
  document_qa: { family: 'Document', schemaKey: 'document_qa', studioMode: 'document_qa', dashboardType: 'document.qa' },
  ocr: { family: 'Document', schemaKey: 'ocr', studioMode: 'ocr', dashboardType: 'document.ocr' },
  zero_shot_object_detection: { family: 'Image', schemaKey: 'zero_shot_object_detection', studioMode: 'zero_shot_object_detection', dashboardType: 'image.zero_shot_detection' },
  mask_generation: { family: 'Image', schemaKey: 'mask_generation', studioMode: 'mask_generation', dashboardType: 'image.mask_generation' },
  visual_document_retrieval: { family: 'Image', schemaKey: 'visual_document_retrieval', studioMode: 'visual_document_retrieval', dashboardType: 'image.doc_retrieval' },
  // Video, Avatar and 3D
  video_generation: { family: 'Video', schemaKey: 'video', studioMode: 'video', dashboardType: 'video.generate' },
  image_to_video: { family: 'Video', schemaKey: 'image_to_video', studioMode: 'image_to_video', dashboardType: 'video.image_to_video' },
  video_to_video: { family: 'Video', schemaKey: 'video_to_video', studioMode: 'video_to_video', dashboardType: 'video.to_video' },
  long_form_video: { family: 'Video', schemaKey: 'longvideo', studioMode: 'longvideo', dashboardType: 'video.longform' },
  video_understanding: { family: 'Video', schemaKey: 'video_understanding', studioMode: 'video_understanding', dashboardType: 'video.understanding' },
  video_classification: { family: 'Video', schemaKey: 'video_classification', studioMode: 'video_classification', dashboardType: 'video.classification' },
  storyboard_generation: { family: 'Video', schemaKey: 'storyboard_generation', studioMode: 'storyboard_generation', dashboardType: 'video.storyboard' },
  subtitle_generation: { family: 'Video', schemaKey: 'subtitle_generation', studioMode: 'subtitle_generation', dashboardType: 'video.subtitle' },
  lip_sync: { family: 'Video', schemaKey: 'lip_sync', studioMode: 'lip_sync', dashboardType: 'video.lip_sync' },
  avatar_generation: { family: 'Avatar', schemaKey: 'avatar', studioMode: 'avatar', dashboardType: 'avatar.generate' },
  text_to_3d: { family: '3D', schemaKey: 'text_to_3d', studioMode: 'text_to_3d', dashboardType: 'three_d.text_to_3d' },
  image_to_3d: { family: '3D', schemaKey: 'image_to_3d', studioMode: 'image_to_3d', dashboardType: 'three_d.image_to_3d' },
  // Audio, Voice and Music
  tts: { family: 'Audio', schemaKey: 'voice', studioMode: 'voice', dashboardType: 'voice.tts' },
  stt: { family: 'Audio', schemaKey: 'voice_stt', studioMode: 'voice_stt', dashboardType: 'voice.stt' },
  voice_clone: { family: 'Audio', schemaKey: 'voice_clone', studioMode: 'voice_clone', dashboardType: 'voice.clone' },
  voice_conversion: { family: 'Audio', schemaKey: 'voice_conversion', studioMode: 'voice_conversion', dashboardType: 'voice.conversion' },
  text_to_audio: { family: 'Audio', schemaKey: 'text_to_audio', studioMode: 'text_to_audio', dashboardType: 'audio.text_to_audio' },
  audio_to_audio: { family: 'Audio', schemaKey: 'audio_to_audio', studioMode: 'audio_to_audio', dashboardType: 'audio.to_audio' },
  audio_classification: { family: 'Audio', schemaKey: 'audio_classification', studioMode: 'audio_classification', dashboardType: 'audio.classification' },
  voice_activity_detection: { family: 'Audio', schemaKey: 'voice_activity_detection', studioMode: 'voice_activity_detection', dashboardType: 'audio.vad' },
  music_generation: { family: 'Audio', schemaKey: 'music', studioMode: 'music', dashboardType: 'music.generate' },
  song_generation: { family: 'Audio', schemaKey: 'song_generation', studioMode: 'song_generation', dashboardType: 'music.song' },
  // Retrieval, Research and Business
  embeddings: { family: 'Knowledge', schemaKey: 'embeddings', studioMode: 'embeddings', dashboardType: 'knowledge.embeddings' },
  reranking: { family: 'Knowledge', schemaKey: 'reranking', studioMode: 'reranking', dashboardType: 'knowledge.reranking' },
  rag_ingest: { family: 'Knowledge', schemaKey: 'rag', studioMode: 'rag', dashboardType: 'rag.ingest' },
  rag_search: { family: 'Knowledge', schemaKey: 'rag_search', studioMode: 'rag_search', dashboardType: 'rag.query' },
  research: { family: 'Intelligence', schemaKey: 'research', studioMode: 'research', dashboardType: 'research' },
  brand_scrape: { family: 'Intelligence', schemaKey: 'scrape', studioMode: 'scrape', dashboardType: 'scrape.crawl' },
  document_ingest: { family: 'Knowledge', schemaKey: 'document_ingest', studioMode: 'document_ingest', dashboardType: 'rag.document_ingest' },
  campaign_generation: { family: 'Marketing', schemaKey: 'campaign', studioMode: 'campaign', dashboardType: 'campaign.generate' },
  social_content_generation: { family: 'Marketing', schemaKey: 'social_reel', studioMode: 'social_reel', dashboardType: 'social.reel_pack' },
  // Governed Adult
  adult_text: { family: 'Adult Governed', schemaKey: 'adult_text', studioMode: 'adult_text', dashboardType: 'adult.text' },
  adult_image: { family: 'Adult Governed', schemaKey: 'adult_image', studioMode: 'adult_image', dashboardType: 'adult.image' },
  adult_voice: { family: 'Adult Governed', schemaKey: 'adult_voice', studioMode: 'adult_voice', dashboardType: 'adult.voice' },
  adult_avatar: { family: 'Adult Governed', schemaKey: 'adult_avatar', studioMode: 'adult_avatar', dashboardType: 'adult.avatar' },
  adult_video: { family: 'Adult Governed', schemaKey: 'adult_video', studioMode: 'adult_video', dashboardType: 'adult.video' },
}

const ORCHESTRATED_CAPABILITIES = new Set<CapabilityKey>([
  'long_form_video',
  'rag_ingest',
  'rag_search',
  'research',
  'brand_scrape',
  'document_ingest',
  'campaign_generation',
  'social_content_generation',
])

function requiresSourceArtifact(key: CapabilityKey): boolean {
  return CAPABILITY_METADATA[key].inputContract.some((field) =>
    /(?:source|image|audio|video|document|sample)/i.test(field),
  )
}

export const CAPABILITY_CATALOG: CapabilityDefinition[] = CAPABILITY_KEYS.map((key) => {
  const metadata = CAPABILITY_METADATA[key]
  const display = CAPABILITY_DISPLAY_METADATA[key]
  const adult = key.startsWith('adult_')

  return {
    key,
    ...metadata,
    ...display,
    category: CAPABILITY_CATEGORY_MAP[key],
    enabled: true,
    allowedProviders: [],
    inputContractReference: `capability:${key}:request`,
    outputContractReference: `capability:${key}:response:${metadata.outputType}`,
    artifactType: metadata.artifactRequired ? metadata.outputType : null,
    orchestrated: ORCHESTRATED_CAPABILITIES.has(key),
    governed: adult || metadata.policyRequirement !== 'standard',
    adult,
    requiresSourceArtifact: requiresSourceArtifact(key),
    requiresQueueExecution: true,
    proofStatus: 'unproven',
    readyForDashboardExecution: false,
  }
})

export const CAPABILITY_BY_KEY = Object.fromEntries(
  CAPABILITY_CATALOG.map((capability) => [capability.key, capability]),
) as Record<CapabilityKey, CapabilityDefinition>

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
