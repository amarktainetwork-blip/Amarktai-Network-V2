import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { BLOCKED_OVERRIDE_FIELDS, QUEUE_NAMES } from '@amarktai/core'
import { isPreferredPremiumGenxModel } from '@amarktai/core/premium-media-policy'
import {
  assertSongPackageSpendConfirmed,
  createSongPackagePlan,
  validateOriginalSongRequest,
  type SongGenerationRequest,
  type SongPackagePlan,
} from '@amarktai/core/song-generation'
import { estimateGenxCredits, genxGetCreditBalance, genxGetModelPricing } from '@amarktai/providers/genx-account-client'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { loadOrchestraSnapshot } from '../lib/orchestra-loader.js'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

const APP_SLUG = 'dashboard-music'

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.slice('Bearer '.length))
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

function blockedOverrideField(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) if (field in input) return field
  const nested = input.input && typeof input.input === 'object' && !Array.isArray(input.input)
    ? input.input as Record<string, unknown>
    : null
  if (nested) for (const field of BLOCKED_OVERRIDE_FIELDS) if (field in nested) return `input.${field}`
  return null
}

function publicPlan(plan: SongPackagePlan) {
  return {
    capability: plan.capability,
    title: plan.title,
    selectedProvider: plan.selectedProvider,
    selectedModel: plan.selectedModel,
    durationSeconds: plan.durationSeconds,
    adCutSeconds: plan.adCutSeconds,
    masteringProfile: plan.masteringProfile,
    structure: plan.structure,
    variants: plan.variants.map((variant) => ({
      variant: variant.variant,
      instrumentalOnly: variant.instrumentalOnly,
      vocalsRequested: variant.vocalsRequested,
      lyricsProvided: Boolean(variant.lyrics),
    })),
    spend: plan.spend,
    confirmationRequired: plan.confirmationRequired,
  }
}

async function buildPremiumSongPlan(request: SongGenerationRequest): Promise<{
  plan: SongPackagePlan
  grant: NonNullable<Awaited<ReturnType<typeof resolveAppCapabilityGrantSnapshot>>>['grant']
}> {
  const grantResolution = await resolveAppCapabilityGrantSnapshot(APP_SLUG, 'song_generation')
  if (!grantResolution?.grant.enabled || !grantResolution.grant.artifactWrite) {
    throw new Error('No enabled artifact-writing AppCapabilityGrant exists for dashboard-music/song_generation')
  }

  const decision = await loadOrchestraSnapshot({
    capability: 'song_generation',
    executionProfile: 'internal_dashboard',
    routingMode: 'quality',
    appSlug: APP_SLUG,
    appGrant: grantResolution.grant,
    executionId: `song-plan-${randomUUID()}`,
  }, { databaseReady: true, queueReady: true })

  if (!decision.executionAllowed || !decision.selectedProvider || !decision.selectedModel || !decision.selectedExecutorId) {
    throw new Error(decision.blockReason || 'No executable premium full-song route is available')
  }
  if (decision.selectedProvider !== 'genx') throw new Error('Premium full-song production is restricted to GenX')
  if (!isPreferredPremiumGenxModel(decision.selectedModel, 'full_song')) {
    throw new Error(`Orchestra did not select a Lyria 3 Pro full-song model: ${decision.selectedModel}`)
  }

  const [credential, providerStatus] = await Promise.all([
    resolveProviderApiKey('genx'),
    getProviderCredentialStatus('genx'),
  ])
  const options = { apiKey: credential.apiKey, baseUrl: providerStatus.baseUrl || undefined }
  const [balance, pricing] = await Promise.all([
    genxGetCreditBalance(options),
    genxGetModelPricing(decision.selectedModel, options),
  ])
  const estimatedCreditsPerGeneration = estimateGenxCredits(pricing, {
    generations: 1,
    audioSeconds: request.durationSeconds,
  })

  const plan = createSongPackagePlan({
    request,
    selectedModel: decision.selectedModel,
    selectedExecutorId: decision.selectedExecutorId,
    availableCredits: balance.availableCredits,
    estimatedCreditsPerGeneration,
  })
  return { plan, grant: grantResolution.grant }
}

