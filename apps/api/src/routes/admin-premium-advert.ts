import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma, getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import {
  BLOCKED_OVERRIDE_FIELDS,
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  generateSubtitles,
  getExecutorRegistration,
  getSubtitleMimeType,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import { rankPremiumGenxModels, type PremiumMediaRole } from '@amarktai/core/premium-media-policy'
import {
  assertPremiumAdvertSpendConfirmed,
  buildPremiumAdvertPlan,
  selectPremiumAdvertWinners,
  validatePremiumAdvertRequest,
  type PremiumAdvertPlan,
  type PremiumAdvertRequest,
  type PremiumAdvertRoute,
  type PremiumCandidateEvidence,
} from '@amarktai/core/premium-advert'
import { estimateGenxCredits, genxGetCreditBalance, genxGetModelPricing } from '@amarktai/providers/genx-account-client'
import { resolveInternalDashboardCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'
import { assemblePremiumAdvert, type SelectedPremiumAdvertCandidate } from '../lib/premium-advert-assembly.js'

const APP_SLUG = 'dashboard-long-form'
type JobRecord = NonNullable<Awaited<ReturnType<typeof prisma.job.findFirst>>>
type JobList = Awaited<ReturnType<typeof prisma.job.findMany>>

interface PlannedPremiumAdvert {
  request: PremiumAdvertRequest
  plan: PremiumAdvertPlan
  grants: {
    video: AppCapabilityGrantContext
    narration: AppCapabilityGrantContext
    music: AppCapabilityGrantContext
    parent: AppCapabilityGrantContext
  }
}

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

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
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

function publicPlan(plan: PremiumAdvertPlan) {
  return {
    version: plan.version,
    brandName: plan.brandName,
    campaignTitle: plan.campaignTitle,
    targetDurationSeconds: plan.targetDurationSeconds,
    aspectRatio: plan.aspectRatio,
    scenes: plan.scenes,
    candidateCount: plan.candidates.length,
    candidatesPerScene: plan.candidates.length / plan.scenes.length,
    routes: {
      video: { provider: plan.candidates[0]?.route.provider, model: plan.candidates[0]?.route.model },
      narration: { provider: plan.narration.route.provider, model: plan.narration.route.model },
      music: { provider: plan.music.route.provider, model: plan.music.route.model },
    },
    spend: plan.spend,
    confirmationRequired: plan.confirmationRequired,
  }
}

function parseCapabilities(value: string): CapabilityKey[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is CapabilityKey => typeof item === 'string') : []
  } catch {
    return []
  }
}

async function selectPremiumRoute(capability: CapabilityKey, role: PremiumMediaRole): Promise<Omit<PremiumAdvertRoute, 'estimatedCreditsPerUnit'>> {
  const registration = getExecutorRegistration(capability, 'genx')
  if (!registration) throw new Error(`No GenX executor is registered for ${capability}`)
  const provider = await prisma.aiProvider.findUnique({ where: { providerKey: 'genx' } })
  if (!provider?.enabled || !['live', 'healthy'].includes(provider.healthStatus)) {
    throw new Error(`GenX is not live for premium ${role} execution`)
  }
  const models = await prisma.modelRegistryEntry.findMany({ where: { provider: 'genx', enabled: true, hidden: false } })
  const ranked = rankPremiumGenxModels(models.map((model) => {
    const capabilities = parseCapabilities(model.capabilitiesJson)
    return {
      provider: model.provider,
      modelId: model.modelId,
      displayName: model.displayName,
      category: model.category,
      capabilities,
      qualityTier: model.qualityTier,
      costTier: model.costTier,
      liveProven: model.liveProvenRouteCount > 0,
      accountAccessible: model.accountAccess === 'accessible',
      executable: model.currentAvailability === 'available' && capabilities.includes(capability),
      pricingKnown: ['known', 'admin_manual'].includes(model.pricingConfidence) || model.pricingSource === 'provider_api',
      estimatedCredits: null,
    }
  }), { role, capability, candidateLimit: 12, allowFastVariants: false })
  const selected = ranked[0]
  if (!selected) throw new Error(`No account-accessible, priced premium GenX ${role} model is available`)
  return { provider: 'genx', model: selected.modelId, executorId: registration.id }
}

async function requireGrant(capability: CapabilityKey): Promise<AppCapabilityGrantContext> {
  const resolved = await resolveInternalDashboardCapabilityGrantSnapshot(APP_SLUG, capability)
  if (!resolved?.grant.enabled || !resolved.grant.artifactWrite) {
    throw new Error(`Premium advert grant is disabled or cannot write artifacts: ${capability}`)
  }
  return resolved.grant
}

