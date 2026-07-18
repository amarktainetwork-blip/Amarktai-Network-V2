import { createHmac, randomUUID } from 'node:crypto'
import { decryptProviderKey, isEncryptedProviderKey } from '@amarktai/core'
import { prisma } from '@amarktai/db'

const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 10_000

export interface TerminalJobWebhook {
  jobId: string
  appSlug: string
  capability: string
  status: 'completed' | 'failed'
  callbackUrl?: string
  traceId: string
  provider?: string | null
  model?: string | null
  artifactId?: string | null
  output?: string | null
  error?: string | null
  completedAt: Date
}

export interface WebhookDeliveryResult {
  attempted: boolean
  delivered: boolean
  attempts: number
  eventId?: string
  statusCode?: number
  reason?: string
}

export interface WebhookDeliveryDeps {
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isAllowedDeliveryUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    const fixtureLocalhost = process.env.RELEASE_FIXTURE_MODE === '1'
      && parsed.protocol === 'http:'
      && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')
    return (parsed.protocol === 'https:' || fixtureLocalhost)
      && !parsed.username
      && !parsed.password
      && !parsed.hash
  } catch {
    return false
  }
}

function signingSecret(storedSecret: string): string {
  // Registrations created before encrypted webhook management may contain a
  // plaintext secret. New and updated app-managed secrets are always encrypted.
  return isEncryptedProviderKey(storedSecret) ? decryptProviderKey(storedSecret) : storedSecret
}

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

export async function deliverTerminalJobWebhook(
  job: TerminalJobWebhook,
  deps: WebhookDeliveryDeps = {},
): Promise<WebhookDeliveryResult> {
  if (!job.callbackUrl) return { attempted: false, delivered: false, attempts: 0, reason: 'not_configured' }
  if (!isAllowedDeliveryUrl(job.callbackUrl)) {
    return { attempted: false, delivered: false, attempts: 0, reason: 'unsafe_callback_url' }
  }

  const registration = await prisma.webhookRegistrationRecord.findFirst({
    where: { appSlug: job.appSlug, url: job.callbackUrl, active: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!registration) {
    return { attempted: false, delivered: false, attempts: 0, reason: 'registration_not_found' }
  }

  const eventType = job.status === 'completed' ? 'job.completed' : 'job.failed'
  let events: string[] = []
  try {
    const parsed = JSON.parse(registration.events)
    events = Array.isArray(parsed) ? parsed.filter((event): event is string => typeof event === 'string') : []
  } catch {
    events = []
  }
  if (!events.includes(eventType)) {
    return { attempted: false, delivered: false, attempts: 0, reason: 'event_not_subscribed' }
  }

  const eventId = `evt_${randomUUID()}`
  const body = JSON.stringify({
    id: eventId,
    type: eventType,
    createdAt: job.completedAt.toISOString(),
    data: {
      jobId: job.jobId,
      appSlug: job.appSlug,
      capability: job.capability,
      status: job.status,
      traceId: job.traceId,
      provider: job.provider ?? null,
      model: job.model ?? null,
      artifactId: job.artifactId ?? null,
      output: job.output ?? null,
      error: job.error ?? null,
    },
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signWebhookPayload(signingSecret(registration.secret), timestamp, body)
  const delivery = await prisma.webhookDeliveryRecord.create({
    data: {
      webhookId: registration.id,
      eventId,
      eventType,
      url: registration.url,
      status: 'pending',
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
    },
  })

  const fetchImpl = deps.fetchImpl ?? fetch
  const wait = deps.sleep ?? sleep
  let lastStatusCode: number | undefined
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(registration.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AmarktAI-Webhook/1.0',
          'X-AmarktAI-Event': eventType,
          'X-AmarktAI-Event-Id': eventId,
          'X-AmarktAI-Timestamp': timestamp,
          'X-AmarktAI-Signature': signature,
          'Idempotency-Key': eventId,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      lastStatusCode = response.status
      if (response.ok) {
        await prisma.webhookDeliveryRecord.update({
          where: { id: delivery.id },
          data: { status: 'success', statusCode: response.status, attempts: attempt, lastAttemptAt: new Date(), error: null },
        })
        return { attempted: true, delivered: true, attempts: attempt, eventId, statusCode: response.status }
      }
      lastError = `Webhook endpoint returned HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 500) : 'Webhook request failed'
    }

    const retrying = attempt < MAX_ATTEMPTS
    const nextRetryAt = retrying ? new Date(Date.now() + (attempt * 250)) : null
    await prisma.webhookDeliveryRecord.update({
      where: { id: delivery.id },
      data: {
        status: retrying ? 'retrying' : 'failed',
        statusCode: lastStatusCode ?? null,
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextRetryAt,
        error: lastError,
      },
    })
    if (retrying) await wait(attempt * 250)
  }

  return {
    attempted: true,
    delivered: false,
    attempts: MAX_ATTEMPTS,
    eventId,
    statusCode: lastStatusCode,
    reason: lastError || 'delivery_failed',
  }
}
