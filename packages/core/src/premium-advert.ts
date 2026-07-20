import { z } from 'zod'
import {
  assertPremiumSpendConfirmed,
  createPremiumSpendDecision,
  isPreferredPremiumGenxModel,
  type PremiumSpendDecision,
} from './premium-media-policy.js'

export const PREMIUM_ADVERT_ASPECT_RATIOS = ['16:9', '9:16'] as const
export const PREMIUM_ADVERT_CANDIDATE_VARIATIONS = [
  'precision cinematic realism with controlled camera motion',
  'bold premium commercial energy with a striking visual transition',
  'high-end technology campaign treatment with elegant depth and lighting',
  'emotion-led product storytelling with memorable composition',
] as const

export const PremiumAdvertRequestSchema = z.object({
  brandName: z.string().min(2).max(120).default('AmarktAI Network'),
  campaignTitle: z.string().min(2).max(160).default('Build Anything. Operate Everything.'),
  prompt: z.string().min(20).max(5000).default('Show how AmarktAI turns one idea into an entire intelligent business through one orchestrated capability platform.'),
  objective: z.string().min(8).max(500).default('Make founders and operators immediately understand the scale, intelligence and creative power of AmarktAI Network.'),
  audience: z.string().min(8).max(500).default('Founders, agencies, creators and operators who need many AI capabilities without managing many disconnected tools.'),
  callToAction: z.string().min(2).max(200).default('Build anything. Operate everything.'),
  targetDurationSeconds: z.number().int().min(24).max(60).default(30),
  candidateCount: z.number().int().min(2).max(4).default(3),
  aspectRatio: z.enum(PREMIUM_ADVERT_ASPECT_RATIOS).default('16:9'),
  style: z.string().min(4).max(200).default('cinematic premium technology commercial'),
  tone: z.string().min(4).max(200).default('bold, intelligent, ambitious and emotionally uplifting'),
  voiceStyle: z.string().min(4).max(200).default('confident premium commercial narration with controlled energy'),
  musicBrief: z.string().min(8).max(600).default('Original cinematic electronic anthem with a restrained opening, escalating pulse, powerful reveal and memorable final resolve. Instrumental only.'),
  maxCredits: z.number().positive().max(1_000_000),
  reserveCredits: z.number().min(0).max(1_000_000).default(0),
  confirmation: z.string().max(80).default(''),
})

export type PremiumAdvertRequest = z.infer<typeof PremiumAdvertRequestSchema>

export interface PremiumAdvertScene {
  sceneNumber: number
  durationSeconds: number
  title: string
  objective: string
  visualPrompt: string
  negativePrompt: string
  cameraDirection: string
  voiceoverText: string
  subtitleText: string
  overlayText: string | null
}

export interface PremiumAdvertRoute {
  provider: 'genx'
  model: string
  executorId: string
  estimatedCreditsPerUnit: number | null
}

export interface PremiumAdvertCandidatePlan {
  candidateId: string
  sceneNumber: number
  candidateIndex: number
  durationSeconds: number
  prompt: string
  negativePrompt: string
  route: PremiumAdvertRoute
}

export interface PremiumAdvertPlan {
  version: 'premium-advert-v1'
  brandName: string
  campaignTitle: string
  targetDurationSeconds: number
  aspectRatio: (typeof PREMIUM_ADVERT_ASPECT_RATIOS)[number]
  scenes: PremiumAdvertScene[]
  candidates: PremiumAdvertCandidatePlan[]
  narration: { text: string; route: PremiumAdvertRoute; voiceStyle: string }
  music: { prompt: string; route: PremiumAdvertRoute; instrumentalOnly: true }
  spend: PremiumSpendDecision
  confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND'
}

export interface PremiumCandidateEvidence {
  candidateId: string
  sceneNumber: number
  model: string
  width: number | null
  height: number | null
  durationSeconds: number | null
  fileSizeBytes: number
  outputValidated: boolean
}

export interface PremiumCandidateScore {
  candidateId: string
  sceneNumber: number
  score: number
  breakdown: {
    resolution: number
    durationAdherence: number
    dataDensity: number
    premiumModel: number
    outputValidation: number
  }
}

