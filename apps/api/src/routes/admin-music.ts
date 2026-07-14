import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import multipart from '@fastify/multipart'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import {
  BLOCKED_OVERRIDE_FIELDS,
  MAX_REFERENCE_AUDIO_BYTES,
  MAX_REFERENCE_AUDIO_DURATION_SECONDS,
  QUEUE_NAMES,
  analyzeMusicReferenceAudio,
  createMusicGenerationPlan,
  createMusicProviderPrompt,
  getMusicCapabilityStatus,
  isValidMimeForType,
  validateMusicGenerationRequest,
  validateMusicReferenceUploadRequest,
  type MusicInspirationProfile,
  type MusicReferenceUploadRequest,
} from '@amarktai/core'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

const APP_SLUG = 'dashboard-music'
const REFERENCE_AUDIO_MULTIPART_LIMIT_BYTES = MAX_REFERENCE_AUDIO_BYTES

async function getAdminMusicCapabilityStatus(app: FastifyInstance) {
  const truth = await buildAdminRuntimeTruth(app)
  const canonical = truth.capabilities.find((capability) => capability.capability === 'music_generation')

  const legacy = getMusicCapabilityStatus({
    configured: canonical?.configured === true,
    infrastructureReady: canonical?.infrastructureReady === true,
    policyAllowed: canonical?.policyAllowed !== false,
    liveProven: canonical?.liveProven === true,
    lastProofAt: canonical?.lastProofAt ?? null,
  })

  const actionableMusicBlockers = canonical?.blockedReasons?.filter((reason) => reason !== 'live_proof_missing') ?? []

  return {
    ...legacy,
    ...canonical,
    musicGenerationReady: canonical?.executableNow === true,
    executionBlocked: canonical?.executableNow !== true,
    blockedReason: actionableMusicBlockers.length > 0
      ? `Music execution blocked: ${actionableMusicBlockers.join(', ')}.`
      : legacy.blockedReason,
    canonicalTruth: canonical,
  }
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

function blockedOverrideField(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) {
    if (field in input) return field
  }
  const nestedInput = typeof input.input === 'object' && input.input !== null && !Array.isArray(input.input)
    ? input.input as Record<string, unknown>
    : null
  if (nestedInput) {
    for (const field of BLOCKED_OVERRIDE_FIELDS) {
      if (field in nestedInput) return `input.${field}`
    }
  }
  return null
}

function parseMusicRequest(body: Record<string, unknown>) {
  const nestedInput = typeof body.input === 'object' && body.input !== null && !Array.isArray(body.input)
    ? body.input as Record<string, unknown>
    : null
  const input = nestedInput
    ? { ...nestedInput, prompt: body.prompt ?? nestedInput.prompt }
    : body

  return validateMusicGenerationRequest(input)
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.substring(0, 180) || 'reference-audio'
}

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name] as { value?: unknown } | undefined
  return typeof field?.value === 'string' ? field.value : undefined
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseRightsField(fields: Record<string, unknown>): MusicReferenceUploadRequest['rights'] {
  const rightsJson = fieldValue(fields, 'rights')
  if (rightsJson) {
    return JSON.parse(rightsJson) as MusicReferenceUploadRequest['rights']
  }
  return {
    accepted: fieldValue(fields, 'rightsAccepted') === 'true',
    basis: fieldValue(fields, 'rightsBasis') as MusicReferenceUploadRequest['rights']['basis'],
    statement: fieldValue(fields, 'rightsStatement') ?? '',
  }
}

async function getAdminSubject(app: FastifyInstance, request: FastifyRequest): Promise<string> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) return 'admin'
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    const claims = payload as unknown as Record<string, unknown>
    const candidate = claims.sub ?? claims.email ?? claims.username
    return typeof candidate === 'string' && candidate ? candidate : 'admin'
  } catch {
    return 'admin'
  }
}

