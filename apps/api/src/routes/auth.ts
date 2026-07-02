/**
 * Authentication routes.
 *
 * POST /api/v1/auth/login  — Sign JWT on valid admin credentials
 * GET  /api/v1/auth/verify — Verify JWT token validity
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { timingSafeEqual } from 'crypto'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // bcrypt comparison using timing-safe approach
  try {
    const { compare } = await import('bcryptjs')
    return await compare(plain, hash)
  } catch {
    // Fallback: direct comparison for non-bcrypt hashes (dev only)
    return timingSafeEqual(Buffer.from(plain), Buffer.from(hash))
  }
}

// ── Route Registration ────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/auth/login ───────────────────────────────────────────────

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const email = body.email as string | undefined
    const password = body.password as string | undefined

    if (!email || !password) {
      return reply.status(400).send({
        error: true,
        message: 'Email and password are required',
      })
    }

    // Look up admin user
    const user = await prisma.adminUser.findUnique({
      where: { email },
    })

    if (!user) {
      return reply.status(401).send({
        error: true,
        message: 'Invalid credentials',
      })
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({
        error: true,
        message: 'Invalid credentials',
      })
    }

    // Sign JWT
    const token = await app.jwtSign({
      sub: user.email,
      role: 'admin',
    })

    return reply.send({
      success: true,
      token,
      user: {
        email: user.email,
        role: 'admin',
      },
    })
  })

  // ── GET /api/v1/auth/verify ───────────────────────────────────────────────

  app.get('/api/v1/auth/verify', async (request, reply) => {
    const authHeader = request.headers?.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: true, message: 'Missing token' })
    }

    const token = authHeader.slice(7)
    const payload = await app.jwtVerify(token)

    if (!payload) {
      return reply.status(401).send({ error: true, message: 'Invalid or expired token' })
    }

    return reply.send({
      valid: true,
      payload: {
        sub: payload.sub,
        role: payload.role,
        iat: payload.iat,
        exp: payload.exp,
      },
    })
  })
}
