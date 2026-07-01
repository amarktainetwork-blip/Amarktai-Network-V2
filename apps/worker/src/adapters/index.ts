/**
 * Provider adapter registry — routes capabilities to the correct adapter.
 *
 * For Phase 2, all adapters are local simulation drivers.
 * When real providers are integrated, new adapters are added here
 * without changing the worker or API code.
 */

import { getCapabilityPrefix, type CapabilityKey } from '@amarktai/core'
import type { ProviderAdapter } from './provider-adapter.js'
import { TextSimulationAdapter } from './text-simulation.js'
import { ImageSimulationAdapter } from './image-simulation.js'
import { VoiceSimulationAdapter } from './voice-simulation.js'
import { VideoSimulationAdapter } from './video-simulation.js'

// ── Adapter Registry ──────────────────────────────────────────────────────────

const adapters: ProviderAdapter[] = [
  new TextSimulationAdapter(),
  new ImageSimulationAdapter(),
  new VoiceSimulationAdapter(),
  new VideoSimulationAdapter(),
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
