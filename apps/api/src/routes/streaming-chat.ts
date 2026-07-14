import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import {
  CreateJobRequestSchema,
  GROQ_BASE_URL,
  TOKEN_COST_MULTIPLIER,
  createCanonicalProviderUsage,
  hasBlockedOverrides,
  validateDirectProviderRequest,
} from '@amarktai/core'
import { getProviderCredentialStatus, prisma, resolveProviderApiKey } from '@amarktai/db'
import { openAiStreamingChat, type OpenAiTransportMessage } from '@amarktai/providers'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { loadOrchestraSnapshot } from '../lib/orchestra-loader.js'
import { authenticateAppKey } from './jobs.js'

export async function streamingChatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/streaming-chat', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, message: auth.error })

    const body = request.body as Record<string, unknown>
    const blockedField = hasBlockedOverrides(body)
      || hasBlockedOverrides((body.input ?? {}) as Record<string, unknown>)
      || hasBlockedOverrides((body.metadata ?? {}) as Record<string, unknown>)
    if (blockedField) return reply.status(400).send({ error: true, message: `Field '${blockedField}' is not allowed. Orchestra selects provider and model.` })

    const parsed = CreateJobRequestSchema.safeParse({ ...body, capability: 'streaming_chat' })
    if (!parsed.success) return reply.status(400).send({ error: true, message: 'Invalid streaming chat request', details: parsed.error.issues })
    const validation = validateDirectProviderRequest('streaming_chat', parsed.data.prompt, parsed.data.input)
    if (!validation.success) return reply.status(400).send({ error: true, message: validation.error, details: validation.issues })

    const grantResolution = await resolveAppCapabilityGrantSnapshot(auth.app!.slug, 'streaming_chat', auth.allowedCapabilities ?? [])
    if (!grantResolution?.grant.enabled) return reply.status(403).send({ error: true, message: "Capability 'streaming_chat' has no enabled AppCapabilityGrant for this app." })
    if (grantResolution.grant.approvalRequired) return reply.status(403).send({ error: true, message: 'Streaming chat requires approval under the current AppCapabilityGrant.' })

    const tokenCost = TOKEN_COST_MULTIPLIER.streaming_chat ?? 1
    if (auth.tokenBalance !== undefined && auth.tokenBalance < tokenCost) return reply.status(402).send({ error: true, message: 'Insufficient token balance for streaming chat.' })
    if (auth.dailyBudgetCents && auth.dailyBudgetCents > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const usage = await prisma.usageMeter.aggregate({
        where: { appSlug: auth.app!.slug, date: { gte: today } },
        _sum: { costUsdCents: true },
      })
      if ((usage._sum.costUsdCents ?? 0) >= auth.dailyBudgetCents) {
        return reply.status(429).send({ error: true, message: 'Daily cost budget limit reached. Try again tomorrow.' })
      }
    }

    const jobId = randomUUID()
    const traceId = `trace_${randomUUID()}`
    const input = validation.data ?? parsed.data.input
    const snapshotAt = new Date().toISOString()
    const metadata = {
      ...parsed.data.metadata,
      appGrantSnapshot: grantResolution.grant,
      appGrantSnapshotSource: grantResolution.source,
      appGrantSnapshotAt: snapshotAt,
      transport: 'sse',
    }

    const decision = await loadOrchestraSnapshot({
      capability: 'streaming_chat',
      routingMode: 'balanced',
      executionId: jobId,
      appSlug: auth.app!.slug,
      appGrant: grantResolution.grant,
    }, { databaseReady: true, queueReady: true })

    if (!decision.executionAllowed || decision.selectedProvider !== 'groq' || !decision.selectedModel || decision.selectedExecutorId !== 'groq.streaming-chat') {
      return reply.status(503).send({ error: true, message: decision.blockReason ?? 'No streaming chat route is ready', orchestra: decision })
    }

    await prisma.job.create({
      data: {
        id: jobId,
        appSlug: auth.app!.slug,
        capability: 'streaming_chat',
        prompt: parsed.data.prompt,
        inputJson: JSON.stringify(input),
        metadataJson: JSON.stringify({
          ...metadata,
          orchestraExecutionId: decision.executionId,
          orchestraSelectedProvider: decision.selectedProvider,
          orchestraSelectedModel: decision.selectedModel,
          orchestraSelectedExecutorId: decision.selectedExecutorId,
          orchestraFallbackCount: decision.fallbackRoutes.length,
        }),
        traceId,
        executionId: decision.executionId,
        status: 'processing',
        provider: decision.selectedProvider,
        model: decision.selectedModel,
        progress: 1,
        startedAt: new Date(),
      },
    })
    if (auth.connectionId && tokenCost > 0) {
      await prisma.appConnection.update({ where: { id: auth.connectionId }, data: { tokenBalance: { decrement: tokenCost } } })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (event: string, data: Record<string, unknown>) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    send('route', { jobId, executionId: decision.executionId, capability: 'streaming_chat', provider: 'groq', model: decision.selectedModel, executorId: decision.selectedExecutorId, routeType: 'primary' })

    const controller = new AbortController()
    let completed = false
    request.raw.once('aborted', () => { if (!completed) controller.abort(new Error('client disconnected')) })
    reply.raw.once('close', () => { if (!completed && !reply.raw.writableEnded) controller.abort(new Error('client disconnected')) })
    let content = ''
    let upstreamChunks = 0
    let usage = createCanonicalProviderUsage({ provider: 'groq', model: decision.selectedModel })
    try {
      const credential = await resolveProviderApiKey('groq')
      const providerStatus = await getProviderCredentialStatus('groq')
      for await (const chunk of openAiStreamingChat({
        provider: 'groq',
        baseUrl: providerStatus.baseUrl || GROQ_BASE_URL,
        apiKey: credential.apiKey,
        model: decision.selectedModel,
        messages: buildMessages(parsed.data.prompt, input),
        maxOutputTokens: numberValue(input.maxOutputTokens),
        temperature: numberValue(input.temperature),
        signal: controller.signal,
      })) {
        if (chunk.type === 'content' && chunk.content) {
          upstreamChunks++
          content += chunk.content
          send('chunk', { index: upstreamChunks, delta: chunk.content })
        } else if (chunk.type === 'usage' && chunk.usage) {
          usage = createCanonicalProviderUsage({
            provider: 'groq', model: decision.selectedModel,
            inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens, totalTokens: chunk.usage.totalTokens,
            providerReportedCost: chunk.usage.providerReportedCost, currency: chunk.usage.currency,
          })
        }
      }
      if (!content.trim() || upstreamChunks === 0) throw new Error('Groq stream completed without content chunks')
      completed = true
      const finalMetadata = {
        ...metadata,
        orchestraExecutionId: decision.executionId,
        orchestraSelectedProvider: 'groq',
        orchestraSelectedModel: decision.selectedModel,
        orchestraSelectedExecutorId: decision.selectedExecutorId,
        orchestraActualProvider: 'groq',
        orchestraActualModel: decision.selectedModel,
        orchestraActualExecutorId: decision.selectedExecutorId,
        orchestraActualOutcome: 'completed',
        orchestraFallbackCount: decision.fallbackRoutes.length,
        orchestraRouteAttempts: [{ provider: 'groq', model: decision.selectedModel, executorId: decision.selectedExecutorId, success: true }],
        directProviderExecutorId: decision.selectedExecutorId,
        directProviderRouteType: 'primary',
        streamingUpstreamChunkCount: upstreamChunks,
        directProviderUsage: usage,
        directProviderCostEvidence: {
          providerReportedCost: usage.providerReportedCost,
          estimatedCost: usage.estimatedCost,
          estimated: usage.estimated,
          currency: usage.currency,
        },
        directProviderOutputValidation: { valid: true, contract: 'multiple_upstream_sse_chunks', multipleChunks: upstreamChunks > 1 },
      }
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', output: content, progress: 100, completedAt: new Date(), metadataJson: JSON.stringify(finalMetadata) },
      })
      await recordStreamingUsage(auth.app!.slug, decision.selectedModel, usage)
      send('complete', { jobId, executionId: decision.executionId, chunks: upstreamChunks, usage })
      reply.raw.end()
    } catch (error) {
      completed = true
      const message = controller.signal.aborted ? 'Streaming request cancelled by disconnect' : error instanceof Error ? error.message : 'Streaming request failed'
      await prisma.job.update({
        where: { id: jobId },
        data: { status: controller.signal.aborted ? 'cancelled' : 'failed', error: message, completedAt: new Date(), progress: 0 },
      }).catch(() => {})
      if (!reply.raw.destroyed) { send('error', { jobId, message }); reply.raw.end() }
    }
  })
}

