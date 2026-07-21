export interface AmarktAIClientOptions { apiKey: string; baseUrl?: string; fetch?: typeof globalThis.fetch }
export interface ApprovedRoute { provider: 'genx' | 'together' | 'deepinfra'; model: string }
export interface ExecuteRequest { capability: string; prompt?: string; input?: Record<string, unknown>; metadata?: Record<string, unknown>; route?: ApprovedRoute; callbackUrl?: string }
export type BrandProfilePayload = Record<string, unknown>

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
