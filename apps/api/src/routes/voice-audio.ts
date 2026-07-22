/**
 * Voice Audio Routes — feature registration module.
 *
 * This module registers all voice and audio routes into a Fastify instance.
 * It is structured for later integration into the main server with a small
 * explicit import and registration call.
 */

import type { FastifyInstance } from 'fastify'
import { registerVoiceCloneRoutes } from './voice-clone.js'
import { registerVoiceConversionRoutes } from './voice-conversion.js'
import { registerAudioToAudioRoutes } from './audio-to-audio.js'

// ── Feature Registration ──────────────────────────────────────────────────────

export function registerVoiceAudioRoutes(app: FastifyInstance): void {
  registerVoiceCloneRoutes(app)
  registerVoiceConversionRoutes(app)
  registerAudioToAudioRoutes(app)
}

// ── Individual Route Registration ─────────────────────────────────────────────

export { registerVoiceCloneRoutes } from './voice-clone.js'
export { registerVoiceConversionRoutes } from './voice-conversion.js'
export { registerAudioToAudioRoutes } from './audio-to-audio.js'
