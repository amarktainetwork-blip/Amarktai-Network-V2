/**
 * Authentication routes.
 *
 * POST /api/v1/auth/login  — Sign JWT on valid admin credentials
 * GET  /api/v1/auth/verify — Verify JWT token validity
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { compare } from 'bcryptjs'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return compare(plain, hash)
}

// ── Route Registration ────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/auth/login ───────────────────────────────────────────────

  app.post('/api/v1/auth/login', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined
      const password = typeof body.password === 'string' ? body.password : undefined

      if (!email || !password) {
        return reply.status(400).send({
          error: true,
          message: 'Email and password are required',
        })
      }

      // Look up admin user
      let user: { email: string; passwordHash: string; enabled: boolean; tokenVersion: number } | null = null
      try {
        user = await prisma.adminUser.findUnique({
          where: { email },
        })
      } catch (dbErr) {
        request.log.error({ err: dbErr }, 'Database error during login')
        return reply.status(500).send({
          error: true,
          message: 'Service temporarily unavailable',
        })
      }

      if (!user) {
        return reply.status(401).send({
          error: true,
          message: 'Invalid credentials',
        })
      }

      if (!user.enabled) {
        return reply.status(403).send({ error: true, message: 'Administrator account is disabled' })
      }

      if (!user.passwordHash) {
        request.log.error({ email }, 'Admin user has no password hash')
        return reply.status(500).send({
          error: true,
          message: 'Account not properly configured',
        })
      }

      // Verify password
      let valid = false
      try {
        valid = await verifyPassword(password, user.passwordHash)
      } catch (verifyErr) {
        request.log.error({ err: verifyErr }, 'Password verification error')
        return reply.status(500).send({
          error: true,
          message: 'Authentication service error',
        })
      }

      if (!valid) {
        return reply.status(401).send({
          error: true,
          message: 'Invalid credentials',
        })
      }

      // Sign JWT
      let token: string
      try {
        token = await app.jwtSign({
          sub: user.email,
          role: 'admin',
          tokenVersion: user.tokenVersion,
        })
      } catch (jwtErr) {
        request.log.error({ err: jwtErr }, 'JWT signing error')
        return reply.status(500).send({
          error: true,
          message: 'Token generation failed',
        })
      }

      return reply.send({
        success: true,
        token,
        user: {
          email: user.email,
          role: 'admin',
        },
      })
    } catch (err) {
      request.log.error({ err }, 'Unexpected login error')
      return reply.status(500).send({
        error: true,
        message: 'Internal server error',
      })
    }
  })

  // ── GET /api/v1/auth/verify ───────────────────────────────────────────────

  app.get('/api/v1/auth/verify', async (request, reply) => {
    try {
      const authHeader = request.headers?.authorization
      if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
      }

      const token = authHeader.slice(7)
      if (!token) {
        return reply.status(401).send({ error: true, message: 'Missing token' })
      }

      let payload = null
      try {
        payload = await app.jwtVerify(token)
      } catch (verifyErr) {
        request.log.error({ err: verifyErr }, 'JWT verification error')
        return reply.status(401).send({ error: true, message: 'Token verification failed' })
      }

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
    } catch (err) {
      request.log.error({ err }, 'Unexpected verify error')
      return reply.status(500).send({ error: true, message: 'Internal server error' })
    }
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: true, message: 'Authorization required' })
    }
    const payload = await app.jwtVerify(authorization.slice(7)).catch(() => null)
    if (!payload || payload.role !== 'admin') {
      return reply.status(401).send({ error: true, message: 'Invalid or expired token' })
    }
    await prisma.adminUser.update({
      where: { email: payload.sub },
      data: { tokenVersion: { increment: 1 } },
    })
    return reply.send({ success: true })
  })
}
