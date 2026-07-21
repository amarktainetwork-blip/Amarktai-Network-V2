import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  webhookRegistrationRecord: {
    findFirst: vi.fn(),
  },
  webhookDeliveryRecord: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

import { deliverTerminalJobWebhook, signWebhookPayload } from '../apps/worker/src/webhook-delivery.ts'

const terminalJob = {
  jobId: 'job-001',
  appSlug: 'avatar-app',
  capability: 'avatar_video',
  status: 'completed' as const,
  callbackUrl: 'https://avatar.example/webhooks/amarktai',
  traceId: 'trace-001',
  provider: 'genx',
  model: 'verified/model',
  artifactId: 'artifact-001',
  output: JSON.stringify({ artifactId: 'artifact-001' }),
  completedAt: new Date('2026-07-18T12:00:00.000Z'),
}

describe('terminal app webhook delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.webhookRegistrationRecord.findFirst.mockResolvedValue({
      id: 'webhook-001',
      appSlug: 'avatar-app',
      url: terminalJob.callbackUrl,
      secret: 'whsec_test_secret',
      events: JSON.stringify(['job.completed', 'job.failed']),
      active: true,
      createdAt: new Date(),
    })
    prismaMock.webhookDeliveryRecord.create.mockResolvedValue({ id: 41 })
    prismaMock.webhookDeliveryRecord.update.mockResolvedValue({ id: 41 })
  })

  it('signs the exact timestamp and JSON body and persists successful delivery evidence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const result = await deliverTerminalJobWebhook(terminalJob, { fetchImpl })

    expect(result).toMatchObject({ attempted: true, delivered: true, attempts: 1, statusCode: 204 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-AmarktAI-Signature']).toBe(
      signWebhookPayload('whsec_test_secret', headers['X-AmarktAI-Timestamp'], String(init.body)),
    )
    expect(headers['Idempotency-Key']).toBe(headers['X-AmarktAI-Event-Id'])
    expect(JSON.parse(String(init.body))).toMatchObject({
      type: 'job.completed',
      data: { jobId: 'job-001', artifactId: 'artifact-001', status: 'completed' },
    })
    expect(prismaMock.webhookDeliveryRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 41 },
      data: expect.objectContaining({ status: 'success', attempts: 1, statusCode: 204 }),
    }))
  })

  it('uses three bounded attempts without changing the terminal job result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const result = await deliverTerminalJobWebhook(terminalJob, { fetchImpl, sleep })

    expect(result).toMatchObject({ attempted: true, delivered: false, attempts: 3, statusCode: 503 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(prismaMock.webhookDeliveryRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', attempts: 3, statusCode: 503 }),
    }))
  })

  it('rejects unconfigured or unsafe callback URLs before network access', async () => {
    const fetchImpl = vi.fn()
    await expect(deliverTerminalJobWebhook({ ...terminalJob, callbackUrl: 'http://169.254.169.254/latest' }, { fetchImpl }))
      .resolves.toMatchObject({ attempted: false, reason: 'unsafe_callback_url' })
    await expect(deliverTerminalJobWebhook({ ...terminalJob, callbackUrl: undefined }, { fetchImpl }))
      .resolves.toMatchObject({ attempted: false, reason: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
