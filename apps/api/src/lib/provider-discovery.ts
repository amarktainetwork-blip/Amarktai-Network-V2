export interface DiscoveredModel {
  provider: string
  modelId: string
  displayName: string
  family: string
  category: string
  primaryRole: string
  costTier: string
  latencyTier: string
  contextWindow: number
  capabilities: Record<string, boolean>
  estimatedUnitCost: number | null
  qualityTier: string
  source: string
  catalogCompleteness: string
  isLiveDiscovered: boolean
  modelOwner: string
  providerRawType: string
  providerRawCategory: string
  notes: string
  rawMetadata: Record<string, unknown>
  discoveredAt: string
  lastSyncedAt: string
  pricingSource: string
  pricingConfidence: string
}

export interface DiscoveryResult {
  provider: string
  models: DiscoveredModel[]
  totalDiscovered: number
  source: string
  catalogCompleteness: string
  discoveredAt: string
  error: string | null
}

// Together model type mapping
function mapTogetherType(type: string, id: string): { category: string; role: string; capabilities: Record<string, boolean> } {
  const lower = (type || '').toLowerCase()
  const idLower = (id || '').toLowerCase()

  if (lower.includes('chat') || lower.includes('language') || lower === 'text') {
    const caps: Record<string, boolean> = { supportsChat: true, supportsText: true }
    if (idLower.includes('instruct') || idLower.includes('chat')) caps.supportsChat = true
    if (idLower.includes('code')) caps.supportsCode = true
    return { category: 'text', role: 'chat', capabilities: caps }
  }
  if (lower.includes('image') || lower === 'image') {
    if (idLower.includes('edit')) return { category: 'image', role: 'image_edit', capabilities: { supportsImageEditing: true } }
    return { category: 'image', role: 'image_generation', capabilities: { supportsImageGeneration: true } }
  }
  if (lower.includes('embedding')) return { category: 'embeddings', role: 'embeddings', capabilities: { supportsEmbeddings: true } }
  if (lower.includes('rerank')) return { category: 'reranking', role: 'reranking', capabilities: { supportsReranking: true } }
  if (lower.includes('moderation')) return { category: 'text', role: 'moderation', capabilities: { supportsText: true } }
  if (lower.includes('audio') || lower.includes('speech')) return { category: 'audio', role: 'stt', capabilities: { supportsStt: true } }
  if (lower.includes('video')) return { category: 'video', role: 'video_generation', capabilities: { supportsVideoGeneration: true } }

  // Default to text
  return { category: 'text', role: 'chat', capabilities: { supportsChat: true, supportsText: true } }
}

function mapCostTier(pricing: Record<string, unknown> | null | undefined): string {
  if (!pricing) return 'unknown'
  const prompt = Number(pricing.prompt || 0)
  if (prompt === 0) return 'free'
  if (prompt < 0.000001) return 'very_low'
  if (prompt < 0.00001) return 'low'
  if (prompt < 0.0001) return 'medium'
  if (prompt < 0.001) return 'high'
  return 'premium'
}

