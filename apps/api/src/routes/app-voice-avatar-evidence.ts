import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { FastifyInstance, FastifyReply } from 'fastify'
import multipart from '@fastify/multipart'
import {
  VOICE_AVATAR_EVIDENCE_CONFIG,
  VoiceAvatarEvidencePurposeSchema,
  validateVoiceAvatarEvidenceUpload,
} from '@amarktai/core/voice-avatar-evidence'
import { saveArtifact } from '@amarktai/artifacts'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { authenticateAppKey } from './jobs.js'

function safeFilename(value: string | undefined): string {
  const normalized = basename((value || 'evidence').replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return normalized || 'evidence'
}

function uploadError(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : 'VOICE_AVATAR_EVIDENCE_UPLOAD_FAILED'
  if (code === 'VOICE_AVATAR_EVIDENCE_TOO_LARGE') {
    return reply.status(413).send({ error: true, code, message: 'The uploaded evidence exceeds the purpose-specific size limit.' })
  }
  if (['VOICE_AVATAR_EVIDENCE_TYPE_UNKNOWN', 'VOICE_AVATAR_EVIDENCE_MIME_MISMATCH', 'VOICE_AVATAR_EVIDENCE_TYPE_NOT_ALLOWED', 'VOICE_AVATAR_EVIDENCE_ARTIFACT_TYPE_NOT_ALLOWED'].includes(code)) {
    return reply.status(415).send({ error: true, code, message: 'The uploaded evidence type is not allowed or does not match its declared MIME type.' })
  }
  if (['VOICE_AVATAR_EVIDENCE_EMPTY', 'VOICE_AVATAR_EVIDENCE_PURPOSE_INVALID'].includes(code)) {
    return reply.status(400).send({ error: true, code, message: 'The evidence upload request is invalid.' })
  }
  return reply.status(500).send({ error: true, code: 'VOICE_AVATAR_EVIDENCE_UPLOAD_FAILED', message: 'The evidence artifact could not be stored.' })
}

export async function appVoiceAvatarEvidenceRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    throwFileSizeLimit: true,
    attachFieldsToBody: false,
    limits: {
      fileSize: 150 * 1024 * 1024,
      files: 1,
      fields: 0,
      parts: 1,
      fieldNameSize: 100,
      headerPairs: 200,
    },
  })

  app.post('/api/v1/profile-artifacts/:purpose', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    }

    const parsedPurpose = VoiceAvatarEvidencePurposeSchema.safeParse((request.params as { purpose?: string }).purpose)
    if (!parsedPurpose.success) {
      return reply.status(400).send({
        error: true,
        code: 'VOICE_AVATAR_EVIDENCE_PURPOSE_INVALID',
        message: 'The requested profile evidence purpose is invalid.',
      })
    }
    const purpose = parsedPurpose.data
    const config = VOICE_AVATAR_EVIDENCE_CONFIG[purpose]
    const grant = await resolveAppCapabilityGrantSnapshot(
      auth.app!.slug,
      config.capability,
      auth.allowedCapabilities ?? [],
    )
    if (!grant?.grant.enabled) {
      return reply.status(403).send({
        error: true,
        code: 'PROFILE_EVIDENCE_GRANT_REQUIRED',
        message: `The '${config.capability}' grant is required for '${purpose}'.`,
        missingCapabilities: [config.capability],
      })
    }
    if (!grant.grant.artifactWrite) {
      return reply.status(403).send({
        error: true,
        code: 'PROFILE_EVIDENCE_ARTIFACT_WRITE_REQUIRED',
        message: `The '${config.capability}' grant must allow artifact writes.`,
      })
    }
    if (!request.isMultipart()) {
      return reply.status(415).send({
        error: true,
        code: 'PROFILE_EVIDENCE_MULTIPART_REQUIRED',
        message: "Upload one multipart file using the field name 'file'.",
      })
    }

    try {
      const part = await request.file({
        limits: {
          fileSize: config.maxBytes,
          files: 1,
          fields: 0,
          parts: 1,
          fieldNameSize: 100,
          headerPairs: 200,
        },
      })
      if (!part) {
        return reply.status(400).send({ error: true, code: 'PROFILE_EVIDENCE_FILE_REQUIRED', message: "Multipart field 'file' is required." })
      }
      const buffer = await part.toBuffer()
      if (part.fieldname !== 'file') {
        return reply.status(400).send({ error: true, code: 'PROFILE_EVIDENCE_FIELD_INVALID', message: "The multipart file field must be named 'file'." })
      }
      const validated = validateVoiceAvatarEvidenceUpload({
        purpose,
        buffer,
        declaredMimeType: part.mimetype,
      })
      const uploadedAt = new Date().toISOString()
      const originalFilename = safeFilename(part.filename)
      const traceId = `trace_profile_evidence_${randomUUID()}`
      const artifact = await saveArtifact({
        input: {
          appSlug: auth.app!.slug,
          type: validated.artifactType,
          subType: validated.config.subType,
          title: originalFilename,
          description: `Governed ${purpose.replaceAll('_', ' ')} evidence.`,
          provider: 'amarktai-network',
          model: 'secure-profile-upload-v1',
          traceId,
          mimeType: validated.detectedMimeType,
          metadata: {
            voiceAvatarProfileEvidence: true,
            purpose,
            originalFilename,
            detectedMimeType: validated.detectedMimeType,
            declaredMimeType: validated.declaredMimeType,
            grantCapability: validated.config.capability,
            grantSource: grant.source,
            uploadedAt,
          },
        },
        data: buffer,
        explicitMimeType: validated.detectedMimeType,
      })
      return reply.status(201).send({
        artifactId: artifact.id,
        type: validated.artifactType,
        subType: validated.config.subType,
        purpose,
        mimeType: artifact.mimeType,
        fileSizeBytes: artifact.fileSizeBytes,
        status: 'completed',
        uploadedAt,
      })
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        return reply.status(413).send({
          error: true,
          code: 'VOICE_AVATAR_EVIDENCE_TOO_LARGE',
          message: 'The uploaded evidence exceeds the purpose-specific size limit.',
        })
      }
      return uploadError(reply, error)
    }
  })
}
