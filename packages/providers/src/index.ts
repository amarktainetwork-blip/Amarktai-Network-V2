/**
 * @amarktai/providers — Live AI provider REST clients.
 *
 * Each client handles HTTP communication with its respective provider API.
 * All API key resolution goes through @amarktai/core config (single source of truth).
 * No provider-specific routing logic lives here — that belongs in the worker adapters.
 */

// Groq — text chat, speech-to-text, text-to-speech
export {
  groqChat,
  groqStt,
  groqTts,
  type GroqChatRequest,
  type GroqChatResponse,
  type GroqSttResponse,
  type GroqTtsResponse,
} from './groq-client.js'

// DeepInfra — OpenAI-compatible text fallback/runtime diagnostics
export {
  deepinfraChat,
  resolveDeepInfraChatModel,
  type DeepInfraChatRequest,
  type DeepInfraChatResponse,
} from './deepinfra-client.js'

// MiMo remains approved but backend runtime is disabled. Do not export a
// callable MiMo provider client until a backend/application-allowed credential
// and runtime policy are approved.

// Together AI — image generation
export {
  resolveTogetherImageModel,
  togetherGenerateImage,
  type TogetherImageRequest,
  type TogetherImageResponse,
} from './together-client.js'

// GenX — video generation with long-polling
export {
  DEFAULT_GENX_VIDEO_MODEL,
  GENX_ROUTER_VIDEO_MODEL_PREFERENCE,
  genxSubmitVideo,
  genxPollVideo,
  genxDownloadVideo,
  genxGenerateVideo,
  resolveGenxVideoModel,
  GENX_POLL_INTERVAL_MS,
  GENX_POLL_MAX_ATTEMPTS,
  GENX_POLL_TRANSIENT_MAX_RETRIES,
  GenxHttpError,
  type GenxVideoRequest,
  type GenxVideoSubmitResponse,
  type GenxVideoPollResponse,
  type GenxVideoResult,
  type GenxLongPollCallbacks,
} from './genx-client.js'

// Qdrant — vector database for RAG
export {
  ensureCollection,
  upsertPoints,
  searchVectors,
  getCollectionInfo,
  type QdrantPoint,
  type QdrantSearchResult,
  type QdrantUpsertResult,
} from './qdrant-client.js'

// Together AI — text embeddings for RAG
export {
  generateEmbeddings,
  type EmbeddingRequest,
  type EmbeddingResponse,
} from './embeddings-client.js'