export const AMARKTAI_PREMIUM_ADVERT_SCENES: readonly Omit<PremiumAdvertScene, 'durationSeconds'>[] = [
  {
    sceneNumber: 1,
    title: 'The Fragmented Problem',
    objective: 'Open with the cost and confusion of disconnected AI tools.',
    visualPrompt: 'A premium cinematic command desk suspended in darkness, overwhelmed by dozens of disconnected glowing AI windows, timelines, audio waves, image grids and automation alerts. The fragments stutter and pull in different directions before the motion freezes. Photoreal technology commercial, text-free generated frame, coherent interfaces without readable text.',
    negativePrompt: 'No readable generated text, no brand logos, no cyberpunk clutter, no distorted hands, no comedy, no cheap stock-footage look.',
    cameraDirection: 'Fast controlled push through fragmented panels, shallow depth of field, decisive freeze at peak complexity.',
    voiceoverText: 'AI became more powerful. But operating it became more fragmented.',
    subtitleText: 'AI became more powerful. But operating it became more fragmented.',
    overlayText: 'Too many tools. Too little orchestration.',
  },
  {
    sceneNumber: 2,
    title: 'The AmarktAI Core',
    objective: 'Reveal AmarktAI as the organising intelligence.',
    visualPrompt: 'The disconnected fragments collapse into a single elegant luminous orchestration core, dark graphite and electric cyan, with intelligent pathways locking into one coherent network. Premium product reveal, restrained particle energy, impeccable symmetry, realistic materials, text-free frame with generous negative space.',
    negativePrompt: 'No generated lettering, no generic robot brain, no excessive neon, no lens dirt, no warped geometry.',
    cameraDirection: 'Slow orbital reveal transitioning into a centred hero composition as pathways synchronize.',
    voiceoverText: 'AmarktAI Network turns every capability into one intelligent operating platform.',
    subtitleText: 'One intelligent operating platform.',
    overlayText: 'AmarktAI Network',
  },
  {
    sceneNumber: 3,
    title: 'Capability Explosion',
    objective: 'Demonstrate the breadth of callable creative and intelligence capabilities.',
    visualPrompt: 'From the central orchestration core, high-end creative outputs unfold in one continuous cinematic transformation: photoreal brand imagery, premium product video, expressive voice waveform, full music production, research documents, code and data visualisations. Every output remains connected to the same elegant core. Photoreal commercial finish, coherent art direction, text-free frames.',
    negativePrompt: 'No readable generated text, no random collage, no duplicated objects, no inconsistent lighting, no brand infringement.',
    cameraDirection: 'Fluid macro-to-wide transformation with match cuts between image, video, voice, music and intelligence outputs.',
    voiceoverText: 'Image. Video. Voice. Music. Research. Code. Automation. All called as capabilities.',
    subtitleText: 'Every capability. One platform.',
    overlayText: 'Create · Understand · Automate',
  },
  {
    sceneNumber: 4,
    title: 'Thin Apps, One Runtime',
    objective: 'Show multiple applications drawing from the same capability platform.',
    visualPrompt: 'A sophisticated founder workspace where distinct applications for marketing, customer service, operations, education and specialist workflows appear as clean focused surfaces, all connected beneath the glass to one shared intelligent runtime. Premium enterprise technology advert, realistic hands and screens without readable text, consistent cyan-violet visual language.',
    negativePrompt: 'No readable UI text, no fake company logos, no distorted hands, no floating screen chaos, no dated office stock footage.',
    cameraDirection: 'Elegant lateral move across focused app surfaces, then tilt beneath them to reveal the shared runtime connection.',
    voiceoverText: 'Your apps stay focused. The Network decides how the work gets done.',
    subtitleText: 'Focused apps. Shared intelligence.',
    overlayText: 'Apps request outcomes. Runtime decides execution.',
  },
  {
    sceneNumber: 5,
    title: 'Autonomous Job Graph',
    objective: 'Visualise routing, fallback, governance and durable execution.',
    visualPrompt: 'A cinematic intelligent job graph activates across a dark premium operations environment: research flows into strategy, copy, image, video, voice and publishing; quality checks branch, weak outputs are replaced, approved artifacts lock into place. Clear visual causality, realistic dimensional interfaces without readable text, confident controlled movement.',
    negativePrompt: 'No readable generated text, no chaotic spaghetti diagram, no red error overload, no sci-fi fantasy controls.',
    cameraDirection: 'Follow one pulse through the job graph as it branches, validates, replaces a weak candidate and converges on approved artifacts.',
    voiceoverText: 'It routes, verifies, retries, controls cost and preserves every result.',
    subtitleText: 'Route. Verify. Improve. Preserve.',
    overlayText: 'Quality · Cost · Governance · Evidence',
  },
  {
    sceneNumber: 6,
    title: 'Brand Close',
    objective: 'End with an iconic, memorable brand and call to action.',
    visualPrompt: 'The entire capability network resolves into a calm iconic AmarktAI hero mark made from luminous connected pathways above a deep graphite horizon. A confident founder silhouette faces the completed intelligent platform as sunrise light breaks through. Premium global technology campaign close, minimal, emotionally powerful, text-free generated frame with clean central negative space.',
    negativePrompt: 'No generated words, no copied logos, no fireworks, no cheesy victory pose, no visual clutter, no malformed silhouette.',
    cameraDirection: 'Slow pullback to the complete network, subtle sunrise lift, stable final hero frame held for the call to action.',
    voiceoverText: 'AmarktAI Network. Build anything. Operate everything.',
    subtitleText: 'Build anything. Operate everything.',
    overlayText: 'Build anything. Operate everything.',
  },
] as const

