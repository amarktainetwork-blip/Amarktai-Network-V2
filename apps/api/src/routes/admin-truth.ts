import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (!payload) {
      reply.status(401).send({ error: true, message: 'Invalid authorization' })
      return false
    }
    if (payload.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

export async function adminTruthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/truth', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    return reply.send({
      success: true,
      truth,
    })
  })
}