function buildMessages(prompt: string, input: Record<string, unknown>): OpenAiTransportMessage[] {
  const messages: OpenAiTransportMessage[] = []
  if (typeof input.system === 'string' && input.system.trim()) messages.push({ role: 'system', content: input.system })
  if (Array.isArray(input.messages)) {
    for (const message of input.messages) {
      if (typeof message !== 'object' || message === null || Array.isArray(message)) continue
      const record = message as Record<string, unknown>
      messages.push({ role: record.role as OpenAiTransportMessage['role'], content: String(record.content) })
    }
  }
  messages.push({ role: 'user', content: prompt })
  return messages
}

async function recordStreamingUsage(appSlug: string, model: string, usage: ReturnType<typeof createCanonicalProviderUsage>): Promise<void> {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const costUsdCents = usage.providerReportedCost !== null && (!usage.currency || usage.currency.toUpperCase() === 'USD') ? Math.round(usage.providerReportedCost * 100) : null
  await prisma.usageMeter.upsert({
    where: { usage_meter_unique: { appSlug, date: today, capability: 'streaming_chat', provider: 'groq', model } },
    update: { requestCount: { increment: 1 }, successCount: { increment: 1 }, inputTokens: { increment: usage.inputTokens }, outputTokens: { increment: usage.outputTokens }, ...(costUsdCents !== null ? { costUsdCents: { increment: costUsdCents } } : {}) },
    create: { appSlug, date: today, capability: 'streaming_chat', provider: 'groq', model, requestCount: 1, successCount: 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ...(costUsdCents !== null ? { costUsdCents } : {}) },
  })
}

function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
