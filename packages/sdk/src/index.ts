export interface AmarktAIClientOptions { apiKey: string; baseUrl?: string; fetch?: typeof globalThis.fetch }
export interface ExecuteRequest { capability: string; prompt?: string; input?: Record<string, unknown>; metadata?: Record<string, unknown>; callbackUrl?: string }
export interface BrandAssetReference {
  artifactId: string
  role: 'primary_logo' | 'secondary_logo' | 'icon' | 'product' | 'offering' | 'campaign_reference' | 'photography' | 'video' | 'audio'
  approved: boolean
  rightsVerified: boolean
  sourceEvidenceIds: string[]
  offeringIds: string[]
}
export type BrandProfilePayload = Record<string, unknown> & { visual?: Record<string, unknown> & { assets?: BrandAssetReference[] } }
export interface MarketingCampaignBrief {
  campaignId: string
  brandProfileId: string
  title: string
  objective: string
  audienceIds: string[]
  offeringIds?: string[]
  channels: Array<'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'email' | 'website' | 'blog' | 'paid_search' | 'display'>
  callToAction: string
  locale?: string
  constraints?: string[]
  sourceArtifactIds?: string[]
  qualityProfile?: 'draft' | 'standard' | 'premium' | 'publication'
  approvalRequired?: boolean
  maxCredits?: number | null
  dueAt?: string | null
}
export interface ProductBreakoutRequest {
  brandProfileId: string
  campaignId: string
  mode: 'product_breakout'
  prompt: string
  objective: string
  audienceId: string
  offeringId: string
  productArtifactId: string
  logoArtifactIds?: string[]
  callToAction: string
  sourceArtifactIds?: string[]
  aspectRatios: Array<'16:9' | '9:16' | '1:1'>
  durationSeconds: number
  candidateCount?: number
  includeCaptions?: boolean
  includeSubtitleFiles?: boolean
  includeThumbnail?: boolean
  includeSocialCopy?: boolean
  qualityProfile?: 'draft' | 'standard' | 'premium' | 'publication'
  approvalRequired?: boolean
  maxCredits: number
}
export interface ProductBreakoutCreativeContract {
  version: 'product-breakout-v1'
  productSourceArtifactId: string
  logoArtifactIds: string[]
  treatment: 'social_post_card_frame'
  initialContainment: 'product_inside_frame'
  breakoutRequirement: 'product_visibly_crosses_frame_boundary'
  depthTreatment: Record<string, unknown>
  motion: Record<string, unknown>
  preservation: Record<string, unknown>
  brandSafeBackground: string
  approvedClaims: string[]
  prohibitedClaims: string[]
  requiredDisclaimers: string[]
  overlayInstructions: string[]
  captionInstructions: string[]
  safeAreas: Record<string, unknown>
  callToAction: string
  durationSeconds: number
  candidateCount: number
  creditCeiling: number
  segmentationAvailable: boolean
  visualLimitation: string | null
}
export interface SocialAdPlanPayload { request: ProductBreakoutRequest | Record<string, unknown>; campaign: Record<string, unknown>; idempotencyKey?: string }
export interface SocialAdApprovalPayload { decision: 'approved' | 'rejected' | 'revision_requested'; notes?: string }
export interface MemorySearchOptions { namespace: string; query?: string; limit?: number; types?: Array<'event' | 'summary' | 'context' | 'learned'> }
export interface MemoryWritePayload { namespace: string; content: string; key?: string; memoryType?: 'event' | 'summary' | 'context' | 'learned'; importance?: number; ttlSeconds?: number }
export interface RagIngestPayload { namespace: string; sourceId: string; title?: string; url?: string; text: string; metadata?: Record<string, unknown>; chunkSize?: number; chunkOverlap?: number }
export interface RagSearchPayload { namespace: string; query: string; topK?: number; minScore?: number; rerank?: boolean; answer?: boolean }
export interface ResearchExecutionPayload {
  query: string
  mode?: 'search' | 'browse' | 'deep'
  seedUrls?: string[]
  allowedDomains?: string[]
  blockedDomains?: string[]
  maxSearchResults?: number
  maxPages?: number
  maxDepth?: number
  maxBytesPerPage?: number
  freshnessDays?: number
  language?: string
  safeSearch?: 'strict' | 'moderate' | 'off'
  answer?: boolean
  includeSnapshots?: boolean
  metadata?: Record<string, unknown>
}
export type SpecialistVisionCapability = 'depth_estimation' | 'keypoint_detection' | 'mask_generation' | 'zero_shot_object_detection' | 'visual_document_retrieval' | 'video_classification'
export interface SpecialistVisionRequestBase { maxCredits: number; idempotencyKey: string }
export interface DepthEstimationRequest extends SpecialistVisionRequestBase { sourceImageArtifactId: string; outputMode?: 'relative' | 'metric_if_calibrated'; normalize?: boolean; visualization?: boolean }
export interface KeypointDetectionRequest extends SpecialistVisionRequestBase { sourceImageArtifactId: string; domain: string; confidenceThreshold?: number; overlay?: boolean }
export type MaskGuidance = { type: 'prompt'; prompt: string } | { type: 'class'; className: string } | { type: 'points'; points: Array<{ x: number; y: number; label: 'foreground' | 'background' }> } | { type: 'box'; box: { x: number; y: number; width: number; height: number } }
export interface MaskGenerationRequest extends SpecialistVisionRequestBase { sourceImageArtifactId: string; guidance: MaskGuidance; outputFormat?: 'binary_png' | 'grayscale_png' | 'transparent_png'; overlay?: boolean; maxMasks?: number }
export interface ZeroShotObjectDetectionRequest extends SpecialistVisionRequestBase { sourceImageArtifactId: string; candidateLabels: string[]; confidenceThreshold?: number; maxDetections?: number; overlay?: boolean }
export interface VisualDocumentRetrievalRequest extends SpecialistVisionRequestBase { sourceDocumentArtifactId?: string; ingestedDocumentId?: string; query: string; maxResults?: number; pages?: number[]; sections?: string[]; citationsRequired?: true }
export interface VideoClassificationRequest extends SpecialistVisionRequestBase { sourceVideoArtifactId: string; candidateLabels?: string[]; governedTaxonomy?: string; samplingProfile?: 'sparse' | 'balanced' | 'dense'; temporalSegmentation?: boolean }
export interface SpecialistVisionRequestByCapability { depth_estimation: DepthEstimationRequest; keypoint_detection: KeypointDetectionRequest; mask_generation: MaskGenerationRequest; zero_shot_object_detection: ZeroShotObjectDetectionRequest; visual_document_retrieval: VisualDocumentRetrievalRequest; video_classification: VideoClassificationRequest }
export interface SourceArtifactUpload { title: string; kind: 'image' | 'video' | 'document'; dataBase64: string; declaredMimeType?: string }
export interface BrandScrapePayload { url: string; crawlDepth?: number; permittedContentCategories: Array<'brand' | 'products' | 'services' | 'legal' | 'contact' | 'about' | 'assets'>; campaignId?: string; maxPages?: number; maxCredits: number; idempotencyKey: string }
export interface DocumentIngestPayload { sourceArtifactId: string; documentId: string; namespace: string; title?: string; chunkSize?: number; chunkOverlap?: number; ocrMode?: 'automatic' | 'never' | 'always'; maxPages?: number; maxCredits: number; idempotencyKey: string }
export interface CampaignGenerationPayload { campaignId: string; brandProfileId: string; offeringId: string; objective: string; audienceIds: string[]; channels: MarketingCampaignBrief['channels']; startDate: string; endDate: string; researchExecutionIds?: string[]; ragNamespace?: string; budgetCredits: number; qualityProfile?: 'draft' | 'standard' | 'premium' | 'publication'; approvalRequired?: true; createChildSocialWorkflows?: boolean; idempotencyKey: string }
export interface WorkflowApprovalPayload { decision: 'approved' | 'rejected' | 'revision_requested'; notes: string }
export type VoiceAvatarUseScope = 'narration' | 'conversational_agent' | 'marketing' | 'education' | 'accessibility' | 'customer_support' | 'avatar_performance' | 'internal_production'
export type VoiceAvatarEvidencePurpose =
  | 'voice_source_audio'
  | 'voice_identity_verification'
  | 'voice_consent'
  | 'voice_recording_consent'
  | 'voice_preview'
  | 'avatar_portrait'
  | 'avatar_identity_verification'
  | 'avatar_consent'
  | 'avatar_creation_evidence'
  | 'avatar_preview'
