/**
 * JWT authentication plugin for Fastify.
 *
 * Provides token signing on login validation and verification
 * for protected routes. Uses HMAC-SHA256 via the Web Crypto API.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { getJwtSecret, JWT_EXPIRY_SECONDS } from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string       // subject (admin user email or app slug)
  role: string      // 'admin' | 'app'
  iat: number       // issued at
  exp: number       // expiry
}

declare module 'fastify' {
  interface FastifyInstance {
    jwtSign: (payload: Omit<JwtPayload, 'iat' | 'exp'>) => Promise<string>
    jwtVerify: (token: string) => Promise<JwtPayload | null>
  }
  interface FastifyRequest {
    jwtPayload?: JwtPayload
  }
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function base64urlEncode(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Buffer.from(signature).toString('base64url')
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const sigBuffer = Buffer.from(signature, 'base64url')
  return crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(data))
}

// ── JWT Operations ────────────────────────────────────────────────────────────

async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  const secret = getJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  }

  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(fullPayload))
  const signature = await hmacSign(`${header}.${body}`, secret)

  return `${header}.${body}.${signature}`
}

async function verifyJwt(token: string): Promise<JwtPayload | null> {
  const secret = getJwtSecret()
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, signature] = parts as [string, string, string]
  const valid = await hmacVerify(`${header}.${body}`, signature, secret)
  if (!valid) return null

  try {
    const payload = JSON.parse(base64urlDecode(body)) as JwtPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

async function jwtPlugin(app: FastifyInstance): Promise<void> {
  app.decorate('jwtSign', signJwt)
  app.decorate('jwtVerify', verifyJwt)
}

export const jwtPluginDecorated = fp(jwtPlugin, { name: 'jwt' })

// ── Auth Guard Hook ───────────────────────────────────────────────────────────

export async function jwtAuthGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  const payload = await verifyJwt(token)
  if (!payload) {
    reply.status(401).send({ error: true, message: 'Invalid or expired JWT token' })
    return
  }

  request.jwtPayload = payload
}