function distributeDurations(totalSeconds: number, count: number): number[] {
  const base = Math.floor(totalSeconds / count)
  const remainder = totalSeconds - base * count
  return Array.from({ length: count }, (_, index) => base + (index >= count - remainder ? 1 : 0))
}

export function validatePremiumAdvertRequest(input: unknown): PremiumAdvertRequest {
  return PremiumAdvertRequestSchema.parse(input)
}

export function createAmarktaiAdvertScenes(request: PremiumAdvertRequest): PremiumAdvertScene[] {
  const durations = distributeDurations(request.targetDurationSeconds, AMARKTAI_PREMIUM_ADVERT_SCENES.length)
  return AMARKTAI_PREMIUM_ADVERT_SCENES.map((scene, index) => ({ ...scene, durationSeconds: durations[index]! }))
}

export function buildPremiumAdvertPlan(input: {
  request: PremiumAdvertRequest
  videoRoute: PremiumAdvertRoute
  narrationRoute: PremiumAdvertRoute
  musicRoute: PremiumAdvertRoute
  availableCredits: number
}): PremiumAdvertPlan {
  if (!isPreferredPremiumGenxModel(input.videoRoute.model, 'hero_video')) {
    throw new Error(`Premium advert video route is not an approved flagship GenX family: ${input.videoRoute.model}`)
  }
  if (!isPreferredPremiumGenxModel(input.musicRoute.model, 'full_song')) {
    throw new Error(`Premium advert music route is not Lyria 3 Pro: ${input.musicRoute.model}`)
  }
  for (const route of [input.videoRoute, input.narrationRoute, input.musicRoute]) {
    if (route.provider !== 'genx') throw new Error('Premium advert execution is restricted to GenX')
  }

  const scenes = createAmarktaiAdvertScenes(input.request)
  const candidates = scenes.flatMap((scene) => Array.from({ length: input.request.candidateCount }, (_, index) => ({
    candidateId: `scene-${scene.sceneNumber}-candidate-${index + 1}`,
    sceneNumber: scene.sceneNumber,
    candidateIndex: index + 1,
    durationSeconds: scene.durationSeconds,
    prompt: [
      scene.visualPrompt,
      `Creative variation ${index + 1}: ${PREMIUM_ADVERT_CANDIDATE_VARIATIONS[index]}.`,
      `Campaign context: ${input.request.prompt}`,
      `Brand objective: ${input.request.objective}`,
      `Audience: ${input.request.audience}`,
      `Style: ${input.request.style}. Tone: ${input.request.tone}. Aspect ratio: ${input.request.aspectRatio}.`,
      'Maintain the same AmarktAI graphite, cyan and violet art direction across every scene. Do not render readable words; overlays are added during final assembly.',
    ].join(' '),
    negativePrompt: scene.negativePrompt,
    route: input.videoRoute,
  })))
  const narrationText = scenes.map((scene) => scene.voiceoverText).join(' ')

  const spend = createPremiumSpendDecision({
    availableCredits: input.availableCredits,
    maxCredits: input.request.maxCredits,
    reserveCredits: input.request.reserveCredits,
    lines: [
      { role: 'hero_video', modelId: input.videoRoute.model, quantity: candidates.length, estimatedCreditsPerUnit: input.videoRoute.estimatedCreditsPerUnit },
      { role: 'voiceover', modelId: input.narrationRoute.model, quantity: 1, estimatedCreditsPerUnit: input.narrationRoute.estimatedCreditsPerUnit },
      { role: 'full_song', modelId: input.musicRoute.model, quantity: 1, estimatedCreditsPerUnit: input.musicRoute.estimatedCreditsPerUnit },
    ],
  })

  return {
    version: 'premium-advert-v1',
    brandName: input.request.brandName,
    campaignTitle: input.request.campaignTitle,
    targetDurationSeconds: input.request.targetDurationSeconds,
    aspectRatio: input.request.aspectRatio,
    scenes,
    candidates,
    narration: { text: narrationText, route: input.narrationRoute, voiceStyle: input.request.voiceStyle },
    music: { prompt: input.request.musicBrief, route: input.musicRoute, instrumentalOnly: true },
    spend,
    confirmationRequired: 'CONFIRM_PREMIUM_GENX_SPEND',
  }
}

