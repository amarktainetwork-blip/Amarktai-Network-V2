/**
 * Provider executor — routes execution to the correct provider client.
 *
 * Phase 6A: Only Groq chat is implemented.
 * All other capabilities return "not implemented".
 *
 * This module is the ONLY place that calls provider APIs.
 */

import { routeProvider, type CapabilityKey } from '@amarktai/core'
import type { WorkerJobData, ProcessorResult } from '../processors/job-processor.js'

// ── Groq chat execution ───────────────────────────────────────────────────────

async function executeGroqChat(payload: WorkerJobData): Promise<ProcessorResult> {
  const { groqChat } = await import('@amarktai/providers')

  try {
    const result = await groqChat({
      prompt: payload.prompt,
    })

    if (!result.content || !result.content.trim()) {
      return {
        success: false,
        status: 'failed',
        error: 'Groq returned empty response',
      }
    }

    return {
      success: true,
      status: 'completed',
      output: result.content,
      provider: 'groq',
      model: result.model,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Groq error'
    return {
      success: false,
      status: 'failed',
      error: `Groq execution failed: ${message}`,
    }
  }
}

// ── Provider executor ─────────────────────────────────────────────────────────

export async function executeWithProvider(payload: WorkerJobData): Promise<ProcessorResult> {
  const decision = routeProvider(payload.capability as CapabilityKey)

  // Only groq + chat is implemented in Phase 6A
  if (decision.selectedProvider === 'groq' && payload.capability === 'chat') {
    return executeGroqChat(payload)
  }

  // All other provider/capability combinations are not implemented
  const providerInfo = decision.selectedProvider
    ? `Selected provider: ${decision.selectedProvider}`
    : `No provider selected: ${decision.blockReason ?? 'unknown'}`
  const candidates = decision.candidates
    .filter((c) => c.supported)
    .map((c) => `${c.provider}(${c.configured ? 'configured' : 'missing-config'})`)
    .join(', ')

  return {
    success: false,
    status: 'failed',
    error: `Provider execution not implemented for '${payload.capability}'. ${providerInfo}. Candidates: ${candidates || 'none'}. executionAllowed: false`,
  }
}
