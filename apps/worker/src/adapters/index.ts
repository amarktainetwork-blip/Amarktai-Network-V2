/**
 * Provider adapter registry — routes capabilities to the correct adapter.
 *
 * - image.* → Together AI FLUX
 * - video.* → GenX long-polling engine
 * - scrape.* → Crawlee + Playwright brand extraction
 * - rag.* → Qdrant + Together AI embeddings pipeline
 * - text/voice/music → handled by provider-executor.ts Orchestra routing
 */

import { getCapabilityPrefix, type CapabilityKey } from '@amarktai/core'
import type { ProviderAdapter } from './provider-adapter.js'
import { TogetherImageAdapter } from './together-image-adapter.js'
import { GenxVideoAdapter } from './genx-video-adapter.js'
import { ScrapeAdapter } from './scrape-adapter.js'
import { RagAdapter } from './rag-adapter.js'

// ── Adapter Registry ──────────────────────────────────────────────────────────

const adapters: ProviderAdapter[] = [
  new TogetherImageAdapter(),
  new GenxVideoAdapter(),
  new ScrapeAdapter(),
  new RagAdapter(),
]

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getAdapterForCapability(capability: CapabilityKey): ProviderAdapter {
  const prefix = getCapabilityPrefix(capability)
  const adapter = adapters.find((a) => a.supportedPrefixes.includes(prefix))
  if (!adapter) {
    throw new Error(`No provider adapter registered for capability '${capability}' (prefix: '${prefix}')`)
  }
  return adapter
}

export type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'