export interface HumanConsentEvidencePayload {
  version: 1
  subjectReference: string
  rightsHolderReference: string
  subjectAgeConfirmedAdult: true
  identityVerificationArtifactId: string
  consentArtifactId: string
  sourceRecordingConsentArtifactId?: string
  permittedUses: VoiceAvatarUseScope[]
  commercialUseAllowed: boolean
  syntheticDisclosureRequired?: boolean
  revocable: true
  declaredAt: string
  verifiedAt: string
  expiresAt?: string
  verifierReference: string
  jurisdictions: string[]
  notes?: string
}
export type VoiceSourcePayload =
  | { sourceType: 'provider_catalogue'; catalogueVoiceId: string }
  | { sourceType: 'user_recording'; sourceAudioArtifactIds: string[] }
  | { sourceType: 'synthetic_design'; designPrompt: string }
  | { sourceType: 'voice_remix'; parentVoiceProfileId: string; remixInstructions: string }
export interface VoiceProfileDraftPayload {
  displayName: string
  description?: string
  source: VoiceSourcePayload
  language: string
  locale?: string
  styleTags?: string[]
  permittedUses: VoiceAvatarUseScope[]
  consentEvidence?: HumanConsentEvidencePayload
  previewArtifactId?: string
}
export type VoiceProfileUpdatePayload = Partial<VoiceProfileDraftPayload>
export type AvatarSourcePayload =
  | { subjectType: 'synthetic'; portraitArtifactId: string; creationEvidenceArtifactId: string }
  | { subjectType: 'human_likeness'; portraitArtifactId: string; consentEvidence: HumanConsentEvidencePayload }
