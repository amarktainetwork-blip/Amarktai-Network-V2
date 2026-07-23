import {
  createQualityPolicy,
  type AppCapabilityGrantContext,
  type QualityCandidateEvidence,
  type QualityDimensionScore,
  type QualityPolicy,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'

const execFileAsync = promisify(execFile)

export interface MeasuredVideoEvidence {
  evidenceSource: 'ffprobe'
  validVideoStream: boolean
  durationSeconds: number | null
  width: number | null
  height: number | null
  aspectRatio: string | null
  fileSizeBytes: number
  codec: string | null
  container: string | null
  supportedCodecContainer: boolean
  nonEmpty: boolean
  technicalValid: boolean
  raw: Record<string, unknown>
}

export async function inspectCandidateVideo(artifactId: string): Promise<MeasuredVideoEvidence> {
  const record = await getArtifactRecord(artifactId)
  const file = await getArtifactFile(artifactId)
  if (!record || !file) throw new Error('Candidate artifact is unavailable for measured quality validation')
  const workspace = await mkdtemp(join(tmpdir(), 'amarktai-social-ad-quality-'))
  try {
    const path = join(workspace, record.mimeType === 'video/webm' ? 'candidate.webm' : 'candidate.mp4')
    await writeFile(path, file.buffer)
    const { stdout } = await execFileAsync(process.env.FFPROBE_PATH?.trim() || 'ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path,
    ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
    const raw = JSON.parse(String(stdout)) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> }
    const video = raw.streams?.find((stream) => stream.codec_type === 'video')
    const duration = Number(raw.format?.duration ?? video?.duration ?? 0)
    const width = Number(video?.width ?? 0)
    const height = Number(video?.height ?? 0)
    const codec = typeof video?.codec_name === 'string' ? video.codec_name : null
    const container = typeof raw.format?.format_name === 'string' ? raw.format.format_name : null
    const supportedCodecContainer = Boolean(codec && ['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(codec)
      && container && /(mp4|mov|webm|matroska)/.test(container))
    const nonEmpty = file.buffer.length > 1024
    const validVideoStream = Boolean(video && width > 0 && height > 0)
    const technicalValid = validVideoStream && duration > 0 && supportedCodecContainer && nonEmpty
    return {
      evidenceSource: 'ffprobe',
      validVideoStream,
      durationSeconds: duration > 0 ? duration : null,
      width: width > 0 ? width : null,
      height: height > 0 ? height : null,
      aspectRatio: width > 0 && height > 0 ? `${width}:${height}` : null,
      fileSizeBytes: file.buffer.length,
      codec,
      container,
      supportedCodecContainer,
      nonEmpty,
      technicalValid,
      raw: { streams: raw.streams ?? [], format: raw.format ?? {} },
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

export interface CandidateAnalysisOutput {
  summary: string
  scores: {
    promptAdherence: number
    brandConsistency: number
    visualQuality: number
    composition: number
    temporalContinuity: number
    safety: number
  }
  issues: string[]
  frameObservations: string[]
  recommended?: boolean
}

export function safeJson(value: unknown): Record<string, unknown> {
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

export function parseAnalysis(value: unknown): CandidateAnalysisOutput {
  const parsed = safeJson(value)
  const scores = parsed.scores
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    throw new Error('Social-ad quality analysis is missing scores')
  }
  const scoreRecord = scores as Record<string, unknown>
  const bounded = (key: string): number => {
    const score = scoreRecord[key]
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Social-ad quality score is invalid: ${key}`)
    }
    return score
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('Social-ad quality analysis summary is empty')
  }
  return {
    summary: parsed.summary,
    scores: {
      promptAdherence: bounded('promptAdherence'),
      brandConsistency: bounded('brandConsistency'),
      visualQuality: bounded('visualQuality'),
      composition: bounded('composition'),
      temporalContinuity: bounded('temporalContinuity'),
      safety: bounded('safety'),
    },
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === 'string')
      : [],
    frameObservations: Array.isArray(parsed.frameObservations)
      ? parsed.frameObservations.filter((item): item is string => typeof item === 'string')
      : [],
    recommended: parsed.recommended === true,
  }
}

export function qualityGrant(parentMetadata: Record<string, unknown>, appSlug: string): AppCapabilityGrantContext {
  const snapshot = parentMetadata.qualityGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Social-ad parent is missing immutable video_understanding grant authority')
  }
  const grant = snapshot as AppCapabilityGrantContext
  if (grant.appSlug !== appSlug || grant.capability !== 'video_understanding' || !grant.enabled || !grant.artifactRead) {
    throw new Error('Social-ad video_understanding grant authority is invalid')
  }
  return Object.freeze({ ...grant })
}

export function qualityPrompt(input: {
  parentPrompt: string
  candidatePrompt: string
  plan: Record<string, unknown>
}): string {
  const creative = input.plan.creativeContext
  const context = creative && typeof creative === 'object' && !Array.isArray(creative)
    ? creative as Record<string, unknown>
    : {}
  const brandName = typeof context.brandName === 'string' ? context.brandName : 'the approved brand'
  const objective = typeof context.objective === 'string' ? context.objective : input.parentPrompt
  const audience = typeof context.audience === 'string' ? context.audience : 'the intended audience'
  const callToAction = typeof context.callToAction === 'string' ? context.callToAction : ''
  const prohibitedClaims = Array.isArray(context.prohibitedClaims)
    ? context.prohibitedClaims.filter((item): item is string => typeof item === 'string')
    : []
  return [
    `Evaluate this social-ad candidate for ${brandName}.`,
    `Campaign objective: ${objective}. Audience: ${audience}.`,
    callToAction ? `Required call to action: ${callToAction}.` : '',
    `Candidate creative brief: ${input.candidatePrompt}`,
    prohibitedClaims.length ? `Flag any implication of prohibited claims: ${prohibitedClaims.join('; ')}.` : '',
    'Judge only visible evidence across the ordered timeline frames. Score prompt adherence, brand consistency, visual quality, composition, temporal continuity, and safety from 0 to 100.',
    'Inspect product identity and geometry preservation, visual continuity, motion stability, clipping, logo corruption, prohibited claims, caption-safe areas, frame-boundary breakout visibility, product visibility outside the social frame, and requested-channel suitability.',
    'List concrete defects such as warped products or logos, malformed geometry, clipping, unreadable generated text, abrupt motion, low fidelity, unsupported claims, or a product that never visibly crosses the frame.',
    'Do not claim pixel-level product similarity, segmentation, geometry verification, caption-safe compliance or logo integrity unless the ordered frame evidence genuinely supports it; otherwise list the item as requiring human review.',
    'Do not award quality merely because a file exists.',
  ].filter(Boolean).join(' ')
}

export function isQualityJob(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdQualityAnalysis === true
}

export function selectionPolicy(parentMetadata: Record<string, unknown>): QualityPolicy {
  const plan = parentMetadata.plan
  const planRecord = plan && typeof plan === 'object' && !Array.isArray(plan)
    ? plan as Record<string, unknown>
    : {}
  const original = planRecord.qualityPolicy
  const originalRecord = original && typeof original === 'object' && !Array.isArray(original)
    ? original as Record<string, unknown>
    : {}
  const profile = ['draft', 'standard', 'premium', 'publication'].includes(String(originalRecord.profile))
    ? originalRecord.profile as 'draft' | 'standard' | 'premium' | 'publication'
    : 'premium'
  return createQualityPolicy(profile, {
    ...originalRecord,
    policyId: `quality:social-ad:auto-selection:${profile}:v1`,
    requireHumanApproval: false,
  })
}

export function qualityEvidence(input: {
  generationJob: Awaited<ReturnType<typeof prisma.job.findUnique>>
  qualityJob: Awaited<ReturnType<typeof prisma.job.findUnique>>
  analysis: CandidateAnalysisOutput
  rightsVerified: boolean
  measured: MeasuredVideoEvidence
}): QualityCandidateEvidence {
  const { generationJob, qualityJob, analysis, rightsVerified, measured } = input
  if (!generationJob || !qualityJob || !generationJob.artifactId) {
    throw new Error('Social-ad candidate quality evidence is incomplete')
  }
  const dimensions: QualityDimensionScore[] = [
    { dimension: 'technical_validity', score: measured.technicalValid ? 100 : 0, weight: 2, required: true, blocking: true, evidence: [`artifact:${generationJob.artifactId}`, `ffprobe:${qualityJob.id}`], notes: measured.technicalValid ? [] : ['FFprobe technical validation failed'] },
    { dimension: 'prompt_adherence', score: analysis.scores.promptAdherence, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'brand_consistency', score: analysis.scores.brandConsistency, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'visual_quality', score: analysis.scores.visualQuality, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'composition', score: analysis.scores.composition, weight: 1, required: false, blocking: false, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'temporal_continuity', score: analysis.scores.temporalContinuity, weight: 2, required: false, blocking: false, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'safety', score: analysis.scores.safety, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'provenance', score: 100, weight: 1, required: true, blocking: true, evidence: [`generation-job:${generationJob.id}`, `quality-job:${qualityJob.id}`], notes: [] },
  ]
  return {
    candidateId: generationJob.id,
    capability: generationJob.capability as QualityCandidateEvidence['capability'],
    outputType: 'video',
    technicalValid: generationJob.status === 'completed' && Boolean(generationJob.artifactId) && measured.technicalValid,
    dimensions,
    criticalFailures: [],
    warnings: analysis.issues,
    // Job has no credit-cost field; UsageMeter/provider usage evidence is authoritative.
    costCredits: null,
    latencyMs: null,
    provenanceComplete: true,
    rightsVerified,
    safetyPassed: analysis.scores.safety >= 85,
    humanReview: 'pending',
  }
}

export function brandRightsVerified(parentMetadata: Record<string, unknown>): boolean {
  const brand = parentMetadata.brandProfileSnapshot
  if (!brand || typeof brand !== 'object' || Array.isArray(brand)) return false
  const record = brand as Record<string, unknown>
  if (record.status !== 'verified' || typeof record.rightsDeclaredAt !== 'string') return false
  const visual = record.visual
  const assets = visual && typeof visual === 'object' && !Array.isArray(visual)
    ? (visual as Record<string, unknown>).assets
    : []
  const plan = parentMetadata.plan && typeof parentMetadata.plan === 'object' && !Array.isArray(parentMetadata.plan)
    ? parentMetadata.plan as Record<string, unknown>
    : {}
  const contract = plan.creativeContract && typeof plan.creativeContract === 'object' && !Array.isArray(plan.creativeContract)
    ? plan.creativeContract as Record<string, unknown>
    : {}
  const requiredIds = new Set([
    ...(typeof contract.productSourceArtifactId === 'string' ? [contract.productSourceArtifactId] : []),
    ...(Array.isArray(contract.logoArtifactIds) ? contract.logoArtifactIds.filter((item): item is string => typeof item === 'string') : []),
  ])
  if (!Array.isArray(assets) || requiredIds.size === 0) return false
  const selected = assets.filter((asset) => asset && typeof asset === 'object' && !Array.isArray(asset)
    && requiredIds.has(String((asset as Record<string, unknown>).artifactId ?? '')))
  return selected.length === requiredIds.size && selected.every((asset) => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return false
    const value = asset as Record<string, unknown>
    return value.approved === true && value.rightsVerified === true
  })
}
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getArtifactFile, getArtifactRecord } from '@amarktai/artifacts'
