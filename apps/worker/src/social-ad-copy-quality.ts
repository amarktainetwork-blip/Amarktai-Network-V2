import {
  type AppCapabilityGrantContext,
  type QualityCandidateEvidence,
  type QualityDimensionScore,
} from '@amarktai/core'

export const COPY_CANDIDATE_COUNT = 3

export const SOCIAL_COPY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'primaryText', 'shortCaption', 'longCaption', 'callToAction', 'hashtags', 'claimsUsed', 'channelVariants'],
  properties: {
    headline: { type: 'string', minLength: 5, maxLength: 120 },
    primaryText: { type: 'string', minLength: 20, maxLength: 2200 },
    shortCaption: { type: 'string', minLength: 5, maxLength: 280 },
    longCaption: { type: 'string', minLength: 20, maxLength: 2200 },
    callToAction: { type: 'string', minLength: 1, maxLength: 200 },
    hashtags: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 2, maxLength: 80 } },
    claimsUsed: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 1000 } },
    channelVariants: { type: 'object', additionalProperties: { type: 'string', minLength: 5, maxLength: 2200 } },
  },
}

export interface SocialCopyPackage {
  headline: string
  primaryText: string
  shortCaption: string
  longCaption: string
  callToAction: string
  hashtags: string[]
  claimsUsed: string[]
  channelVariants: Record<string, string>
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

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

export function isCopyCandidate(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdCopyCandidate === true
}

export function parseCopyPackage(output: unknown): SocialCopyPackage {
  if (typeof output !== 'string' || !output.trim()) throw new Error('Completed social-copy job has no output')
  const parsed = safeJson(output)
  const text = (key: string, min: number, max: number): string => {
    const value = parsed[key]
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new Error(`Social copy field is invalid: ${key}`)
    }
    return value.trim()
  }
  const channelVariants = Object.fromEntries(
    Object.entries(objectValue(parsed.channelVariants))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length >= 5)
      .map(([key, value]) => [key, value.trim()]),
  )
  return {
    headline: text('headline', 5, 120),
    primaryText: text('primaryText', 20, 2200),
    shortCaption: text('shortCaption', 5, 280),
    longCaption: text('longCaption', 20, 2200),
    callToAction: text('callToAction', 1, 200),
    hashtags: stringArray(parsed.hashtags).slice(0, 30),
    claimsUsed: stringArray(parsed.claimsUsed).slice(0, 50),
    channelVariants,
  }
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}

function containsPhrase(text: string, phrase: string): boolean {
  return normalized(text).includes(normalized(phrase))
}

export function copyContext(parentMetadata: Record<string, unknown>) {
  const plan = objectValue(parentMetadata.plan)
  const creative = objectValue(plan.creativeContext)
  const brand = objectValue(parentMetadata.brandProfileSnapshot)
  const voice = objectValue(brand.voice)
  return {
    plan,
    brand,
    brandName: typeof creative.brandName === 'string' ? creative.brandName : String(brand.displayName ?? 'Approved brand'),
    objective: typeof creative.objective === 'string' ? creative.objective : '',
    audience: typeof creative.audience === 'string' ? creative.audience : '',
    offering: typeof creative.offering === 'string' ? creative.offering : '',
    callToAction: typeof creative.callToAction === 'string' ? creative.callToAction : '',
    approvedClaims: stringArray(creative.approvedClaims),
    prohibitedClaims: stringArray(creative.prohibitedClaims),
    disclaimers: stringArray(creative.requiredDisclaimers),
    channels: stringArray(creative.channels),
    tones: stringArray(voice.tones),
    styleRules: stringArray(voice.styleRules),
    approvedPhrases: stringArray(voice.approvedPhrases),
    forbiddenPhrases: stringArray(voice.forbiddenPhrases),
  }
}

export function promptForCandidate(parentMetadata: Record<string, unknown>, candidateIndex: number): string {
  const context = copyContext(parentMetadata)
  const variation = [
    'Lead with a sharp audience problem and a clear transformation.',
    'Lead with the strongest approved benefit and a credible proof-oriented tone.',
    'Lead with a concise pattern interrupt, then explain the offer plainly.',
  ][candidateIndex - 1] ?? 'Create a distinct high-quality variation.'
  return [
    `Create social copy candidate ${candidateIndex} for ${context.brandName}.`,
    `Objective: ${context.objective}. Audience: ${context.audience}. Offering: ${context.offering || 'use the approved campaign context'}.`,
    `Required call to action: ${context.callToAction}.`,
    `Channels requiring variants: ${context.channels.join(', ')}.`,
    `Tone: ${context.tones.join(', ')}. Style rules: ${context.styleRules.join('; ')}.`,
    `Approved claims (the only factual marketing claims allowed): ${context.approvedClaims.join('; ') || 'none supplied; make no factual performance claims'}.`,
    `Required disclaimers: ${context.disclaimers.join('; ') || 'none'}.`,
    `Forbidden phrases and prohibited claims: ${[...context.forbiddenPhrases, ...context.prohibitedClaims].join('; ') || 'none supplied'}.`,
    `Approved phrases you may use naturally: ${context.approvedPhrases.join('; ') || 'none supplied'}.`,
    variation,
    'Return JSON only. claimsUsed must list every factual marketing claim exactly as it appears in the approved-claims list. Do not create statistics, guarantees, testimonials, prices, deadlines or outcomes that are not supplied. Include every required disclaimer in primaryText or longCaption and in relevant channel variants.',
  ].join(' ')
}

