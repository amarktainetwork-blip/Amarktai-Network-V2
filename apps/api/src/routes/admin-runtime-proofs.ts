import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getRuntimeProofStatus } from '../lib/runtime-proof-status.js'

export async function adminRuntimeProofRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/runtime-proofs', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    return reply.send(getRuntimeProofStatus())
  })
}

async function requireAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const authHeader = request.headers.authorization
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
    return false
  }

  const payload = await app.jwtVerify(authHeader.slice(7))
  if (!payload || payload.role !== 'admin') {
    reply.status(403).send({ error: true, message: 'Admin access required' })
    return false
  }

  return true
}