export function assertPremiumAdvertSpendConfirmed(plan: PremiumAdvertPlan, confirmation: string): void {
  assertPremiumSpendConfirmed(plan.spend, confirmation)
}

export function scorePremiumVideoCandidate(evidence: PremiumCandidateEvidence, targetDurationSeconds: number): PremiumCandidateScore {
  const pixels = Math.max(0, (evidence.width ?? 0) * (evidence.height ?? 0))
  const resolution = pixels >= 3840 * 2160 ? 30 : pixels >= 1920 * 1080 ? 27 : pixels >= 1280 * 720 ? 20 : pixels > 0 ? 8 : 0
  const deviation = evidence.durationSeconds === null ? Number.POSITIVE_INFINITY : Math.abs(evidence.durationSeconds - targetDurationSeconds)
  const durationAdherence = deviation <= 0.35 ? 20 : deviation <= 1 ? 16 : deviation <= 2 ? 10 : evidence.durationSeconds ? 4 : 0
  const bytesPerSecond = evidence.durationSeconds && evidence.durationSeconds > 0 ? evidence.fileSizeBytes / evidence.durationSeconds : 0
  const dataDensity = bytesPerSecond >= 1_000_000 ? 15 : bytesPerSecond >= 500_000 ? 12 : bytesPerSecond >= 200_000 ? 8 : bytesPerSecond > 0 ? 3 : 0
  const premiumModel = isPreferredPremiumGenxModel(evidence.model, 'hero_video') ? 20 : 0
  const outputValidation = evidence.outputValidated ? 15 : 0
  return {
    candidateId: evidence.candidateId,
    sceneNumber: evidence.sceneNumber,
    score: resolution + durationAdherence + dataDensity + premiumModel + outputValidation,
    breakdown: { resolution, durationAdherence, dataDensity, premiumModel, outputValidation },
  }
}

export function selectPremiumAdvertWinners(
  evidence: PremiumCandidateEvidence[],
  scenes: readonly PremiumAdvertScene[],
): Array<{ sceneNumber: number; candidateId: string; score: PremiumCandidateScore }> {
  return scenes.map((scene) => {
    const ranked = evidence
      .filter((item) => item.sceneNumber === scene.sceneNumber)
      .map((item) => ({ item, score: scorePremiumVideoCandidate(item, scene.durationSeconds) }))
      .sort((a, b) => b.score.score - a.score.score || a.item.candidateId.localeCompare(b.item.candidateId))
    if (!ranked.length) throw new Error(`No completed premium candidate exists for scene ${scene.sceneNumber}`)
    return { sceneNumber: scene.sceneNumber, candidateId: ranked[0]!.item.candidateId, score: ranked[0]!.score }
  })
}