export function copyGrant(parentMetadata: Record<string, unknown>, appSlug: string): AppCapabilityGrantContext {
  const snapshot = parentMetadata.copyGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Social-ad parent is missing immutable structured_output grant authority')
  }
  const grant = snapshot as AppCapabilityGrantContext
  if (grant.appSlug !== appSlug || grant.capability !== 'structured_output' || !grant.enabled) {
    throw new Error('Social-ad structured_output grant authority is invalid')
  }
  return Object.freeze({ ...grant })
}

function combinedCopy(pkg: SocialCopyPackage): string {
  return [pkg.headline, pkg.primaryText, pkg.shortCaption, pkg.longCaption, pkg.callToAction, ...pkg.hashtags, ...Object.values(pkg.channelVariants)].join('\n')
}

export function scoreCopy(jobId: string, pkg: SocialCopyPackage, parentMetadata: Record<string, unknown>): QualityCandidateEvidence {
  const context = copyContext(parentMetadata)
  const fullText = combinedCopy(pkg)
  const failures: string[] = []
  const warnings: string[] = []
  const approvedNormalized = new Set(context.approvedClaims.map(normalized))
  const unapprovedClaims = pkg.claimsUsed.filter((claim) => !approvedNormalized.has(normalized(claim)))
  if (unapprovedClaims.length) failures.push(`unapproved_claims:${unapprovedClaims.join('|')}`)
  const prohibitedMatches = [...context.prohibitedClaims, ...context.forbiddenPhrases].filter((phrase) => containsPhrase(fullText, phrase))
  if (prohibitedMatches.length) failures.push(`prohibited_copy:${prohibitedMatches.join('|')}`)
  const missingDisclaimers = context.disclaimers.filter((disclaimer) => !containsPhrase(fullText, disclaimer))
  if (missingDisclaimers.length) failures.push(`missing_disclaimers:${missingDisclaimers.join('|')}`)
  const missingChannels = context.channels.filter((channel) => !pkg.channelVariants[channel]?.trim())
  if (missingChannels.length) failures.push(`missing_channel_variants:${missingChannels.join('|')}`)
  const ctaExact = normalized(pkg.callToAction) === normalized(context.callToAction)
  if (!ctaExact) failures.push('call_to_action_changed')
  if (pkg.hashtags.length > 15) warnings.push('excessive_hashtags')
  if (/\b[A-Z]{8,}\b/.test(fullText)) warnings.push('excessive_all_caps')

  const channelCoverage = context.channels.length === 0 ? 100 : Math.round(((context.channels.length - missingChannels.length) / context.channels.length) * 100)
  const claimScore = failures.some((failure) => failure.startsWith('unapproved_claims') || failure.startsWith('prohibited_copy')) ? 0 : 100
  const disclaimerScore = missingDisclaimers.length ? 0 : 100
  const dimensions: QualityDimensionScore[] = [
    { dimension: 'technical_validity', score: 100, weight: 2, required: true, blocking: true, evidence: [`copy-job:${jobId}`], notes: [] },
    { dimension: 'prompt_adherence', score: Math.round((channelCoverage + (ctaExact ? 100 : 0)) / 2), weight: 2, required: true, blocking: true, evidence: [`copy-job:${jobId}`], notes: [] },
    { dimension: 'brand_consistency', score: prohibitedMatches.length ? 0 : 95, weight: 2, required: true, blocking: true, evidence: [`copy-job:${jobId}`], notes: [] },
    { dimension: 'factual_accuracy', score: Math.min(claimScore, disclaimerScore), weight: 3, required: true, blocking: true, evidence: context.approvedClaims.map((claim) => `approved-claim:${claim}`), notes: [] },
    { dimension: 'accessibility', score: Math.max(0, 100 - warnings.length * 15), weight: 1, required: true, blocking: false, evidence: [`copy-job:${jobId}`], notes: warnings },
    { dimension: 'safety', score: prohibitedMatches.length ? 0 : 100, weight: 2, required: true, blocking: true, evidence: [`copy-job:${jobId}`], notes: [] },
    { dimension: 'provenance', score: 100, weight: 1, required: true, blocking: true, evidence: [`copy-job:${jobId}`, `brand-profile:${String(context.brand.brandProfileId ?? '')}`], notes: [] },
  ]
  return {
    candidateId: jobId,
    capability: 'structured_output',
    outputType: 'json',
    technicalValid: failures.length === 0,
    dimensions,
    criticalFailures: failures,
    warnings,
    costCredits: null,
    latencyMs: null,
    provenanceComplete: true,
    rightsVerified: true,
    safetyPassed: prohibitedMatches.length === 0,
    humanReview: 'not_required',
  }
}
