import { createHash } from 'node:crypto'
import { z } from 'zod'

export const SPECIALIST_VISION_CAPABILITIES = [
  'depth_estimation',
  'keypoint_detection',
  'mask_generation',
  'zero_shot_object_detection',
  'visual_document_retrieval',
  'video_classification',
] as const

export type SpecialistVisionCapability = (typeof SPECIALIST_VISION_CAPABILITIES)[number]

const ArtifactId = z.string().uuid()
const IdempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/)
const MaxCredits = z.number().positive().max(1_000_000)
const Dimensions = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict()
const NormalizedBox = z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).strict()
const Provenance = z.object({
  sourceArtifactId: ArtifactId,
  sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceSource: z.enum(['live_provider', 'pinned_oss_worker', 'local_fixture']),
  liveProviderProof: z.boolean(),
}).strict()

export const DepthEstimationRequestSchema = z.object({
  sourceImageArtifactId: ArtifactId,
  outputMode: z.enum(['relative', 'metric_if_calibrated']).default('relative'),
  normalize: z.boolean().default(true),
  visualization: z.boolean().default(true),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict()

export const KeypointDetectionRequestSchema = z.object({
  sourceImageArtifactId: ArtifactId,
  domain: z.string().trim().min(1).max(120),
  confidenceThreshold: z.number().min(0).max(1).default(0.5),
  overlay: z.boolean().default(true),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict()

export const MaskGenerationRequestSchema = z.object({
  sourceImageArtifactId: ArtifactId,
  guidance: z.discriminatedUnion('type', [
    z.object({ type: z.literal('prompt'), prompt: z.string().trim().min(1).max(2_000) }).strict(),
    z.object({ type: z.literal('class'), className: z.string().trim().min(1).max(200) }).strict(),
    z.object({ type: z.literal('points'), points: z.array(z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), label: z.enum(['foreground', 'background']) }).strict()).min(1).max(100) }).strict(),
    z.object({ type: z.literal('box'), box: NormalizedBox }).strict(),
  ]),
  outputFormat: z.enum(['binary_png', 'grayscale_png', 'transparent_png']).default('binary_png'),
  overlay: z.boolean().default(true),
  maxMasks: z.number().int().min(1).max(50).default(10),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict()

export const ZeroShotObjectDetectionRequestSchema = z.object({
  sourceImageArtifactId: ArtifactId,
  candidateLabels: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  confidenceThreshold: z.number().min(0).max(1).default(0.25),
  maxDetections: z.number().int().min(1).max(500).default(100),
  overlay: z.boolean().default(true),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict().transform((value) => ({ ...value, candidateLabels: [...new Set(value.candidateLabels)] }))

export const VisualDocumentRetrievalRequestSchema = z.object({
  sourceDocumentArtifactId: ArtifactId.optional(),
  ingestedDocumentId: z.string().trim().min(1).max(200).optional(),
  query: z.string().trim().min(1).max(20_000),
  maxResults: z.number().int().min(1).max(50).default(8),
  pages: z.array(z.number().int().positive()).max(500).optional(),
  sections: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  citationsRequired: z.literal(true).default(true),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict().refine((value) => Boolean(value.sourceDocumentArtifactId || value.ingestedDocumentId), {
  message: 'A sourceDocumentArtifactId or ingestedDocumentId is required.',
})

export const VideoClassificationRequestSchema = z.object({
  sourceVideoArtifactId: ArtifactId,
  candidateLabels: z.array(z.string().trim().min(1).max(200)).min(1).max(200).optional(),
  governedTaxonomy: z.string().trim().min(1).max(200).optional(),
  samplingProfile: z.enum(['sparse', 'balanced', 'dense']).default('balanced'),
  temporalSegmentation: z.boolean().default(false),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict().refine((value) => Boolean(value.candidateLabels?.length || value.governedTaxonomy), {
  message: 'candidateLabels or governedTaxonomy is required.',
})

export const SPECIALIST_VISION_REQUEST_SCHEMAS = {
  depth_estimation: DepthEstimationRequestSchema,
  keypoint_detection: KeypointDetectionRequestSchema,
  mask_generation: MaskGenerationRequestSchema,
  zero_shot_object_detection: ZeroShotObjectDetectionRequestSchema,
  visual_document_retrieval: VisualDocumentRetrievalRequestSchema,
  video_classification: VideoClassificationRequestSchema,
} as const

const ArtifactOutput = z.object({ artifactId: ArtifactId, mimeType: z.string().min(1), fileSizeBytes: z.number().int().positive() }).strict()

export const DepthEstimationResultSchema = z.object({
  depthType: z.enum(['relative', 'metric']),
  unit: z.enum(['normalized', 'metres']).nullable(),
  dimensions: Dimensions,
  range: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  depthMap: ArtifactOutput,
  visualization: ArtifactOutput.nullable(),
  provenance: Provenance,
}).strict().superRefine((value, context) => {
  if (value.range.max <= value.range.min) context.addIssue({ code: 'custom', path: ['range'], message: 'Depth range must be non-empty.' })
  if (value.depthType === 'metric' && value.unit !== 'metres') context.addIssue({ code: 'custom', path: ['unit'], message: 'Metric depth must identify metres.' })
  if (value.depthType === 'relative' && value.unit !== 'normalized') context.addIssue({ code: 'custom', path: ['unit'], message: 'Relative depth must identify normalized units.' })
})

const Keypoint = z.object({ name: z.string().min(1), x: z.number().nonnegative(), y: z.number().nonnegative(), confidence: z.number().min(0).max(1).nullable() }).strict()
export const KeypointDetectionResultSchema = z.object({
  dimensions: Dimensions,
  entities: z.array(z.object({ entityId: z.string().min(1), entityType: z.string().min(1), confidence: z.number().min(0).max(1).nullable(), keypoints: z.array(Keypoint) }).strict()),
  structuredArtifact: ArtifactOutput,
  overlay: ArtifactOutput.nullable(),
  provenance: Provenance,
}).strict()

export const MaskGenerationResultSchema = z.object({
  dimensions: Dimensions,
  masks: z.array(z.object({ maskId: z.string().min(1), semanticLabel: z.string().nullable(), confidence: z.number().min(0).max(1).nullable(), artifact: ArtifactOutput }).strict()).min(1),
  structuredArtifact: ArtifactOutput,
  overlay: ArtifactOutput.nullable(),
  provenance: Provenance,
}).strict()

export const ZeroShotObjectDetectionResultSchema = z.object({
  dimensions: Dimensions,
  detections: z.array(z.object({ detectionId: z.string().min(1), label: z.string().min(1), confidence: z.number().min(0).max(1), box: NormalizedBox }).strict()),
  structuredArtifact: ArtifactOutput,
  overlay: ArtifactOutput.nullable(),
  provenance: Provenance,
}).strict()

export const VisualDocumentRetrievalResultSchema = z.object({
  documentId: z.string().min(1),
  sourceArtifactId: ArtifactId,
  results: z.array(z.object({
    rank: z.number().int().positive(),
    page: z.number().int().positive(),
    section: z.string().nullable(),
    region: NormalizedBox.nullable(),
    extractedText: z.string().min(1),
    score: z.number().finite(),
    citation: z.object({ citationId: z.string().min(1), sourceArtifactId: ArtifactId, page: z.number().int().positive(), excerptHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  }).strict()).min(1),
  retrievalEvidenceArtifact: ArtifactOutput,
  provenance: Provenance,
}).strict()

export const VideoClassificationResultSchema = z.object({
  sourceDurationSeconds: z.number().positive(),
  labels: z.array(z.object({ label: z.string().min(1), confidence: z.number().min(0).max(1) }).strict()).min(1),
  segments: z.array(z.object({ startSeconds: z.number().nonnegative(), endSeconds: z.number().positive(), labels: z.array(z.object({ label: z.string().min(1), confidence: z.number().min(0).max(1) }).strict()).min(1) }).strict()),
  samplingEvidence: z.object({ profile: z.enum(['sparse', 'balanced', 'dense']), sampledTimestampsSeconds: z.array(z.number().nonnegative()).min(1), frameCount: z.number().int().positive() }).strict(),
  structuredArtifact: ArtifactOutput,
  provenance: Provenance,
}).strict()

export const SPECIALIST_VISION_RESULT_SCHEMAS = {
  depth_estimation: DepthEstimationResultSchema,
  keypoint_detection: KeypointDetectionResultSchema,
  mask_generation: MaskGenerationResultSchema,
  zero_shot_object_detection: ZeroShotObjectDetectionResultSchema,
  visual_document_retrieval: VisualDocumentRetrievalResultSchema,
  video_classification: VideoClassificationResultSchema,
} as const

export interface InspectedSourceArtifact {
  kind: 'image' | 'video' | 'document'
  detectedMimeType: string
  checksum: string
  byteLength: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  frameRate: number | null
  pageCount: number | null
}

export function checksumArtifactBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || !Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]!
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!
    if (length < 2) return null
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) + bytes[offset + 8]! }
    }
    offset += 2 + length
  }
  return null
}

export function inspectImageArtifact(bytes: Uint8Array, maxBytes = 25 * 1024 * 1024): InspectedSourceArtifact {
  if (!bytes.length) throw new Error('Source image is empty.')
  if (bytes.length > maxBytes) throw new Error('Source image exceeds the maximum file size.')
  const png = pngDimensions(bytes)
  const jpeg = png ? null : jpegDimensions(bytes)
  const dimensions = png ?? jpeg
  if (!dimensions?.width || !dimensions.height) throw new Error('Source image stream is not a supported PNG or JPEG image.')
  return { kind: 'image', detectedMimeType: png ? 'image/png' : 'image/jpeg', checksum: checksumArtifactBytes(bytes), byteLength: bytes.length, width: dimensions.width, height: dimensions.height, durationSeconds: null, frameRate: null, pageCount: null }
}

export function inspectDocumentArtifact(bytes: Uint8Array, maxBytes = 50 * 1024 * 1024): InspectedSourceArtifact {
  if (!bytes.length) throw new Error('Source document is empty.')
  if (bytes.length > maxBytes) throw new Error('Source document exceeds the maximum file size.')
  const prefix = Buffer.from(bytes.subarray(0, 16)).toString('latin1')
  let detectedMimeType: string
  let pageCount: number | null = null
  if (prefix.startsWith('%PDF-')) {
    detectedMimeType = 'application/pdf'
    const text = Buffer.from(bytes).toString('latin1')
    pageCount = Math.max(1, [...text.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length)
  } else if (pngDimensions(bytes) || jpegDimensions(bytes)) {
    return { ...inspectImageArtifact(bytes, maxBytes), kind: 'document', pageCount: 1 }
  } else {
    const text = Buffer.from(bytes).toString('utf8')
    if (text.includes('\u0000')) throw new Error('Source document type is unsupported.')
    detectedMimeType = 'text/plain'
    pageCount = 1
  }
  return { kind: 'document', detectedMimeType, checksum: checksumArtifactBytes(bytes), byteLength: bytes.length, width: null, height: null, durationSeconds: null, frameRate: null, pageCount }
}

export function validateSpecialistVisionResult(capability: SpecialistVisionCapability, value: unknown, request: Record<string, unknown>): unknown {
  const parsed = SPECIALIST_VISION_RESULT_SCHEMAS[capability].parse(value)
  const result = parsed as unknown as Record<string, unknown>
  if ('dimensions' in parsed) {
    const dimensions = parsed.dimensions as { width: number; height: number }
    const points: Array<{ x: number; y: number }> = []
    if (capability === 'keypoint_detection') for (const entity of result.entities as Array<{ keypoints: Array<{ x: number; y: number }> }>) points.push(...entity.keypoints)
    for (const point of points) if (point.x > dimensions.width || point.y > dimensions.height) throw new Error('Keypoint coordinates exceed source bounds.')
    if (capability === 'zero_shot_object_detection') {
      const allowed = new Set(Array.isArray(request.candidateLabels) ? request.candidateLabels : [])
      for (const detection of result.detections as Array<{ label: string; box: { x: number; y: number; width: number; height: number } }>) {
        if (!allowed.has(detection.label)) throw new Error('Detection label did not originate from candidate labels.')
        if (detection.box.x + detection.box.width > dimensions.width || detection.box.y + detection.box.height > dimensions.height) throw new Error('Detection box exceeds source bounds.')
      }
    }
    if (capability === 'mask_generation' && (result.masks as unknown[]).length > Number(request.maxMasks ?? 10)) throw new Error('Mask count exceeds the requested maximum.')
  }
  if (capability === 'video_classification') {
    const duration = result.sourceDurationSeconds as number
    for (const segment of result.segments as Array<{ startSeconds: number; endSeconds: number }>) if (segment.endSeconds <= segment.startSeconds || segment.endSeconds > duration) throw new Error('Video classification segment is outside source duration.')
  }
  return parsed
}
