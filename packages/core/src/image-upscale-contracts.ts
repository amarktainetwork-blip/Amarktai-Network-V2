import { z } from 'zod'

export const IMAGE_UPSCALE_FACTORS = [2, 4] as const
export const IMAGE_UPSCALE_OUTPUT_FORMATS = ['png', 'jpeg'] as const
export const IMAGE_UPSCALE_EVIDENCE_SOURCES = ['internal_ffmpeg', 'platform_policy'] as const

export const ImageUpscaleRequestSchema = z.object({
  sourceImageArtifactId: z.string().uuid(),
  scaleFactor: z.union([z.literal(2), z.literal(4)]).default(2),
  outputFormat: z.enum(IMAGE_UPSCALE_OUTPUT_FORMATS).default('png'),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/).optional(),
  maxCredits: z.number().positive().max(1_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type ImageUpscaleRequest = z.infer<typeof ImageUpscaleRequestSchema>

export const ImageUpscaleOutputSchema = z.object({
  artifactId: z.string().uuid(),
  artifactUrl: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  fileSizeBytes: z.number().int().positive(),
  sourceArtifactId: z.string().uuid(),
  sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  outputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scaleFactor: z.union([z.literal(2), z.literal(4)]),
  evidence: z.object({
    evidenceSource: z.literal('internal_ffmpeg'),
    liveProviderProof: z.literal(false),
    engine: z.literal('ffmpeg'),
    filter: z.literal('lanczos'),
  }).strict(),
}).strict()

export type ImageUpscaleOutput = z.infer<typeof ImageUpscaleOutputSchema>

export const IMAGE_UPSCALE_MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const IMAGE_UPSCALE_MAX_DIMENSION = 8192
export const IMAGE_UPSCALE_MAX_PIXELS = 67_108_864