export interface AvatarProfileDraftPayload {
  displayName: string
  description?: string
  source: AvatarSourcePayload
  permittedUses: VoiceAvatarUseScope[]
  defaultVoiceProfileId?: string
  styleTags?: string[]
  previewArtifactId?: string
}
export type AvatarProfileUpdatePayload = Partial<AvatarProfileDraftPayload>

export class AmarktAIError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); this.name = 'AmarktAIError' }
}

export class AmarktAIClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly transport: typeof globalThis.fetch
  constructor(options: AmarktAIClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required')
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://network.amarktai.com').replace(/\/$/, '')
    this.transport = options.fetch ?? globalThis.fetch
  }
  execute(request: ExecuteRequest) { return this.request('/api/v1/jobs', { method: 'POST', body: JSON.stringify({ ...request, prompt: request.prompt ?? request.capability }) }) }
  job(jobId: string) { return this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}`) }
  cancel(jobId: string) { return this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }) }
  capabilities() { return this.request('/api/v1/capabilities') }
  policy() { return this.request('/api/v1/policy') }
  usage() { return this.request('/api/v1/usage') }
  brandProfiles() { return this.request('/api/v1/brand-profiles') }
  brandProfile(brandProfileId: string) { return this.request(`/api/v1/brand-profiles/${encodeURIComponent(brandProfileId)}`) }
  createBrandProfile(profile: BrandProfilePayload) { return this.request('/api/v1/brand-profiles', { method: 'POST', body: JSON.stringify(profile) }) }
  updateBrandProfile(brandProfileId: string, profile: BrandProfilePayload) { return this.request(`/api/v1/brand-profiles/${encodeURIComponent(brandProfileId)}`, { method: 'PUT', body: JSON.stringify(profile) }) }
  archiveBrandProfile(brandProfileId: string) { return this.request(`/api/v1/brand-profiles/${encodeURIComponent(brandProfileId)}`, { method: 'DELETE' }) }
  marketingCampaigns() { return this.request('/api/v1/marketing-campaigns') }
  saveMarketingCampaign(campaign: MarketingCampaignBrief) { return this.request('/api/v1/marketing-campaigns', { method: 'POST', body: JSON.stringify(campaign) }) }
  planSocialAdVideo(payload: SocialAdPlanPayload) { return this.request('/api/v1/social-ad-video/plan', { method: 'POST', body: JSON.stringify(payload) }) }
  executeSocialAdVideo(payload: SocialAdPlanPayload) { return this.request('/api/v1/social-ad-video/executions', { method: 'POST', body: JSON.stringify(payload) }) }
  socialAdVideoExecution(executionId: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}`) }
  resumeSocialAdVideo(executionId: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/resume`, { method: 'POST' }) }
  retrySocialAdVideoCandidate(executionId: string, candidateJobId: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/candidates/${encodeURIComponent(candidateJobId)}/retry`, { method: 'POST' }) }
  cancelSocialAdVideo(executionId: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' }) }
  regenerateSocialAdVideo(executionId: string, notes?: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/regenerate`, { method: 'POST', body: JSON.stringify({ notes }) }) }
  assembleSocialAdVideo(executionId: string) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/assemble`, { method: 'POST' }) }
  async decideSocialAdVideo(executionId: string, payload: SocialAdApprovalPayload): Promise<unknown> {
    const approval = await this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/approval`, { method: 'POST', body: JSON.stringify(payload) })
    if (payload.decision !== 'approved') return { approval }
    const assembly = await this.assembleSocialAdVideo(executionId)
    return { approval, assembly }
  }
  decideFinalSocialAdVideo(executionId: string, payload: SocialAdApprovalPayload) { return this.request(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}/final-approval`, { method: 'POST', body: JSON.stringify(payload) }) }
  searchMemory(options: MemorySearchOptions) {
    const query = new URLSearchParams({ namespace: options.namespace })
    if (options.query) query.set('q', options.query)
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    if (options.types?.length) query.set('types', options.types.join(','))
    return this.request(`/api/v1/memory/search?${query.toString()}`)
  }
  writeMemory(payload: MemoryWritePayload) { return this.request('/api/v1/memory', { method: 'POST', body: JSON.stringify(payload) }) }
  deleteMemory(memoryId: number, namespace: string) { return this.request(`/api/v1/memory/${encodeURIComponent(String(memoryId))}?namespace=${encodeURIComponent(namespace)}`, { method: 'DELETE' }) }
  ingestRag(payload: RagIngestPayload) { return this.request('/api/v1/rag/ingest', { method: 'POST', body: JSON.stringify(payload) }) }
  searchRag(payload: RagSearchPayload) { return this.request('/api/v1/rag/search', { method: 'POST', body: JSON.stringify(payload) }) }
  ragExecution(executionId: string) { return this.request(`/api/v1/rag/executions/${encodeURIComponent(executionId)}`) }
  executeResearch(payload: ResearchExecutionPayload) { return this.request('/api/v1/research/executions', { method: 'POST', body: JSON.stringify(payload) }) }
  researchExecution(executionId: string) { return this.request(`/api/v1/research/executions/${encodeURIComponent(executionId)}`) }
  uploadSourceArtifact(payload: SourceArtifactUpload) { return this.request('/api/v1/source-artifacts', { method: 'POST', body: JSON.stringify(payload) }) }
  executeSpecialistVision<C extends SpecialistVisionCapability>(capability: C, input: SpecialistVisionRequestByCapability[C], prompt = capability) { return this.execute({ capability, prompt, input: { ...input } as Record<string, unknown> }) }
  executeDepthEstimation(input: DepthEstimationRequest) { return this.executeSpecialistVision('depth_estimation', input) }
  executeKeypointDetection(input: KeypointDetectionRequest) { return this.executeSpecialistVision('keypoint_detection', input) }
  executeMaskGeneration(input: MaskGenerationRequest) { return this.executeSpecialistVision('mask_generation', input) }
  executeZeroShotObjectDetection(input: ZeroShotObjectDetectionRequest) { return this.executeSpecialistVision('zero_shot_object_detection', input) }
  executeVisualDocumentRetrieval(input: VisualDocumentRetrievalRequest) { return this.executeSpecialistVision('visual_document_retrieval', input) }
  executeVideoClassification(input: VideoClassificationRequest) { return this.executeSpecialistVision('video_classification', input) }
  executeBrandScrape(payload: BrandScrapePayload) { return this.request('/api/v1/brand-scrape/executions', { method: 'POST', body: JSON.stringify(payload) }) }
  brandScrapeExecution(executionId: string) { return this.request(`/api/v1/brand-scrape/executions/${encodeURIComponent(executionId)}`) }
  decideBrandScrape(executionId: string, payload: WorkflowApprovalPayload) { return this.request(`/api/v1/brand-scrape/executions/${encodeURIComponent(executionId)}/approval`, { method: 'POST', body: JSON.stringify(payload) }) }
  cancelBrandScrape(executionId: string) { return this.request(`/api/v1/brand-scrape/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' }) }
  executeDocumentIngest(payload: DocumentIngestPayload) { return this.request('/api/v1/document-ingest/executions', { method: 'POST', body: JSON.stringify(payload) }) }
  documentIngestExecution(executionId: string) { return this.request(`/api/v1/document-ingest/executions/${encodeURIComponent(executionId)}`) }
  cancelDocumentIngest(executionId: string) { return this.request(`/api/v1/document-ingest/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' }) }
  executeCampaignGeneration(payload: CampaignGenerationPayload) { return this.request('/api/v1/campaign-generation/executions', { method: 'POST', body: JSON.stringify(payload) }) }
  campaignGenerationExecution(executionId: string) { return this.request(`/api/v1/campaign-generation/executions/${encodeURIComponent(executionId)}`) }
  decideCampaignGeneration(executionId: string, payload: WorkflowApprovalPayload) { return this.request(`/api/v1/campaign-generation/executions/${encodeURIComponent(executionId)}/approval`, { method: 'POST', body: JSON.stringify(payload) }) }
  cancelCampaignGeneration(executionId: string) { return this.request(`/api/v1/campaign-generation/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' }) }
  voiceProfiles() { return this.request('/api/v1/voice-profiles') }
  voiceProfile(voiceProfileId: string) { return this.request(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`) }
  createVoiceProfile(payload: VoiceProfileDraftPayload) { return this.request('/api/v1/voice-profiles', { method: 'POST', body: JSON.stringify(payload) }) }
  updateVoiceProfile(voiceProfileId: string, payload: VoiceProfileUpdatePayload) { return this.request(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`, { method: 'PUT', body: JSON.stringify(payload) }) }
  archiveVoiceProfile(voiceProfileId: string) { return this.request(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`, { method: 'DELETE' }) }
  avatarProfiles() { return this.request('/api/v1/avatar-profiles') }
  avatarProfile(avatarProfileId: string) { return this.request(`/api/v1/avatar-profiles/${encodeURIComponent(avatarProfileId)}`) }
  createAvatarProfile(payload: AvatarProfileDraftPayload) { return this.request('/api/v1/avatar-profiles', { method: 'POST', body: JSON.stringify(payload) }) }
  updateAvatarProfile(avatarProfileId: string, payload: AvatarProfileUpdatePayload) { return this.request(`/api/v1/avatar-profiles/${encodeURIComponent(avatarProfileId)}`, { method: 'PUT', body: JSON.stringify(payload) }) }
  archiveAvatarProfile(avatarProfileId: string) { return this.request(`/api/v1/avatar-profiles/${encodeURIComponent(avatarProfileId)}`, { method: 'DELETE' }) }
  async uploadProfileArtifact(purpose: VoiceAvatarEvidencePurpose, file: Blob, filename?: string): Promise<unknown> {
    const form = new FormData()
    const inferredName = 'name' in file && typeof file.name === 'string' ? file.name : 'evidence'
    form.append('file', file, filename ?? inferredName)
    const response = await this.transport(`${this.baseUrl}/api/v1/profile-artifacts/${encodeURIComponent(purpose)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
      body: form,
    })
    if (!response.ok) throw await this.error(response)
    return response.json()
  }
  artifact(artifactId: string) { return this.request(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`) }
  artifactFile(artifactId: string, options: { download?: boolean; range?: string } = {}) {
    const query = options.download ? '?download=1' : ''
    return this.transport(`${this.baseUrl}/api/v1/artifacts/${encodeURIComponent(artifactId)}/file${query}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(options.range ? { Range: options.range } : {}) },
    })
  }
  async streamChat(input: { prompt: string; input?: Record<string, unknown> }, onEvent: (event: { type: string; data: unknown }) => void): Promise<void> {
    const response = await this.transport(`${this.baseUrl}/api/v1/streaming-chat`, { method: 'POST', headers: this.headers(), body: JSON.stringify(input) })
    if (!response.ok || !response.body) throw await this.error(response)
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() ?? ''; for (const event of events) { const type = event.match(/^event:\s*(.+)$/m)?.[1] ?? 'message'; const raw = event.match(/^data:\s*(.+)$/m)?.[1]; if (raw) onEvent({ type, data: JSON.parse(raw) }) } }
  }
  private headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
  private async request(path: string, init: RequestInit = {}): Promise<unknown> { const response = await this.transport(`${this.baseUrl}${path}`, { ...init, headers: { ...this.headers(), ...init.headers } }); if (!response.ok) throw await this.error(response); return response.json() }
  private async error(response: Response): Promise<AmarktAIError> { const body = await response.json().catch(() => ({})) as Record<string, unknown>; return new AmarktAIError(response.status, String(body.code ?? 'REQUEST_FAILED'), String(body.message ?? `Request failed (${response.status})`), body.details) }
}