export async function discoverTogetherModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return {
        provider: 'together',
        models: [],
        totalDiscovered: 0,
        source: 'provider_api',
        catalogCompleteness: 'discovery_failed',
        discoveredAt,
        error: `Together API returned ${response.status}`,
      }
    }

    const data = await response.json() as { id: string; type?: string; display_name?: string; organization?: string; context_length?: number; pricing?: Record<string, unknown>; license?: string }[]
    const models: DiscoveredModel[] = []

    for (const item of data) {
      const mapped = mapTogetherType(item.type || '', item.id)
      models.push({
        provider: 'together',
        modelId: item.id,
        displayName: item.display_name || item.id,
        family: item.id.split('/')[0] || '',
        category: mapped.category,
        primaryRole: mapped.role,
        costTier: mapCostTier(item.pricing),
        latencyTier: 'medium',
        contextWindow: item.context_length || 4096,
        capabilities: mapped.capabilities,
        estimatedUnitCost: item.pricing?.prompt ? Number(item.pricing.prompt) : null,
        qualityTier: 'standard',
        source: 'provider_api',
        catalogCompleteness: 'complete_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: item.organization || item.id.split('/')[0] || '',
        providerRawType: item.type || '',
        providerRawCategory: '',
        notes: `Discovered from Together API. License: ${item.license || 'unknown'}.`,
        rawMetadata: item as unknown as Record<string, unknown>,
        discoveredAt,
        lastSyncedAt: discoveredAt,
        pricingSource: item.pricing ? 'provider_api' : 'unknown',
        pricingConfidence: item.pricing ? 'known' : 'unknown',
      })
    }

    return {
      provider: 'together',
      models,
      totalDiscovered: models.length,
      source: 'provider_api',
      catalogCompleteness: 'complete_from_provider_api',
      discoveredAt,
      error: null,
    }
  } catch (err) {
    return {
      provider: 'together',
      models: [],
      totalDiscovered: 0,
      source: 'provider_api',
      catalogCompleteness: 'discovery_failed',
      discoveredAt,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function discoverDeepInfraModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetch('https://api.deepinfra.com/v1/openai/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return {
        provider: 'deepinfra',
        models: [],
        totalDiscovered: 0,
        source: 'provider_api',
        catalogCompleteness: 'discovery_failed',
        discoveredAt,
        error: `DeepInfra API returned ${response.status}`,
      }
    }

    const data = await response.json() as { id: string; object?: string; created?: number; owned_by?: string; context?: number; max_model_len?: number; task?: string; pricing?: Record<string, unknown> }[]
    const models: DiscoveredModel[] = []

    for (const item of data) {
      const task = (item.task || '').toLowerCase()
      let category = 'text'
      let role = 'chat'
      const caps: Record<string, boolean> = {}

      if (task.includes('text-generation') || task.includes('conversational') || task.includes('chat')) {
        category = 'text'; role = 'chat'; caps.supportsChat = true; caps.supportsText = true
      } else if (task.includes('text-to-image') || task.includes('text-to-img')) {
        category = 'image'; role = 'image_generation'; caps.supportsImageGeneration = true
      } else if (task.includes('text-to-video')) {
        category = 'video'; role = 'video_generation'; caps.supportsVideoGeneration = true
      } else if (task.includes('text-to-music') || task.includes('text-to-audio')) {
        category = 'audio'; role = 'music_generation'; caps.supportsText = true
      } else if (task.includes('text-to-speech')) {
        category = 'audio'; role = 'tts'; caps.supportsTts = true
      } else if (task.includes('automatic-speech-recognition') || task.includes('speech-to-text')) {
        category = 'audio'; role = 'stt'; caps.supportsStt = true
      } else if (task.includes('embedding')) {
        category = 'embeddings'; role = 'embeddings'; caps.supportsEmbeddings = true
      } else if (task.includes('rerank')) {
        category = 'reranking'; role = 'reranking'; caps.supportsReranking = true
      } else if (task.includes('multimodal') || task.includes('vision')) {
        category = 'multimodal'; role = 'multimodal'; caps.supportsMultimodal = true
      } else {
        caps.supportsText = true
      }

      models.push({
        provider: 'deepinfra',
        modelId: item.id,
        displayName: item.id,
        family: item.id.split('/')[0] || '',
        category,
        primaryRole: role,
        costTier: 'medium',
        latencyTier: 'medium',
        contextWindow: item.max_model_len || item.context || 4096,
        capabilities: caps,
        estimatedUnitCost: null,
        qualityTier: 'standard',
        source: 'provider_api',
        catalogCompleteness: 'complete_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: item.owned_by || item.id.split('/')[0] || '',
        providerRawType: item.object || '',
        providerRawCategory: item.task || '',
        notes: `Discovered from DeepInfra API. Task: ${item.task || 'unknown'}.`,
        rawMetadata: item as unknown as Record<string, unknown>,
        discoveredAt,
        lastSyncedAt: discoveredAt,
        pricingSource: 'unknown',
        pricingConfidence: 'unknown',
      })
    }

    return {
      provider: 'deepinfra',
      models,
      totalDiscovered: models.length,
      source: 'provider_api',
      catalogCompleteness: 'complete_from_provider_api',
      discoveredAt,
      error: null,
    }
  } catch (err) {
    return {
      provider: 'deepinfra',
      models: [],
      totalDiscovered: 0,
      source: 'provider_api',
      catalogCompleteness: 'discovery_failed',
      discoveredAt,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function discoverGenXModels(apiKey: string, baseUrl?: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()
  const base = baseUrl || 'https://api.genx.ai'

  try {
    const response = await fetch(`${base}/api/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return {
        provider: 'genx',
        models: [],
        totalDiscovered: 0,
        source: 'provider_api',
        catalogCompleteness: 'discovery_failed',
        discoveredAt,
        error: `GenX API returned ${response.status}`,
      }
    }

    const data = await response.json() as { data?: { id: string; name?: string; description?: string; category?: string; pricing?: Record<string, unknown> }[] } | { id: string; name?: string; description?: string; category?: string; pricing?: Record<string, unknown> }[]
    const modelList = Array.isArray(data) ? data : (data?.data || [])
    const models: DiscoveredModel[] = []

    for (const item of modelList) {
      const category = (item.category || '').toLowerCase()
      let mappedCategory = 'video'
      let role = 'video_generation'
      const caps: Record<string, boolean> = {}

      if (category.includes('image')) {
        mappedCategory = 'image'; role = 'image_generation'; caps.supportsImageGeneration = true
      } else if (category.includes('avatar')) {
        mappedCategory = 'video'; role = 'avatar_generation'; caps.supportsVideoGeneration = true
      } else if (category.includes('audio') || category.includes('voice')) {
        mappedCategory = 'audio'; role = 'tts'; caps.supportsTts = true
      } else {
        mappedCategory = 'video'; role = 'video_generation'; caps.supportsVideoGeneration = true
      }

      models.push({
        provider: 'genx',
        modelId: item.id,
        displayName: item.name || item.id,
        family: 'genx',
        category: mappedCategory,
        primaryRole: role,
        costTier: 'premium',
        latencyTier: 'high',
        contextWindow: 0,
        capabilities: caps,
        estimatedUnitCost: null,
        qualityTier: 'premium',
        source: 'provider_api',
        catalogCompleteness: 'complete_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: 'genx',
        providerRawType: '',
        providerRawCategory: category,
        notes: `Discovered from GenX models endpoint. Category: ${category || 'unknown'}.`,
        rawMetadata: item as unknown as Record<string, unknown>,
        discoveredAt,
        lastSyncedAt: discoveredAt,
        pricingSource: 'unknown',
        pricingConfidence: 'unknown',
      })
    }

    return {
      provider: 'genx',
      models,
      totalDiscovered: models.length,
      source: 'provider_api',
      catalogCompleteness: 'complete_from_provider_api',
      discoveredAt,
      error: null,
    }
  } catch (err) {
    return {
      provider: 'genx',
      models: [],
      totalDiscovered: 0,
      source: 'provider_api',
      catalogCompleteness: 'discovery_failed',
      discoveredAt,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function discoverGroqModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return {
        provider: 'groq',
        models: [],
        totalDiscovered: 0,
        source: 'provider_api',
        catalogCompleteness: 'discovery_failed',
        discoveredAt,
        error: `Groq API returned ${response.status}`,
      }
    }

    const data = await response.json() as { data: { id: string; object?: string; created?: number; owned_by?: string; active?: boolean; context_window?: number; pricing?: Record<string, unknown>; capabilities?: Record<string, boolean> }[] }
    const models: DiscoveredModel[] = []

    for (const item of data.data) {
      const id = item.id.toLowerCase()
      let category = 'text'
      let role = 'chat'
      const caps: Record<string, boolean> = { supportsChat: true, supportsText: true }

      if (id.includes('whisper') || id.includes('distil-whisper')) {
        category = 'audio'; role = 'stt'; caps.supportsStt = true; delete caps.supportsChat; delete caps.supportsText
      } else if (id.includes('tts') || id.includes('playai')) {
        category = 'audio'; role = 'tts'; caps.supportsTts = true; delete caps.supportsChat; delete caps.supportsText
      } else if (id.includes('guard')) {
        category = 'text'; role = 'moderation'
      } else if (id.includes('vision') || id.includes('llama-3.2')) {
        caps.supportsMultimodal = true
      } else if (id.includes('tool') || id.includes('compound')) {
        caps.supportsToolUse = true
      }

      if (item.capabilities) {
        if (item.capabilities.structured_output) caps.supportsStructuredOutput = true
        if (item.capabilities.tool_use) caps.supportsToolUse = true
        if (item.capabilities.vision) caps.supportsMultimodal = true
      }

      models.push({
        provider: 'groq',
        modelId: item.id,
        displayName: item.id,
        family: item.id.split('-')[0] || 'groq',
        category,
        primaryRole: role,
        costTier: 'very_low',
        latencyTier: 'ultra_low',
        contextWindow: item.context_window || 4096,
        capabilities: caps,
        estimatedUnitCost: null,
        qualityTier: 'standard',
        source: 'provider_api',
        catalogCompleteness: 'complete_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: item.owned_by || 'groq',
        providerRawType: item.object || '',
        providerRawCategory: '',
        notes: `Discovered from Groq API. Active: ${item.active ?? 'unknown'}.`,
        rawMetadata: item as unknown as Record<string, unknown>,
        discoveredAt,
        lastSyncedAt: discoveredAt,
        pricingSource: 'unknown',
        pricingConfidence: 'unknown',
      })
    }

    return {
      provider: 'groq',
      models,
      totalDiscovered: models.length,
      source: 'provider_api',
      catalogCompleteness: 'complete_from_provider_api',
      discoveredAt,
      error: null,
    }
  } catch (err) {
    return {
      provider: 'groq',
      models: [],
      totalDiscovered: 0,
      source: 'provider_api',
      catalogCompleteness: 'discovery_failed',
      discoveredAt,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function discoverGenXPricing(apiKey: string, baseUrl?: string): Promise<{
  pricing: Record<string, { input: number; output: number; unit: string }>
  source: string
  error: string | null
}> {
  const base = baseUrl || 'https://api.genx.ai'

  try {
    const response = await fetch(`${base}/api/v1/account/pricing`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return { pricing: {}, source: 'unknown', error: `GenX pricing API returned ${response.status}` }
    }

    const data = await response.json() as Record<string, unknown>
    const pricing: Record<string, { input: number; output: number; unit: string }> = {}

    // Normalize GenX pricing format
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null) {
          const v = value as Record<string, unknown>
          pricing[key] = {
            input: Number(v.input || v.prompt || 0),
            output: Number(v.output || v.completion || 0),
            unit: String(v.unit || 'token'),
          }
        }
      }
    }

    return { pricing, source: 'provider_api', error: null }
  } catch (err) {
    return { pricing: {}, source: 'unknown', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
