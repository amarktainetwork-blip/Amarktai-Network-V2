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
  type GroqSttOptions,
  type GroqTtsRequest,
} from './groq-client.js'

// DeepInfra — OpenAI-compatible text fallback/runtime diagnostics
export {
  deepinfraChat,
  resolveDeepInfraChatModel,
  type DeepInfraChatRequest,
  type DeepInfraChatResponse,
} from './deepinfra-client.js'

// MiMo remains approved as coding-tools-only metadata. Do not export a
// callable backend runtime client from this provider package.

// Together AI — image generation
export {
  resolveTogetherImageModel,
  togetherGenerateImage,
  type TogetherImageRequest,
  type TogetherImageResponse,
} from './together-client.js'

// GenX — video generation with long-polling
export {
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

// GenX — music generation with submit/poll/download
export {
  genxSubmitMusic,
  genxPollMusic,
  genxDownloadMusic,
  genxGenerateMusic,
  resolveGenxMusicModel,
  GENX_MUSIC_POLL_INTERVAL_MS,
  GENX_MUSIC_POLL_MAX_ATTEMPTS,
  GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES,
  GenxMusicHttpError,
  type GenxMusicRequest,
  type GenxMusicSubmitResponse,
  type GenxMusicPollResponse,
  type GenxMusicResult,
  type GenxMusicLongPollCallbacks,
} from './genx-music-client.js'

// GenX — voice (TTS and STT) with submit/poll/download
export {
  genxSubmitTts,
  genxPollTts,
  genxDownloadTts,
  genxGenerateTts,
  genxSubmitStt,
  genxPollStt,
  genxGenerateStt,
  GENX_TTS_POLL_INTERVAL_MS,
  GENX_TTS_POLL_MAX_ATTEMPTS,
  GENX_STT_POLL_INTERVAL_MS,
  GENX_STT_POLL_MAX_ATTEMPTS,
  type GenxTtsRequest,
  type GenxTtsSubmitResponse,
  type GenxTtsPollResponse,
  type GenxTtsResult,
  type GenxSttRequest,
  type GenxSttSubmitResponse,
  type GenxSttPollResponse,
  type GenxSttResult,
} from './genx-voice-client.js'

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

// Shared direct-provider transports and canonical failures
export {
  CanonicalProviderError,
  providerHttpError,
  normalizeProviderError,
  redactProviderErrorMessage,
  type ProviderErrorCode,
} from './provider-errors.js'
export {
  openAiChatCompletion,
  openAiStreamingChat,
  type OpenAiTransportMessage,
  type OpenAiToolDefinition,
  type OpenAiToolCall,
  type OpenAiChatTransportRequest,
  type OpenAiChatTransportResponse,
  type OpenAiStreamChunk,
} from './openai-transport.js'
export {
  deepinfraTaskInference,
  type DeepInfraTaskRequest,
} from './deepinfra-task-client.js'
export {
  providerEmbeddings,
  providerRerank,
  type ProviderEmbeddingRequest,
  type ProviderEmbeddingResponse,
  type ProviderRerankDocument,
  type ProviderRerankRequest,
  type ProviderRerankResponse,
} from './retrieval-client.js'
export {
  inspectImageBuffer,
  inspectAudioBuffer,
  inspectVideoBuffer,
  type InspectedImage,
  type InspectedTimedMedia,
} from './media-inspection.js'
export {
  togetherSubmitVideo,
  togetherPollVideo,
  togetherDownloadVideo,
  togetherGenerateVideo,
  TOGETHER_VIDEO_POLL_INTERVAL_MS,
  TOGETHER_VIDEO_POLL_MAX_ATTEMPTS,
  type TogetherVideoRequest,
  type TogetherVideoJob,
  type TogetherVideoResult,
} from './together-video-client.js'
export {
  deepinfraGenerateVideo,
  type DeepInfraVideoRequest,
  type DeepInfraVideoResult,
} from './deepinfra-video-client.js'

// Provider model discovery — model-list/catalogue only, no generation calls.
export {
  runProviderModelDiscovery,
  discoverDeepInfraProviderModels,
  discoverGenXProviderModels,
  discoverGroqProviderModels,
  discoverMimoProviderModels,
  discoverTogetherProviderModels,
  type ProviderModelDiscoveryRunOptions,
  type DiscoveryAdapterOptions,
} from './model-discovery/index.js'