async function buildPlan(input: unknown): Promise<PlannedPremiumAdvert> {
  const request = validatePremiumAdvertRequest(input)
  const [parentGrant, videoGrant, narrationGrant, musicGrant, videoBase, narrationBase, musicBase, credential, providerStatus] = await Promise.all([
    requireGrant('long_form_video'),
    requireGrant('video_generation'),
    requireGrant('tts'),
    requireGrant('music_generation'),
    selectPremiumRoute('video_generation', 'video_scene'),
    selectPremiumRoute('tts', 'voiceover'),
    selectPremiumRoute('song_generation', 'full_song'),
    resolveProviderApiKey('genx'),
    getProviderCredentialStatus('genx'),
  ])
  const accountOptions = { apiKey: credential.apiKey, baseUrl: providerStatus.baseUrl || undefined }
  const [balance, videoPricing, narrationPricing, musicPricing] = await Promise.all([
    genxGetCreditBalance(accountOptions),
    genxGetModelPricing(videoBase.model, accountOptions),
    genxGetModelPricing(narrationBase.model, accountOptions),
    genxGetModelPricing(musicBase.model, accountOptions),
  ])
  const sceneSeconds = Math.ceil(request.targetDurationSeconds / 6)
  const videoRoute: PremiumAdvertRoute = { ...videoBase, estimatedCreditsPerUnit: estimateGenxCredits(videoPricing, { generations: 1, videoSeconds: sceneSeconds }) }
  const narrationRoute: PremiumAdvertRoute = { ...narrationBase, estimatedCreditsPerUnit: estimateGenxCredits(narrationPricing, { generations: 1, audioSeconds: request.targetDurationSeconds }) }
  const musicRoute: PremiumAdvertRoute = { ...musicBase, estimatedCreditsPerUnit: estimateGenxCredits(musicPricing, { generations: 1, audioSeconds: request.targetDurationSeconds }) }
  return {
    request,
    plan: buildPremiumAdvertPlan({ request, videoRoute, narrationRoute, musicRoute, availableCredits: balance.availableCredits }),
    grants: { parent: parentGrant, video: videoGrant, narration: narrationGrant, music: musicGrant },
  }
}

function exactRouteMetadata(route: PremiumAdvertRoute, grant: AppCapabilityGrantContext, extra: Record<string, unknown>) {
  return {
    ...extra,
    executionProfile: 'internal_dashboard',
    routingMode: 'quality',
    orchestraSelectedProvider: route.provider,
    orchestraSelectedModel: route.model,
    orchestraSelectedExecutorId: route.executorId,
    orchestraExecutorConstraint: route.executorId,
    appGrantSnapshot: grant,
    appGrantSnapshotSource: 'canonical_internal_app',
    appGrantSnapshotAt: new Date().toISOString(),
  }
}

async function createSubtitleArtifact(executionId: string, plan: PremiumAdvertPlan): Promise<string> {
  const content = generateSubtitles({
    scenes: plan.scenes.map((scene) => ({ sceneNumber: scene.sceneNumber, subtitleText: scene.subtitleText, durationSeconds: scene.durationSeconds })),
    format: 'srt',
  })
  if (!content.trim()) throw new Error('Premium advert subtitle generation returned empty output')
  const artifact = await saveArtifact({
    input: {
      appSlug: APP_SLUG,
      type: 'transcript',
      subType: 'premium_advert_subtitles',
      title: `${plan.campaignTitle} subtitles`,
      description: 'Premium advert subtitles generated from the immutable six-scene plan',
      provider: 'local',
      model: 'subtitle-generator',
      traceId: `trace_premium_advert_${executionId}_subtitles`,
      mimeType: getSubtitleMimeType('srt'),
      metadata: { premiumAdvert: true, executionId, sceneCount: plan.scenes.length, format: 'srt' },
    },
    data: Buffer.from(content, 'utf8'),
    explicitMimeType: getSubtitleMimeType('srt'),
  })
  return artifact.id
}

async function loadExecution(id: string): Promise<{ parent: JobRecord; children: JobList; metadata: Record<string, unknown> } | null> {
  const parent = await prisma.job.findFirst({
    where: { appSlug: APP_SLUG, capability: 'long_form_video', parentJobId: null, OR: [{ id }, { executionId: id }] },
  })
  if (!parent) return null
  const children = await prisma.job.findMany({ where: { parentJobId: parent.id }, orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }] })
  return { parent, children, metadata: safeJson(parent.metadataJson) }
}

