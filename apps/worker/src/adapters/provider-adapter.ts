/**
 * ProviderAdapter interface — uniform contract for all provider execution.
 *
 * Each capability category (text, image, voice, video) has its own adapter
 * implementation. Adapters either execute real backend provider calls or
 * fail closed with explicit unsupported-execution errors.
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
