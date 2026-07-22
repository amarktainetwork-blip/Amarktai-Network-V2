/**
 * Voice Audio Routes — canonical Fastify feature plugin.
 *
 * Registers governed voice-clone, voice-conversion, and executable
 * audio-to-audio routes on the main API server. Registration is awaited so
 * startup cannot report ready before the complete route surface exists.
 */

import type { FastifyInstance } from 'fastify'
import { registerVoiceCloneRoutes } from './voice-clone.js'
import { registerVoiceConversionRoutes } from './voice-conversion.js'
import { registerAudioToAudioRoutes } from './audio-to-audio.js'

export async function registerVoiceAudioRoutes(app: FastifyInstance): Promise<void> {
  await registerVoiceCloneRoutes(app)
  await registerVoiceConversionRoutes(app)
  await registerAudioToAudioRoutes(app)
}

export { registerVoiceCloneRoutes } from './voice-clone.js'
export { registerVoiceConversionRoutes } from './voice-conversion.js'
export { registerAudioToAudioRoutes } from './audio-to-audio.js'
