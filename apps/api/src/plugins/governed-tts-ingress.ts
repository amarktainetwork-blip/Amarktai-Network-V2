import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { validateGovernedTtsRequest } from '@amarktai/core/governed-tts'

const TTS_INGRESS_ROUTES = new Set([
  '/api/v1/jobs',
  '/api/admin/studio/jobs',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function validateTtsIngress(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const routeUrl = request.routeOptions.url
  if (request.method !== 'POST' || !routeUrl || !TTS_INGRESS_ROUTES.has(routeUrl)) return
  if (!isRecord(request.body) || request.body.capability !== 'tts') return

  const body = request.body
  const input = isRecord(body.input) ? body.input : {}
  const prompt = typeof body.prompt === 'string' ? body.prompt : 'tts'
  const validation = validateGovernedTtsRequest(prompt, input)
  if (!validation.success || !validation.data) {
    await reply.status(400).send({
      error: true,
      code: 'INVALID_GOVERNED_TTS_REQUEST',
      message: validation.error,
      details: validation.issues,
    })
    return
  }

  const governed = validation.data
  const legacyCompatibleInput: Record<string, unknown> = {
    text: governed.text,
    speed: governed.speed,
    outputFormat: governed.outputFormat,
    language: governed.language,
    style: governed.style,
  }
  for (const [key, value] of Object.entries(legacyCompatibleInput)) {
    if (value === undefined) delete legacyCompatibleInput[key]
  }

  const existingMetadata = isRecord(body.metadata) ? body.metadata : {}
  body.input = legacyCompatibleInput
  body.metadata = {
    ...existingMetadata,
    governedTtsRequest: governed,
    governedTtsValidatedAt: new Date().toISOString(),
    governedTtsContractVersion: 1,
  }
}

export const governedTtsIngressPlugin = fp(async (app) => {
  app.addHook('preValidation', validateTtsIngress)
}, { name: 'governed-tts-ingress' })
