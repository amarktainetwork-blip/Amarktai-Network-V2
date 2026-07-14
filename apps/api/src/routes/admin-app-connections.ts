import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'
import { getReleaseCandidateCapabilityKeys } from '@amarktai/core'
import { randomUUID, createHash } from 'crypto'

const RELEASE_CAPABILITY_SET = new Set<string>(getReleaseCandidateCapabilityKeys())

function parseReleaseCapabilities(value: unknown): { values: string[]; invalid: string[] } {
  const values = Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
    : []
  return { values, invalid: values.filter((capability) => !RELEASE_CAPABILITY_SET.has(capability)) }
}

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (payload?.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

function maskApiKey(rawKey: string): string {
  if (rawKey.length <= 8) return '****'
  return rawKey.slice(0, 4) + '****' + rawKey.slice(-4)
}

export async function adminAppConnectionRoutes(app: FastifyInstance): Promise<void> {
  // List app connections
  app.get('/api/admin/app-connections', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const connections = await prisma.appConnection.findMany({
      include: {
        apiKeys: {
          select: { id: true, label: true, active: true, lastUsedAt: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      connections: connections.map((c) => ({
        id: c.id,
        appSlug: c.appSlug,
        appName: c.appName,
        status: c.status,
        allowedCapabilities: JSON.parse(c.allowedCapabilities || '[]'),
        dailyBudgetCents: c.dailyBudgetCents,
        tokenBalance: c.tokenBalance,
        apiKeyCount: c.apiKeys.length,
        createdAt: c.createdAt?.toISOString(),
      })),
    })
  })

  // Create app connection
  app.post('/api/admin/app-connections', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const appSlug = typeof body.appSlug === 'string' ? body.appSlug.trim() : ''
    const appName = typeof body.appName === 'string' ? body.appName.trim() : ''
    const allowedCapabilities = parseReleaseCapabilities(body.allowedCapabilities)
    const dailyBudgetCents = body.dailyBudgetCents as number | undefined

    if (!appSlug || !appName) {
      return reply.status(400).send({ error: true, message: 'appSlug and appName are required' })
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(appSlug)) {
      return reply.status(400).send({ error: true, message: 'appSlug must contain lowercase letters, numbers, and single hyphens only' })
    }
    if (allowedCapabilities.invalid.length > 0) {
      return reply.status(400).send({ error: true, message: `Capabilities are not in the release-candidate set: ${allowedCapabilities.invalid.join(', ')}` })
    }

    const existing = await prisma.appConnection.findUnique({ where: { appSlug } })
    if (existing) {
      return reply.status(409).send({ error: true, message: `App connection '${appSlug}' already exists` })
    }

    const connection = await prisma.$transaction(async (transaction) => {
      const created = await transaction.appConnection.create({
        data: {
          appSlug,
          appName,
          allowedCapabilities: JSON.stringify(allowedCapabilities.values),
          dailyBudgetCents: Number.isSafeInteger(dailyBudgetCents) && Number(dailyBudgetCents) >= 0 ? Number(dailyBudgetCents) : 0,
        },
      })
      if (allowedCapabilities.values.length > 0) {
        await transaction.appCapabilityGrant.createMany({
          data: allowedCapabilities.values.map((capability) => ({
            appSlug,
            capability,
            enabled: true,
            adultPermission: false,
            passthroughModelAllowed: false,
            policyProfile: 'standard',
          })),
        })
      }
      return created
    })

    return reply.status(201).send({
      id: connection.id,
      appSlug: connection.appSlug,
      appName: connection.appName,
      status: connection.status,
    })
  })

  // Update app connection
  app.put('/api/admin/app-connections/:appSlug', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug } = request.params as { appSlug: string }
    const body = request.body as Record<string, unknown>

    const connection = await prisma.appConnection.findUnique({ where: { appSlug } })
    if (!connection) {
      return reply.status(404).send({ error: true, message: 'App connection not found' })
    }

    const requestedCapabilities = body.allowedCapabilities === undefined ? null : parseReleaseCapabilities(body.allowedCapabilities)
    if (requestedCapabilities && requestedCapabilities.invalid.length > 0) {
      return reply.status(400).send({ error: true, message: `Capabilities are not in the release-candidate set: ${requestedCapabilities.invalid.join(', ')}` })
    }
    const updateData: Record<string, unknown> = {}
    if (body.appName !== undefined) updateData.appName = body.appName
    if (body.status !== undefined) updateData.status = body.status
    if (requestedCapabilities) updateData.allowedCapabilities = JSON.stringify(requestedCapabilities.values)
    if (body.dailyBudgetCents !== undefined) updateData.dailyBudgetCents = body.dailyBudgetCents
    if (body.tokenBalance !== undefined) updateData.tokenBalance = body.tokenBalance

    const updated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.appConnection.update({ where: { appSlug }, data: updateData })
      if (requestedCapabilities) {
        await transaction.appCapabilityGrant.updateMany({ where: { appSlug }, data: { enabled: false } })
        for (const capability of requestedCapabilities.values) {
          await transaction.appCapabilityGrant.upsert({
            where: { app_capability_grant_unique: { appSlug, capability } },
            create: { appSlug, capability, enabled: true, adultPermission: false, passthroughModelAllowed: false, policyProfile: 'standard' },
            update: { enabled: true, adultPermission: false, passthroughModelAllowed: false },
          })
        }
      }
      return changed
    })

    return reply.send({
      id: updated.id,
      appSlug: updated.appSlug,
      appName: updated.appName,
      status: updated.status,
      allowedCapabilities: JSON.parse(updated.allowedCapabilities || '[]'),
      dailyBudgetCents: updated.dailyBudgetCents,
      tokenBalance: updated.tokenBalance,
    })
  })

  // Create app API key
  app.post('/api/admin/app-connections/:appSlug/keys', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug } = request.params as { appSlug: string }
    const body = (request.body || {}) as Record<string, unknown>
    const label = (body.label as string) || 'default'

    const connection = await prisma.appConnection.findUnique({ where: { appSlug } })
    if (!connection) {
      return reply.status(404).send({ error: true, message: 'App connection not found' })
    }

    // Generate raw key
    const rawKey = `amark_${randomUUID().replace(/-/g, '')}`
    const hashedKey = hashApiKey(rawKey)

    const apiKey = await prisma.appApiKey.create({
      data: {
        connectionId: connection.id,
        key: hashedKey,
        label,
      },
    })

    // Log audit event
    await logAuditEvent('app_api_key_created', {
      appSlug,
      keyId: apiKey.id,
      label,
    })

    return reply.status(201).send({
      id: apiKey.id,
      key: rawKey, // Return raw key only once
      maskedKey: maskApiKey(rawKey),
      label: apiKey.label,
      appSlug,
      message: 'Store this key securely. It will not be shown again.',
    })
  })

  // List app API keys (masked)
  app.get('/api/admin/app-connections/:appSlug/keys', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug } = request.params as { appSlug: string }

    const connection = await prisma.appConnection.findUnique({ where: { appSlug } })
    if (!connection) {
      return reply.status(404).send({ error: true, message: 'App connection not found' })
    }

    const keys = await prisma.appApiKey.findMany({
      where: { connectionId: connection.id },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      keys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        active: k.active,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        createdAt: k.createdAt?.toISOString(),
      })),
    })
  })

  // Revoke app API key
  app.delete('/api/admin/app-connections/:appSlug/keys/:keyId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug, keyId } = request.params as { appSlug: string; keyId: string }

    const connection = await prisma.appConnection.findUnique({ where: { appSlug } })
    if (!connection) {
      return reply.status(404).send({ error: true, message: 'App connection not found' })
    }

    const apiKey = await prisma.appApiKey.findFirst({
      where: { id: keyId, connectionId: connection.id },
    })
    if (!apiKey) {
      return reply.status(404).send({ error: true, message: 'API key not found' })
    }

    await prisma.appApiKey.update({
      where: { id: keyId },
      data: { active: false },
    })

    // Log audit event
    await logAuditEvent('app_api_key_revoked', {
      appSlug,
      keyId,
    })

    return reply.send({ success: true, message: 'API key revoked' })
  })

  // List app budget configs
  app.get('/api/admin/app-budgets', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const budgets = await prisma.appBudgetConfig.findMany({
      orderBy: { appSlug: 'asc' },
    })

    return reply.send({
      budgets: budgets.map((b) => ({
        appSlug: b.appSlug,
        monthlyBudgetCents: b.monthlyBudgetCents,
        dailyBudgetCents: b.dailyBudgetCents,
        requestsPerMinute: b.requestsPerMinute,
        requestsPerDay: b.requestsPerDay,
        capabilityQuotas: JSON.parse(b.capabilityQuotas || '{}'),
        premiumToggles: JSON.parse(b.premiumToggles || '{}'),
        paused: b.paused,
        pauseReason: b.pauseReason,
      })),
    })
  })

  // Update app budget config
  app.put('/api/admin/app-budgets/:appSlug', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug } = request.params as { appSlug: string }
    const body = request.body as Record<string, unknown>

    const existing = await prisma.appBudgetConfig.findUnique({ where: { appSlug } })

    const data = {
      monthlyBudgetCents: body.monthlyBudgetCents as number ?? existing?.monthlyBudgetCents ?? 0,
      dailyBudgetCents: body.dailyBudgetCents as number ?? existing?.dailyBudgetCents ?? 0,
      requestsPerMinute: body.requestsPerMinute as number ?? existing?.requestsPerMinute ?? 100,
      requestsPerDay: body.requestsPerDay as number ?? existing?.requestsPerDay ?? 10000,
      capabilityQuotas: JSON.stringify(body.capabilityQuotas ?? JSON.parse(existing?.capabilityQuotas || '{}')),
      premiumToggles: JSON.stringify(body.premiumToggles ?? JSON.parse(existing?.premiumToggles || '{}')),
      paused: body.paused as boolean ?? existing?.paused ?? false,
      pauseReason: body.pauseReason as string ?? existing?.pauseReason ?? '',
    }

    const budget = await prisma.appBudgetConfig.upsert({
      where: { appSlug },
      create: { appSlug, ...data },
      update: data,
    })

    return reply.send({
      appSlug: budget.appSlug,
      monthlyBudgetCents: budget.monthlyBudgetCents,
      dailyBudgetCents: budget.dailyBudgetCents,
      requestsPerMinute: budget.requestsPerMinute,
      requestsPerDay: budget.requestsPerDay,
      paused: budget.paused,
    })
  })
}

async function logAuditEvent(eventType: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    // Use BrainEvent if it exists, otherwise skip silently
    await (prisma as any).brainEvent?.create?.({
      data: {
        eventType,
        source: 'admin-api',
        payload: JSON.stringify(metadata),
      },
    }).catch(() => {})
  } catch {
    // Audit logging is best-effort
  }
}