function executionView(parent: JobRecord, children: JobList, metadata: Record<string, unknown>) {
  const plan = metadata.plan as PremiumAdvertPlan | undefined
  const candidates = children.filter((job) => safeJson(job.metadataJson).premiumAdvertCandidate === true)
  const narration = children.find((job) => safeJson(job.metadataJson).premiumAdvertNarration === true)
  const music = children.find((job) => safeJson(job.metadataJson).premiumAdvertMusic === true)
  const completedScenes = new Set(candidates.filter((job) => job.status === 'completed' && job.artifactId).map((job) => job.sceneNumber)).size
  const readyToFinalize = Boolean(plan)
    && completedScenes === plan!.scenes.length
    && narration?.status === 'completed' && Boolean(narration.artifactId)
    && music?.status === 'completed' && Boolean(music.artifactId)
    && typeof metadata.subtitleArtifactId === 'string'
  return {
    executionId: parent.executionId,
    parentJobId: parent.id,
    status: parent.status,
    progress: parent.progress,
    workflowPhase: parent.workflowPhase,
    error: parent.error,
    finalArtifactId: parent.artifactId,
    plan: plan ? publicPlan(plan) : null,
    candidates: candidates.map((job) => {
      const item = safeJson(job.metadataJson)
      return { jobId: job.id, candidateId: item.candidateId, sceneNumber: job.sceneNumber, candidateIndex: item.candidateIndex, status: job.status, provider: job.provider, model: job.model, artifactId: job.artifactId, error: job.error }
    }),
    narration: narration ? { jobId: narration.id, status: narration.status, provider: narration.provider, model: narration.model, artifactId: narration.artifactId, error: narration.error } : null,
    music: music ? { jobId: music.id, status: music.status, provider: music.provider, model: music.model, artifactId: music.artifactId, error: music.error } : null,
    subtitleArtifactId: metadata.subtitleArtifactId ?? null,
    winners: metadata.winners ?? null,
    readyToFinalize,
  }
}

async function enqueueJobs(queue: Queue, jobs: JobList): Promise<void> {
  for (const job of jobs) {
    const metadata = safeJson(job.metadataJson)
    const payload: JobPayload = {
      jobId: job.id,
      appSlug: job.appSlug,
      capability: job.capability as CapabilityKey,
      executionProfile: 'internal_dashboard',
      prompt: job.prompt,
      input: safeJson(job.inputJson),
      metadata,
      traceId: job.traceId,
      routingMode: 'quality',
      appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext,
    }
    await queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
    await prisma.job.update({ where: { id: job.id }, data: { queueJobId: job.id, queuedAt: new Date() } })
  }
}

