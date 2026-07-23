import {
  createCanonicalProviderUsage,
  type AppCapabilityGrantContext,
  type CapabilityKey,
} from '@amarktai/core'
import { getProviderCredentialStatus, resolveProviderApiKey, ProviderConfigError } from '@amarktai/db'
import {
  findCompletedArtifactByTraceId,
  getArtifactFile,
  getArtifactRecord,
  saveArtifact,
} from '@amarktai/artifacts'
import {
  CanonicalProviderError,
  deepinfraEditImage,
  inspectImageBuffer,
} from '@amarktai/providers'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SIZE_PATTERN = /^(?:256|512|768|1024|1536|2048)x(?:256|512|768|1024|1536|2048)$/

interface ImageTransformInput {
  sourceImageArtifactId: string
  maskArtifactId?: string
  size?: string
}

export async function executeDeepInfraImageTransform(payload: WorkerJobData, selectedModel: string): Promise<ProcessorResult> {
  const capability = payload.capability as CapabilityKey
  if (capability !== 'image_edit' && capability !== 'image_to_image') {
    return failure(`Unsupported DeepInfra image transform capability '${payload.capability}'`, selectedModel)
  }

  const input = validateInput(payload.input)
  if (!input.ok) return failure(input.error, selectedModel, { evidenceSource: 'platform_policy', liveProviderProof: false })
  const grant = readGrant(payload, capability)
  if (!grant?.enabled) return failure('AppCapabilityGrant denies this image transform.', selectedModel, { evidenceSource: 'platform_policy', liveProviderProof: false })
  if (!grant.artifactRead) return failure('AppCapabilityGrant denies source-artifact read.', selectedModel, { evidenceSource: 'platform_policy', liveProviderProof: false })
  if (!grant.artifactWrite) return failure('AppCapabilityGrant denies output artifact write.', selectedModel, { evidenceSource: 'platform_policy', liveProviderProof: false })

  try {
    const existing = await findCompletedArtifactByTraceId(payload.traceId, capability)
    if (existing) {
      return {
        success: true,
        status: 'completed',
        provider: 'deepinfra',
        model: selectedModel,
        artifactId: existing.id,
        output: JSON.stringify({
          artifactId: existing.id,
          artifactUrl: existing.storageUrl,
          mimeType: existing.mimeType,
          fileSizeBytes: existing.fileSizeBytes,
          sourceImageArtifactId: input.data.sourceImageArtifactId,
          reused: true,
        }),
        metadata: {
          reused: true,
          evidenceSource: 'live_provider',
          liveProviderProof: true,
          outputValidation: { valid: true, contract: 'reused_image_transform_artifact' },
        },
      }
    }

    const source = await loadOwnedImage(payload.appSlug, input.data.sourceImageArtifactId, 'source image')
    const sourceInspection = inspectImageBuffer(source.buffer, source.mimeType)
    let mask: Awaited<ReturnType<typeof loadOwnedImage>> | undefined
    if (input.data.maskArtifactId) {
      mask = await loadOwnedImage(payload.appSlug, input.data.maskArtifactId, 'mask image')
      const maskInspection = inspectImageBuffer(mask.buffer, mask.mimeType)
      if (maskInspection.width !== sourceInspection.width || maskInspection.height !== sourceInspection.height) {
        return failure('Mask image dimensions must match the source image.', selectedModel, { evidenceSource: 'platform_policy', liveProviderProof: false })
      }
    }

    const credential = await resolveProviderApiKey('deepinfra')
    const providerStatus = await getProviderCredentialStatus('deepinfra')
    const result = await deepinfraEditImage({
      apiKey: credential.apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      model: selectedModel,
      prompt: payload.prompt,
      imageBuffer: source.buffer,
      imageMimeType: source.mimeType,
      maskBuffer: mask?.buffer,
      maskMimeType: mask?.mimeType,
      size: input.data.size,
    })
    const inspection = inspectImageBuffer(result.imageBuffer, result.mimeType)

    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'image',
        subType: capability,
        title: `${capability} output for ${payload.appSlug}`,
        description: `DeepInfra ${capability} output`,
        provider: 'deepinfra',
        model: selectedModel,
        traceId: payload.traceId,
        mimeType: result.mimeType,
        metadata: {
          capability,
          provider: 'deepinfra',
          model: selectedModel,
          sourceImageArtifactId: input.data.sourceImageArtifactId,
          maskArtifactId: input.data.maskArtifactId ?? null,
          width: inspection.width,
          height: inspection.height,
          revisedPrompt: result.revisedPrompt ?? null,
          evidenceSource: 'live_provider',
          liveProviderProof: true,
          providerEndpointFamily: 'deepinfra_openai_v1/images_edits',
        },
      },
      data: result.imageBuffer,
      explicitMimeType: result.mimeType,
    })

    const output = {
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      width: inspection.width,
      height: inspection.height,
      sourceImageArtifactId: input.data.sourceImageArtifactId,
      maskArtifactId: input.data.maskArtifactId ?? null,
      revisedPrompt: result.revisedPrompt ?? null,
    }
    return {
      success: true,
      status: 'completed',
      provider: 'deepinfra',
      model: selectedModel,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: {
        ...output,
        evidenceSource: 'live_provider',
        liveProviderProof: true,
        usage: createCanonicalProviderUsage({ provider: 'deepinfra', model: selectedModel }),
        outputValidation: { valid: true, contract: 'validated_image_transform_artifact_signature' },
      },
    }
  } catch (error) {
    if (error instanceof ProviderConfigError) throw error
    const canonical = error instanceof CanonicalProviderError
      ? error
      : new CanonicalProviderError({ code: 'provider_unavailable', provider: 'deepinfra', message: error instanceof Error ? error.message : 'DeepInfra image transform failed', cause: error })
    return failure(`deepinfra ${canonical.code}: ${canonical.message}`, selectedModel, {
      errorClassification: canonical.code,
      retryable: canonical.retryable,
      httpStatus: canonical.status,
      evidenceSource: 'live_provider',
      liveProviderProof: false,
    })
  }
}