export async function adminSongRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for full-song production')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.get('/api/admin/song/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    const capability = truth.capabilities.find((entry) => entry.capability === 'song_generation')
    return reply.send({
      success: true,
      status: {
        capability: 'song_generation',
        executableNow: capability?.executableNow === true,
        liveProven: capability?.liveProven === true,
        blockedReasons: capability?.blockedReasons ?? ['canonical_truth_unavailable'],
        premiumProvider: 'genx',
        premiumModelFamily: 'Lyria 3 Pro',
        confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND',
      },
    })
  })

  app.post('/api/admin/song/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })
    try {
      const songRequest = validateOriginalSongRequest(body)
      const { plan } = await buildPremiumSongPlan(songRequest)
      return reply.send({ success: true, plan: publicPlan(plan) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Full-song planning failed'
      const status = /spend|credit|pricing|route|Lyria|AppCapabilityGrant/i.test(message) ? 409 : 400
      return reply.status(status).send({ error: true, message })
    }
  })

  app.post('/api/admin/song/generate', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    let songRequest: SongGenerationRequest
    let plan: SongPackagePlan
    let grant: Awaited<ReturnType<typeof buildPremiumSongPlan>>['grant']
    try {
      songRequest = validateOriginalSongRequest(body)
      const built = await buildPremiumSongPlan(songRequest)
      plan = built.plan
      grant = built.grant
      assertSongPackageSpendConfirmed(plan, songRequest.confirmation)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Full-song preflight failed'
      const status = /spend|credit|pricing|confirmation|route|Lyria|AppCapabilityGrant/i.test(message) ? 409 : 400
      return reply.status(status).send({ error: true, message })
    }

    const packageId = `songpkg_${randomUUID()}`
    const createdAt = new Date().toISOString()
    const jobs = await prisma.$transaction(plan.variants.map((variant) => {
      const traceId = `trace_${randomUUID()}`
      const input = {
        originalPrompt: songRequest.prompt,
        providerPrompt: variant.prompt,
        title: plan.title,
        genre: songRequest.genre,
        mood: songRequest.mood,
        language: songRequest.language,
        vocalStyle: songRequest.vocalStyle,
        tempo: songRequest.tempo,
        bpm: songRequest.bpm,
        durationSeconds: songRequest.durationSeconds,
        structure: songRequest.structure,
        lyrics: variant.lyrics ?? undefined,
        vocalsRequested: variant.vocalsRequested,
        instrumentalOnly: variant.instrumentalOnly,
        masteringProfile: songRequest.masteringProfile,
        outputFormat: 'wav',
        songPackageId: packageId,
        songVariant: variant.variant,
        adCutSeconds: songRequest.adCutSeconds,
      }
      return prisma.job.create({
        data: {
          appSlug: APP_SLUG,
          capability: 'song_generation',
          prompt: variant.prompt.substring(0, 10000),
          inputJson: JSON.stringify(input),
          metadataJson: JSON.stringify({
            routingMode: 'quality',
            songPackageId: packageId,
            songVariant: variant.variant,
            packageCreatedAt: createdAt,
            premiumSpendDecision: plan.spend,
            orchestraSelectedProvider: plan.selectedProvider,
            orchestraSelectedModel: plan.selectedModel,
            orchestraSelectedExecutorId: plan.selectedExecutorId,
            appGrantSnapshot: grant,
            appGrantSnapshotSource: 'canonical_internal_app',
            appGrantSnapshotAt: createdAt,
          }),
          traceId,
          status: 'queued',
        },
      })
    }))

    try {
      const q = getQueue()
      for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index]!
        const variant = plan.variants[index]!
        const input = JSON.parse(job.inputJson || '{}') as Record<string, unknown>
        await q.add('process-job', {
          jobId: job.id,
          appSlug: APP_SLUG,
          capability: 'song_generation',
          prompt: job.prompt,
          input,
          metadata: {
            routingMode: 'quality',
            songPackageId: packageId,
            songVariant: variant.variant,
            premiumSpendDecision: plan.spend,
            orchestraSelectedProvider: plan.selectedProvider,
            orchestraSelectedModel: plan.selectedModel,
            orchestraSelectedExecutorId: plan.selectedExecutorId,
            appGrantSnapshot: grant,
          },
          traceId: job.traceId,
          executionProfile: 'internal_dashboard',
          appGrantSnapshot: grant,
        }, { jobId: job.id })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue full-song package'
      await prisma.job.updateMany({ where: { id: { in: jobs.map((job) => job.id) } }, data: { status: 'failed', error: message } })
      return reply.status(500).send({ error: true, message })
    }

    return reply.status(202).send({
      success: true,
      packageId,
      plan: publicPlan(plan),
      jobs: jobs.map((job, index) => ({ id: job.id, status: job.status, variant: plan.variants[index]!.variant, traceId: job.traceId })),
    })
  })
}
