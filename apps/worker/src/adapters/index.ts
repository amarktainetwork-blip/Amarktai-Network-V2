/**
 * Provider adapter registry — routes capabilities to the correct adapter.
 *
 * Phase 3: Real provider integrations replace simulation adapters.
 * - text.* → Groq LLM inference
 * - voice.stt → Groq Whisper
 * - voice.tts → Groq Orpheus (with 200-char chunking)
 * - image.* → Together AI FLUX
 * - video.* → GenX long-polling engine
 * - music_generation → Groq fallback (simulation until live provider available)
 */

import { getCapabilityPrefix, type CapabilityKey } from '@amarktai/core'
import type { ProviderAdapter } from './provider-adapter.js'
import { GroqTextAdapter } from './groq-text-adapter.js'
import { GroqVoiceAdapter } from './groq-voice-adapter.js'
import { TogetherImageAdapter } from './together-image-adapter.js'
import { GenxVideoAdapter } from './genx-video-adapter.js'

// ── Adapter Registry ──────────────────────────────────────────────────────────

const adapters: ProviderAdapter[] = [
  new GroqTextAdapter(),
  new GroqVoiceAdapter(),
  new TogetherImageAdapter(),
  new GenxVideoAdapter(),
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