function validateInput(value: unknown): { ok: true; data: ImageTransformInput } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'Image transform input must be an object.' }
  const sourceImageArtifactId = typeof value.sourceImageArtifactId === 'string' ? value.sourceImageArtifactId.trim() : ''
  if (!UUID_PATTERN.test(sourceImageArtifactId)) return { ok: false, error: 'sourceImageArtifactId must be a valid artifact UUID.' }
  const maskArtifactId = typeof value.maskArtifactId === 'string' && value.maskArtifactId.trim() ? value.maskArtifactId.trim() : undefined
  if (maskArtifactId && !UUID_PATTERN.test(maskArtifactId)) return { ok: false, error: 'maskArtifactId must be a valid artifact UUID.' }
  const size = typeof value.size === 'string' && value.size.trim() ? value.size.trim() : undefined
  if (size && !SIZE_PATTERN.test(size)) return { ok: false, error: 'size must use a supported WIDTHxHEIGHT value.' }
  return { ok: true, data: { sourceImageArtifactId, maskArtifactId, size } }
}

function readGrant(payload: WorkerJobData, capability: CapabilityKey): Readonly<AppCapabilityGrantContext> | null {
  const candidate = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  if (!isRecord(candidate)) return null
  const grant = candidate as unknown as AppCapabilityGrantContext
  if (grant.appSlug !== payload.appSlug || grant.capability !== capability) return null
  if (typeof grant.enabled !== 'boolean' || typeof grant.artifactRead !== 'boolean' || typeof grant.artifactWrite !== 'boolean') return null
  return Object.freeze({ ...grant })
}

async function loadOwnedImage(appSlug: string, artifactId: string, label: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const record = await getArtifactRecord(artifactId)
  if (!record || record.status !== 'completed' || record.appSlug !== appSlug) {
    throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: `Authorised ${label} artifact was not found` })
  }
  if (!record.mimeType.startsWith('image/')) {
    throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: `${label} artifact must be an image` })
  }
  const file = await getArtifactFile(artifactId)
  if (!file?.buffer.length) {
    throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: `${label} artifact bytes are missing` })
  }
  inspectImageBuffer(file.buffer, file.mimeType)
  return { buffer: file.buffer, mimeType: file.mimeType }
}

function failure(error: string, model: string, metadata: Record<string, unknown> = {}): ProcessorResult {
  return { success: false, status: 'failed', provider: 'deepinfra', model, error, metadata }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
