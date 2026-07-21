import Fastify from 'fastify'
import { hash } from 'bcryptjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const state = vi.hoisted(() => ({
  admin: null as null | { email: string; passwordHash: string; enabled: boolean; tokenVersion: number },
  databaseError: false,
}))

const prisma = vi.hoisted(() => ({
  adminUser: {
    findUnique: vi.fn(async () => {
      if (state.databaseError) throw new Error('database unavailable')
      return state.admin
    }),
    update: vi.fn(async () => {
      if (!state.admin) throw new Error('not found')
      state.admin.tokenVersion++
      return state.admin
    }),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma }))

const { jwtPluginDecorated } = await import('../apps/api/src/plugins/jwt.ts')
const { authRoutes } = await import('../apps/api/src/routes/auth.ts')

describe('release-candidate administrator session flow', () => {
  const apps: ReturnType<typeof Fastify>[] = []

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'release-candidate-test-secret-at-least-thirty-two-characters'
    state.databaseError = false
    state.admin = {
      email: 'admin@example.com',
      passwordHash: await hash('correct-password', 4),
      enabled: true,
      tokenVersion: 0,
    }
  })

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    delete process.env.JWT_SECRET
  })

  async function app() {
    const instance = Fastify({ logger: false })
    await instance.register(jwtPluginDecorated)
    await instance.register(authRoutes)
    await instance.ready()
    apps.push(instance)
    return instance
  }

  it('supports login, authenticated API verification, logout, then global token denial', async () => {
    const instance = await app()
    const login = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: ' ADMIN@example.com ', password: 'correct-password' } })
    expect(login.statusCode).toBe(200)
    const token = login.json().token
    expect(token).toEqual(expect.any(String))

    const verified = await instance.inject({ method: 'GET', url: '/api/v1/auth/verify', headers: { authorization: `Bearer ${token}` } })
    expect(verified.statusCode).toBe(200)
    expect(verified.json().payload.role).toBe('admin')

    const logout = await instance.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${token}` } })
    expect(logout.statusCode).toBe(200)
    expect(state.admin?.tokenVersion).toBe(1)

    const denied = await instance.inject({ method: 'GET', url: '/api/v1/auth/verify', headers: { authorization: `Bearer ${token}` } })
    expect(denied.statusCode).toBe(401)
  })

  it('fails honestly for invalid credentials, disabled administrators, and missing database', async () => {
    const instance = await app()
    const invalid = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@example.com', password: 'wrong' } })
    expect(invalid.statusCode).toBe(401)
    expect(invalid.json().message).toBe('Invalid credentials')

    state.admin!.enabled = false
    const disabled = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@example.com', password: 'correct-password' } })
    expect(disabled.statusCode).toBe(403)

    state.databaseError = true
    const unavailable = await instance.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@example.com', password: 'correct-password' } })
    expect(unavailable.statusCode).toBe(500)
    expect(unavailable.json().message).toBe('Service temporarily unavailable')
  })

  it('uses the Next login proxy, secure cookie, expiry verification, and loop-safe dashboard redirect', () => {
    const proxy = readFileSync('app/api/auth/login/route.js', 'utf8')
    const verify = readFileSync('app/api/auth/verify/route.js', 'utf8')
    const layout = readFileSync('app/dashboard/layout.js', 'utf8')
    expect(proxy).toContain("response.cookies.set('amarktai_session'")
    expect(proxy).toContain('httpOnly: true')
    expect(proxy).toContain("sameSite: 'strict'")
    expect(verify).toContain('/api/v1/auth/verify')
    expect(layout).toContain('response.status === 401 || response.status === 403')
    expect(layout).toContain('redirectToLogin()')
    expect(readFileSync('lib/admin-session.js', 'utf8')).toContain("window.location.pathname === '/login'")
  })
})