export async function adminPremiumAdvertRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for premium advert execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.get('/api/admin/premium-advert/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    const required = ['video_generation', 'tts', 'song_generation', 'long_form_video']
    return reply.send({
      success: true,
      status: {
        capability: 'premium_amarktai_advert',
        requiredCapabilities: required.map((capability) => {
          const row = truth.capabilities.find((entry) => entry.capability === capability)
          return { capability, executableNow: row?.executableNow === true, liveProven: row?.liveProven === true, blockedReasons: row?.blockedReasons ?? [] }
        }),
        provider: 'genx',
        candidateRange: { minimum: 2, maximum: 4 },
        confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND',
      },
    })
  })

  app.post('/api/admin/premium-advert/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })
    try {
      const planned = await buildPlan(body)
      return reply.send({ success: true, providerCallsStarted: false, plan: publicPlan(planned.plan) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Premium advert planning failed'
      return reply.status(/credit|pricing|account-accessible|live|grant|executor/i.test(message) ? 409 : 400).send({ error: true, message })
    }
  })

  app.post('/api/admin/premium-advert/generate', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    let built: PlannedPremiumAdvert
    try {
      built = await buildPlan(body)
      assertPremiumAdvertSpendConfirmed(built.plan, built.request.confirmation)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Premium advert preflight failed'
      return reply.status(/credit|pricing|confirmation|account-accessible|live|grant|executor/i.test(message) ? 409 : 400).send({ error: true, message })
    }

    const executionId = `premium-ad-${randomUUID()}`
    const createdAt = new Date().toISOString()
    const parent = await prisma.job.create({
      data: {
        appSlug: APP_SLUG,
        capability: 'long_form_video',
        prompt: built.request.prompt,
        inputJson: JSON.stringify(built.request),
        metadataJson: JSON.stringify({ premiumAdvert: true, executionId, request: built.request, plan: built.plan, spend: built.plan.spend, createdAt, executionProfile: 'internal_dashboard', appGrantSnapshot: built.grants.parent }),
        traceId: `trace_premium_advert_${executionId}`,
        status: 'processing', progress: 0, executionId, workflowPhase: 'candidate_submission',
      },
    })

    let subtitleArtifactId = ''
    try {
      subtitleArtifactId = await createSubtitleArtifact(executionId, built.plan)
      const jobs = await prisma.$transaction(async (tx) => {
        const candidates: JobRecord[] = []
        for (const candidate of built.plan.candidates) {
          candidates.push(await tx.job.create({
            data: {
              appSlug: APP_SLUG,
              capability: 'video_generation',
              prompt: candidate.prompt,
              inputJson: JSON.stringify({ duration: candidate.durationSeconds, aspectRatio: built.plan.aspectRatio, style: built.request.style, negativePrompt: candidate.negativePrompt, premiumAdvertCandidateId: candidate.candidateId }),
              metadataJson: JSON.stringify(exactRouteMetadata(candidate.route, built.grants.video, { premiumAdvert: true, premiumAdvertCandidate: true, executionId, parentJobId: parent.id, candidateId: candidate.candidateId, candidateIndex: candidate.candidateIndex, sceneNumber: candidate.sceneNumber, sceneDurationSeconds: candidate.durationSeconds, planVersion: built.plan.version, spend: built.plan.spend })),
              traceId: `trace_premium_advert_${executionId}_${candidate.candidateId}`,
              status: 'queued', parentJobId: parent.id, executionId, sceneNumber: candidate.sceneNumber, workflowPhase: 'premium_candidate_created',
            },
          }))
        }
        const narration = await tx.job.create({
          data: {
            appSlug: APP_SLUG, capability: 'tts', prompt: built.plan.narration.text,
            inputJson: JSON.stringify({ text: built.plan.narration.text, speed: 1, outputFormat: 'wav', language: 'en', style: built.plan.narration.voiceStyle }),
            metadataJson: JSON.stringify(exactRouteMetadata(built.plan.narration.route, built.grants.narration, { premiumAdvert: true, premiumAdvertNarration: true, executionId, parentJobId: parent.id, spend: built.plan.spend })),
            traceId: `trace_premium_advert_${executionId}_narration`, status: 'queued', parentJobId: parent.id, executionId, workflowPhase: 'premium_narration_created',
          },
        })
        const music = await tx.job.create({
          data: {
            appSlug: APP_SLUG, capability: 'song_generation', prompt: built.plan.music.prompt,
            inputJson: JSON.stringify({ originalPrompt: built.request.musicBrief, providerPrompt: `${built.plan.music.prompt} Premium cinematic master for a ${built.plan.targetDurationSeconds}-second brand advert. No vocals or spoken words.`, durationSeconds: built.plan.targetDurationSeconds, instrumentalOnly: true, vocalsRequested: false, masteringProfile: 'cinematic', outputFormat: 'wav' }),
            metadataJson: JSON.stringify(exactRouteMetadata(built.plan.music.route, built.grants.music, { premiumAdvert: true, premiumAdvertMusic: true, executionId, parentJobId: parent.id, spend: built.plan.spend })),
            traceId: `trace_premium_advert_${executionId}_music`, status: 'queued', parentJobId: parent.id, executionId, workflowPhase: 'premium_music_created',
          },
        })
        return [...candidates, narration, music]
      })

      await prisma.job.update({ where: { id: parent.id }, data: { metadataJson: JSON.stringify({ ...safeJson(parent.metadataJson), subtitleArtifactId }) } })
      await enqueueJobs(getQueue(), jobs)
      return reply.status(202).send({ success: true, providerCallsStarted: true, executionId, parentJobId: parent.id, subtitleArtifactId, plan: publicPlan(built.plan), jobs: jobs.map((job) => ({ id: job.id, capability: job.capability, sceneNumber: job.sceneNumber, status: job.status })) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Premium advert job creation failed'
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', error: message, workflowPhase: 'submission_failed', completedAt: new Date() } })
      return reply.status(500).send({ error: true, message, executionId, subtitleArtifactId: subtitleArtifactId || null })
    }
  })

  app.get('/api/admin/premium-advert/executions/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadExecution(id)
    if (!loaded || loaded.metadata.premiumAdvert !== true) return reply.status(404).send({ error: true, message: 'Premium advert execution not found' })
    return reply.send({ success: true, execution: executionView(loaded.parent, loaded.children, loaded.metadata) })
  })

  app.post('/api/admin/premium-advert/executions/:id/finalize', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadExecution(id)
    if (!loaded || loaded.metadata.premiumAdvert !== true) return reply.status(404).send({ error: true, message: 'Premium advert execution not found' })
    if (loaded.parent.status === 'completed' && loaded.parent.artifactId) {
      return reply.send({ success: true, reused: true, artifactId: loaded.parent.artifactId, execution: executionView(loaded.parent, loaded.children, loaded.metadata) })
    }

    const plan = loaded.metadata.plan as PremiumAdvertPlan | undefined
    if (!plan) return reply.status(409).send({ error: true, message: 'Premium advert plan is missing' })
    const candidates = loaded.children.filter((job) => safeJson(job.metadataJson).premiumAdvertCandidate === true && job.status === 'completed' && job.artifactId)
    const narration = loaded.children.find((job) => safeJson(job.metadataJson).premiumAdvertNarration === true && job.status === 'completed' && job.artifactId)
    const music = loaded.children.find((job) => safeJson(job.metadataJson).premiumAdvertMusic === true && job.status === 'completed' && job.artifactId)
    const subtitleArtifactId = typeof loaded.metadata.subtitleArtifactId === 'string' ? loaded.metadata.subtitleArtifactId : ''
    if (!narration?.artifactId || !music?.artifactId || !subtitleArtifactId) return reply.status(409).send({ error: true, message: 'Narration, music and subtitles must be complete before final assembly' })

    const artifacts = await prisma.artifact.findMany({ where: { id: { in: candidates.map((job) => job.artifactId!) } } })
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]))
    const evidence: PremiumCandidateEvidence[] = candidates.flatMap((job) => {
      const item = safeJson(job.metadataJson)
      const artifact = byId.get(job.artifactId!)
      if (!artifact) return []
      const media = safeJson(artifact.metadata)
      const width = Number(media.width ?? 0)
      const height = Number(media.height ?? 0)
      const durationSeconds = Number(media.duration ?? media.durationSeconds ?? 0)
      return [{ candidateId: String(item.candidateId), sceneNumber: Number(job.sceneNumber), model: job.model || String(item.orchestraSelectedModel || ''), width: width > 0 ? width : null, height: height > 0 ? height : null, durationSeconds: durationSeconds > 0 ? durationSeconds : null, fileSizeBytes: artifact.fileSizeBytes, outputValidated: artifact.mimeType.startsWith('video/') && artifact.fileSizeBytes > 0 && width > 0 && height > 0 && durationSeconds > 0 }]
    })

    let winners
    try {
      winners = selectPremiumAdvertWinners(evidence, plan.scenes)
    } catch (error) {
      return reply.status(409).send({ error: true, message: error instanceof Error ? error.message : 'Candidate selection failed' })
    }
    const selected: SelectedPremiumAdvertCandidate[] = winners.map((winner) => {
      const job = candidates.find((candidate) => safeJson(candidate.metadataJson).candidateId === winner.candidateId)
      if (!job?.artifactId) throw new Error(`Winning candidate job is missing: ${winner.candidateId}`)
      const scene = plan.scenes.find((item) => item.sceneNumber === winner.sceneNumber)!
      return { candidateId: winner.candidateId, sceneNumber: winner.sceneNumber, jobId: job.id, artifactId: job.artifactId, provider: job.provider || 'genx', model: job.model || '', durationSeconds: scene.durationSeconds, score: winner.score }
    })

    await prisma.job.update({ where: { id: loaded.parent.id }, data: { status: 'processing', workflowPhase: 'premium_assembly', progress: 95, error: null } })
    try {
      const assembled = await assemblePremiumAdvert({ executionId: loaded.parent.executionId || loaded.parent.id, parentJobId: loaded.parent.id, plan, winners: selected, narrationArtifactId: narration.artifactId, musicArtifactId: music.artifactId, subtitleArtifactId })
      const metadata = { ...loaded.metadata, winners: selected, finalAssembly: assembled }
      const parent = await prisma.job.update({
        where: { id: loaded.parent.id },
        data: { status: 'completed', progress: 100, workflowPhase: 'completed', artifactId: assembled.artifactId, output: JSON.stringify({ artifactId: assembled.artifactId, winners: selected, assembly: assembled }), metadataJson: JSON.stringify(metadata), completedAt: new Date(), error: null },
      })
      const children = await prisma.job.findMany({ where: { parentJobId: parent.id }, orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }] })
      return reply.send({ success: true, reused: false, artifactId: assembled.artifactId, assembly: assembled, execution: executionView(parent, children, metadata) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Premium advert assembly failed'
      await prisma.job.update({ where: { id: loaded.parent.id }, data: { status: 'failed', workflowPhase: 'assembly_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, message })
    }
  })
}
