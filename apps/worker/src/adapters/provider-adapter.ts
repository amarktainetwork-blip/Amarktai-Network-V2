/**
 * ProviderAdapter interface — uniform contract for all provider execution.
 *
 * Each capability category (text, image, voice, video) has its own adapter
 * implementation. For Phase 2, all adapters are local simulation drivers
 * that behave identically to real engines without hitting paid APIs.
 */

import type { CapabilityKey } from '@amarktai/core'

// ── Adapter Types ─────────────────────────────────────────────────────────────

export interface ProviderExecutionContext {
  jobId: string
  appSlug: string
  capability: CapabilityKey
  prompt: string
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  traceId: string
}

export interface ProviderExecutionResult {
  success: boolean
  provider: string
  model: string
  artifactId?: string
  output?: string
  metadata?: Record<string, unknown>
  error?: string
}

export interface ProviderAdapter {
  name: string
  supportedPrefixes: string[]
  execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult>
}
