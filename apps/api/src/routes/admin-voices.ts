import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'

export async function adminVoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/voices', async (request, reply) => {
    const auth = request.headers.authorization
    try { if (!auth?.startsWith('Bearer ') || (await app.jwtVerify(auth.slice(7)))?.role !== 'admin') return reply.status(403).send({ error: true, message: 'Admin access required' }) } catch { return reply.status(401).send({ error: true, message: 'Invalid authorization' }) }
    const voices = await prisma.voiceLibrary.findMany({ orderBy: [{ provider: 'asc' }, { name: 'asc' }] })
    return reply.send({ voices: voices.map((voice) => ({
      id: voice.id, voiceId: voice.voiceId, name: voice.name, provider: voice.provider, compatibleModels: parseArray(voice.compatibleModels),
      language: voice.language, locale: voice.locale, accent: voice.accent, style: voice.style, gender: voice.gender,
      previewUrl: voice.previewUrl, enabled: voice.enabled, useCaseTags: parseArray(voice.useCaseTags), sourceType: voice.sourceType,
      consentStatus: voice.consentStatus, ownershipReference: voice.ownershipReference, lastVerifiedAt: voice.lastVerifiedAt,
    })) })
  })
}
function parseArray(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