async function loadReferenceProfile(artifactId: string, appSlug: string): Promise<MusicInspirationProfile> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } })
  if (!artifact) {
    throw new Error('Reference audio artifact not found')
  }
  if (artifact.appSlug !== appSlug) {
    throw new Error('Reference audio artifact does not belong to this app')
  }
  if (artifact.status !== 'completed') {
    throw new Error('Reference audio artifact is not ready')
  }
  if (!artifact.mimeType.startsWith('audio/')) {
    throw new Error('Reference audio artifact must be audio')
  }

  const metadata = parseJsonObject(artifact.metadata)
  const rights = metadata.rightsDeclaration as Record<string, unknown> | undefined
  if (rights?.accepted !== true) {
    throw new Error('Reference audio rights declaration is missing')
  }

  const existingProfile = metadata.musicInspirationProfile as MusicInspirationProfile | undefined
  if (existingProfile?.sourceArtifactId === artifact.id) return existingProfile

  const profile = analyzeMusicReferenceAudio({
    artifactId: artifact.id,
    mimeType: artifact.mimeType,
    fileSizeBytes: artifact.fileSizeBytes,
    durationSeconds: typeof metadata.durationSeconds === 'number' ? metadata.durationSeconds : null,
  })

  await prisma.artifact.update({
    where: { id: artifact.id },
    data: {
      metadata: JSON.stringify({
        ...metadata,
        musicInspirationProfile: profile,
        analysedAt: new Date().toISOString(),
      }),
    },
  })

  return profile
}

export async function adminMusicRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: REFERENCE_AUDIO_MULTIPART_LIMIT_BYTES,
      files: 1,
      fields: 12,
      parts: 14,
    },
  })

  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.get('/api/admin/music/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const status = await getAdminMusicCapabilityStatus(app)
    return reply.send({
      success: true,
      status,
      message: status.blockedReason,
    })
  })

  app.post('/api/admin/music/reference-audio', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const grantResolution = await resolveAppCapabilityGrantSnapshot(APP_SLUG, 'music_generation')
    if (!grantResolution?.grant.enabled || !grantResolution.grant.artifactWrite) {
      return reply.status(403).send({ error: true, message: 'Music AppCapabilityGrant denies artifact upload' })
    }

    try {
      if (!request.isMultipart()) {
        return reply.status(415).send({ error: true, message: 'Reference audio upload must use multipart/form-data' })
      }

      const file = await request.file({
        limits: {
          fileSize: REFERENCE_AUDIO_MULTIPART_LIMIT_BYTES,
          files: 1,
        },
      })
      if (!file) {
        return reply.status(400).send({ error: true, message: 'Reference audio file is required' })
      }

      const fields = file.fields as Record<string, unknown>
      const upload = validateMusicReferenceUploadRequest({
        appSlug: APP_SLUG,
        filename: sanitizeFilename(file.filename || fieldValue(fields, 'filename') || 'reference-audio'),
        mimeType: file.mimetype || fieldValue(fields, 'mimeType') || 'application/octet-stream',
        durationSeconds: parseOptionalNumber(fieldValue(fields, 'durationSeconds')),
        rights: parseRightsField(fields),
      })

      const data = await file.toBuffer()
      if (data.length === 0) {
        return reply.status(400).send({ error: true, message: 'Reference audio upload is empty' })
      }
      if (file.file.truncated) {
        return reply.status(413).send({ error: true, message: `Reference audio exceeds ${MAX_REFERENCE_AUDIO_BYTES} bytes` })
      }
      if (data.length > MAX_REFERENCE_AUDIO_BYTES) {
        return reply.status(413).send({ error: true, message: `Reference audio exceeds ${MAX_REFERENCE_AUDIO_BYTES} bytes` })
      }
      if (upload.durationSeconds && upload.durationSeconds > MAX_REFERENCE_AUDIO_DURATION_SECONDS) {
        return reply.status(413).send({ error: true, message: `Reference audio exceeds ${MAX_REFERENCE_AUDIO_DURATION_SECONDS} seconds` })
      }
      if (!isValidMimeForType('audio', upload.mimeType)) {
        return reply.status(400).send({ error: true, message: `Unsupported reference audio MIME type: ${upload.mimeType}` })
      }

      const appSlug = APP_SLUG
      const traceId = `trace_${randomUUID()}`
      const checksum = createHash('sha256').update(data).digest('hex')
      const uploader = await getAdminSubject(app, request)
      const provenance = {
        source: 'admin_reference_audio_upload',
        noRemoteUrlIngestion: true,
        uploadedAt: new Date().toISOString(),
      }

      const artifact = await saveArtifact({
        input: {
          appSlug,
          type: 'audio',
          subType: 'music_reference',
          title: upload.filename,
          description: 'User-declared legal reference track for abstract music inspiration analysis.',
          provider: 'user_upload',
          model: 'none',
          traceId,
          mimeType: upload.mimeType,
          metadata: {
            rightsDeclaration: upload.rights,
            rightsBasis: upload.rights.basis,
            uploader,
            checksumSha256: checksum,
            durationSeconds: upload.durationSeconds ?? null,
            provenance,
            directReferenceAudioConditioningReady: false,
          },
        },
        data,
        explicitMimeType: upload.mimeType,
      })

      const profile = analyzeMusicReferenceAudio({
        artifactId: artifact.id,
        mimeType: artifact.mimeType,
        fileSizeBytes: artifact.fileSizeBytes,
        durationSeconds: upload.durationSeconds ?? null,
      })

      await prisma.artifact.update({
        where: { id: artifact.id },
        data: {
          metadata: JSON.stringify({
            rightsDeclaration: upload.rights,
            rightsBasis: upload.rights.basis,
            uploader,
            checksumSha256: checksum,
            durationSeconds: upload.durationSeconds ?? null,
            provenance,
            musicInspirationProfile: profile,
            analysedAt: new Date().toISOString(),
            directReferenceAudioConditioningReady: false,
          }),
        },
      })

      return reply.status(201).send({
        success: true,
        artifactId: artifact.id,
        appSlug,
        mimeType: artifact.mimeType,
        fileSizeBytes: artifact.fileSizeBytes,
        checksumSha256: checksum,
        rightsBasis: upload.rights.basis,
        profile,
        referenceAudioAnalysisReady: true,
        referenceAudioConditioningReady: false,
        artifactUrl: artifact.storageUrl,
      })
    } catch (error) {
      if (error instanceof Error && /File too large|request file too large|too large/i.test(error.message)) {
        return reply.status(413).send({
          error: true,
          message: `Reference audio exceeds ${MAX_REFERENCE_AUDIO_BYTES} bytes`,
        })
      }
      return reply.status(400).send({
        error: true,
        message: error instanceof Error ? error.message : 'Invalid reference audio upload',
      })
    }
  })

  app.post('/api/admin/music/reference-audio/:id/analyze', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const grantResolution = await resolveAppCapabilityGrantSnapshot(APP_SLUG, 'music_generation')
    if (!grantResolution?.grant.enabled || !grantResolution.grant.artifactRead) {
      return reply.status(403).send({ error: true, message: 'Music AppCapabilityGrant denies artifact read' })
    }

    const { id } = request.params as { id: string }
    try {
      const profile = await loadReferenceProfile(id, APP_SLUG)
      return reply.send({
        success: true,
        artifactId: id,
        profile,
        referenceAudioAnalysisReady: true,
        referenceAudioConditioningReady: false,
        message: 'Reference audio analysed into abstract non-copying inspiration profile. Direct provider conditioning is not enabled.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: error instanceof Error ? error.message : 'Reference audio analysis failed',
      })
    }
  })

  app.post('/api/admin/music/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) {
      return reply.status(400).send({
        error: true,
        message: `Provider/model override not allowed. Blocked field: ${override}`,
      })
    }

    try {
      const musicRequest = parseMusicRequest(body)
      const rawPlan = createMusicGenerationPlan(musicRequest)
      const status = await getAdminMusicCapabilityStatus(app)
      let inspirationProfile: MusicInspirationProfile | null = null
      if (musicRequest.referenceAudioArtifactId) {
        inspirationProfile = await loadReferenceProfile(musicRequest.referenceAudioArtifactId, APP_SLUG)
      }
      const plan = {
        ...rawPlan,
        providerPrompt: createMusicProviderPrompt(musicRequest, rawPlan.normalizedPrompt, inspirationProfile),
        executionReady: status.executableNow && rawPlan.blockedReasons.length === 0,
        blockedReason: rawPlan.blockedReasons.length > 0 ? rawPlan.blockedReason : status.blockedReason || rawPlan.blockedReason,
      }

      return reply.send({
        success: true,
        plan,
        status,
        executionReady: status.executableNow && plan.executionReady,
        message: status.executableNow
          ? 'Music generation plan created. Ready to execute.'
          : `Music generation plan created. ${status.blockedReason}`,
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid music generation request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })

  app.post('/api/admin/music/generate', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) {
      return reply.status(400).send({
        error: true,
        message: `Provider/model override not allowed. Blocked field: ${override}`,
      })
    }

    try {
      const musicRequest = parseMusicRequest(body)
      const rawPlan = createMusicGenerationPlan(musicRequest)
      const status = await getAdminMusicCapabilityStatus(app)
      let inspirationProfile: MusicInspirationProfile | null = null
      if (musicRequest.referenceAudioArtifactId) {
        inspirationProfile = await loadReferenceProfile(musicRequest.referenceAudioArtifactId, APP_SLUG)
      }
      const plan = {
        ...rawPlan,
        providerPrompt: createMusicProviderPrompt(musicRequest, rawPlan.normalizedPrompt, inspirationProfile),
        executionReady: status.executableNow && rawPlan.blockedReasons.length === 0,
        blockedReason: rawPlan.blockedReasons.length > 0 ? rawPlan.blockedReason : status.blockedReason || rawPlan.blockedReason,
      }

      // Creation gate: preserve explicit development/test gating.
      // Music may be queued only when implementation gates are present.
      // liveProven=true is NOT required to run the first proof.
      if (!status.executableNow || !plan.executionReady) {
        const blockerMessage = rawPlan.blockedReasons.length > 0
          ? rawPlan.blockedReason
          : status.blockedReason || plan.blockedReason
        return reply.status(409).send({
          error: true,
          success: false,
          executionBlocked: true,
          message: blockerMessage,
          plan,
          status,
          missingDependencies: blockerMessage
            .replace('Music execution blocked: ', '')
            .replace('Music generation blocked: ', '')
            .replace(/\.$/, '')
            .split(', '),
        })
      }

      const grantResolution = await resolveAppCapabilityGrantSnapshot(APP_SLUG, 'music_generation')
      if (!grantResolution?.grant.enabled) {
        return reply.status(403).send({ error: true, message: 'No enabled AppCapabilityGrant exists for dashboard-music/music_generation' })
      }

      // Create canonical Job
      const appSlug = APP_SLUG
      const traceId = `trace_${randomUUID()}`
      const safePrompt = plan.providerPrompt.substring(0, 10000)
      const inputObj = {
        originalPrompt: musicRequest.prompt.substring(0, 10000),
        providerPrompt: safePrompt,
        genre: musicRequest.genre,
        mood: musicRequest.mood,
        tempo: musicRequest.tempo,
        bpm: musicRequest.bpm,
        arrangement: musicRequest.arrangement ?? [],
        durationSeconds: musicRequest.durationSeconds,
        instrumentalOnly: musicRequest.instrumentalOnly,
        style: musicRequest.style,
        outputFormat: musicRequest.outputFormat,
        referenceAudioArtifactId: musicRequest.referenceAudioArtifactId ?? null,
        referenceAudioConditioningReady: false,
      }

      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'music_generation',
          prompt: safePrompt,
          inputJson: JSON.stringify(inputObj),
          metadataJson: JSON.stringify({
            routingMode: musicRequest.routingMode,
            appGrantSnapshot: grantResolution.grant,
            appGrantSnapshotSource: grantResolution.source,
            appGrantSnapshotAt: new Date().toISOString(),
          }),
          traceId,
          status: 'queued',
        },
      })

      // Enqueue in BullMQ
      try {
        const q = getQueue()
        const payload = {
          jobId: job.id,
          appSlug,
          capability: 'music_generation',
          prompt: safePrompt,
          input: inputObj,
          metadata: {
            routingMode: musicRequest.routingMode,
            originalPrompt: musicRequest.prompt,
            musicFeatureContract: rawPlan.derivedPromptOnlyFields,
            referenceAudioAnalysisMode: rawPlan.referenceAudioAnalysisMode,
            appGrantSnapshot: grantResolution.grant,
            appGrantSnapshotSource: grantResolution.source,
            appGrantSnapshotAt: new Date().toISOString(),
          },
          traceId,
          appGrantSnapshot: grantResolution.grant,
        }
        app.log.info({ queueName: QUEUE_NAMES.JOBS, jobId: job.id, appSlug, capability: 'music_generation', traceId }, 'Enqueuing music generation job')
        await q.add('process-job', payload, { jobId: job.id })
      } catch {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: 'Failed to enqueue job' },
        })
        return reply.status(500).send({ error: true, message: 'Failed to enqueue job' })
      }

      return reply.status(202).send({
        jobId: job.id,
        status: job.status,
        capability: job.capability,
        traceId,
        createdAt: job.createdAt?.toISOString(),
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid music generation request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })
}
