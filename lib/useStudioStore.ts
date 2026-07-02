'use client'
import { create } from 'zustand'

// ─── Types ─────────────────────────────────────────────────────
export interface GeneratedAsset {
  id: string
  type: 'image' | 'video' | 'audio' | 'document'
  name: string
  url: string
  mime: string
  size: string
  gradient: string
  capability: string
  createdAt: number
}

export interface TimelineClip {
  id: string
  start: number
  width: number
  label: string
  assetId?: string
}

export interface TimelineTrack {
  id: string
  label: string
  color: string
  clips: TimelineClip[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'streaming'
  content: string
  timestamp?: number
}

export interface Job {
  id: string
  capability: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: number
  duration?: number
  artifactId?: string
}

export interface Artifact {
  id: string
  type: 'image' | 'video' | 'audio' | 'document'
  name: string
  capability: string
  size: string
  createdAt: number
}

export interface Provider {
  id: string
  name: string
  status: 'active' | 'needs-config' | 'error' | 'experimental'
  capabilities: string[]
  modelCount: number
  lastSynced?: number
}

export interface AppConnection {
  id: string
  name: string
  slug: string
  environment: 'dev' | 'staging' | 'prod'
  status: 'active' | 'paused'
  apiKey: string
  webhookUrl: string
  capabilities: string[]
  tokenBalance: number
  dailyBudget: number
}

export interface Model {
  id: string
  provider: string
  name: string
  capability: string
  status: 'available' | 'unavailable'
}

// ─── Asset Templates ───────────────────────────────────────────
const ASSET_TEMPLATES: Record<string, { type: GeneratedAsset['type']; mime: string; gradient: string }> = {
  'text.chat': { type: 'document', mime: 'text/markdown', gradient: 'from-sky-500/20 to-indigo-500/20' },
  'image.generate': { type: 'image', mime: 'image/png', gradient: 'from-cyan-500/20 to-violet-500/20' },
  'image.edit': { type: 'image', mime: 'image/png', gradient: 'from-pink-500/20 to-orange-500/20' },
  'video.generate': { type: 'video', mime: 'video/mp4', gradient: 'from-emerald-500/20 to-cyan-500/20' },
  'video.longform': { type: 'video', mime: 'video/mp4', gradient: 'from-indigo-500/20 to-purple-500/20' },
  'music.generate': { type: 'audio', mime: 'audio/wav', gradient: 'from-violet-500/20 to-fuchsia-500/20' },
  'voice.tts': { type: 'audio', mime: 'audio/wav', gradient: 'from-teal-500/20 to-emerald-500/20' },
  'voice.stt': { type: 'document', mime: 'text/plain', gradient: 'from-amber-500/20 to-rose-500/20' },
  'avatar.generate': { type: 'video', mime: 'video/mp4', gradient: 'from-fuchsia-500/20 to-pink-500/20' },
  'scrape.crawl': { type: 'document', mime: 'application/json', gradient: 'from-lime-500/20 to-green-500/20' },
  'rag.ingest': { type: 'document', mime: 'application/json', gradient: 'from-sky-500/20 to-cyan-500/20' },
}

let assetCounter = 0
let jobCounter = 0

// ─── Store ─────────────────────────────────────────────────────
interface StudioState {
  // Studio state
  generatedAssets: GeneratedAsset[]
  timelineTracks: TimelineTrack[]
  chatHistory: ChatMessage[]
  generating: Record<string, boolean>
  nodeStates: Record<string, 'idle' | 'processing' | 'complete'>

  // Jobs & Artifacts
  jobs: Job[]
  artifacts: Artifact[]

  // Providers
  providers: Provider[]

  // Apps
  apps: AppConnection[]

  // Models
  models: Model[]

  // Studio actions
  addAsset: (asset: GeneratedAsset) => void
  addClipToTrack: (trackId: string, clip: TimelineClip) => void
  addChatMessage: (msg: ChatMessage) => void
  simulateGeneration: (capability: string, meta?: { title?: string }) => Promise<GeneratedAsset>
  simulateChatResponse: (userMessage: string) => void
  setGenerating: (key: string, value: boolean) => void
  setNodeState: (nodeId: string, state: 'idle' | 'processing' | 'complete') => void
  dropAssetOnTimeline: (asset: GeneratedAsset, trackId: string) => void

  // Data actions (mock — will be replaced with real API calls)
  fetchJobs: () => Promise<void>
  fetchArtifacts: () => Promise<void>
  fetchProviders: () => Promise<void>
  fetchApps: () => Promise<void>
  fetchModels: () => Promise<void>
  testProvider: (providerId: string) => Promise<boolean>
  createApp: (name: string) => Promise<AppConnection>
  syncModels: () => Promise<void>
}

export const useStudioStore = create<StudioState>((set, get) => ({
  // Studio state
  generatedAssets: [],
  timelineTracks: [
    { id: 'video', label: 'Video', color: 'cyan', clips: [] },
    { id: 'voice', label: 'Voice', color: 'violet', clips: [] },
    { id: 'music', label: 'Music', color: 'amber', clips: [] },
    { id: 'captions', label: 'Captions', color: 'emerald', clips: [] },
  ],
  chatHistory: [
    { role: 'assistant', content: 'Welcome to the Studio Director. I can help you plan and execute multi-step creative workflows.\n\nDescribe what you want to create and I\'ll build an execution plan.', timestamp: Date.now() },
  ],
  generating: {},
  nodeStates: {},

  // Data state
  jobs: [],
  artifacts: [],
  providers: [],
  apps: [],
  models: [],

  // Studio actions
  addAsset: (asset) => set((s) => ({ generatedAssets: [...s.generatedAssets, asset] })),
  addClipToTrack: (trackId, clip) => set((s) => ({
    timelineTracks: s.timelineTracks.map((t) => t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t),
  })),
  addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),
  setGenerating: (key, value) => set((s) => ({ generating: { ...s.generating, [key]: value } })),
  setNodeState: (nodeId, state) => set((s) => ({ nodeStates: { ...s.nodeStates, [nodeId]: state } })),

  simulateGeneration: async (capability, meta) => {
    const key = capability.split('.')[0]
    set((s) => ({
      generating: { ...s.generating, [key]: true },
      nodeStates: { ...s.nodeStates, [key]: 'processing' },
    }))
    await new Promise((r) => setTimeout(r, 2000))
    assetCounter++
    jobCounter++
    const template = ASSET_TEMPLATES[capability] || ASSET_TEMPLATES['text.chat']
    const asset: GeneratedAsset = {
      id: `asset-${Date.now()}-${assetCounter}`,
      type: template.type,
      name: meta?.title || `${capability} output #${assetCounter}`,
      url: '', mime: template.mime,
      size: `${(Math.random() * 5 + 0.5).toFixed(1)} MB`,
      gradient: template.gradient, capability, createdAt: Date.now(),
    }
    const job: Job = {
      id: `job-${Date.now()}-${jobCounter}`,
      capability, status: 'completed', createdAt: Date.now(),
      duration: Math.floor(Math.random() * 5000) + 1000, artifactId: asset.id,
    }
    const state = get()
    const trackMap: Record<string, string> = { video: 'video', voice: 'voice', music: 'music', avatar: 'video', image: 'video', longvideo: 'video' }
    const targetTrack = trackMap[key] || 'video'
    const track = state.timelineTracks.find((t) => t.id === targetTrack)
    const lastEnd = track && track.clips.length > 0 ? Math.max(...track.clips.map((c) => c.start + c.width)) : 0
    set((s) => ({
      generatedAssets: [...s.generatedAssets, asset],
      jobs: [job, ...s.jobs],
      artifacts: [{ id: asset.id, type: asset.type, name: asset.name, capability, size: asset.size, createdAt: Date.now() }, ...s.artifacts],
      generating: { ...s.generating, [key]: false },
      nodeStates: { ...s.nodeStates, [key]: 'complete' },
      timelineTracks: s.timelineTracks.map((t) =>
        t.id === targetTrack ? { ...t, clips: [...t.clips, { id: `clip-${Date.now()}`, start: lastEnd + 2, width: 20, label: asset.name, assetId: asset.id }] } : t
      ),
    }))
    return asset
  },

  simulateChatResponse: (userMessage) => {
    const store = get()
    store.addChatMessage({ role: 'user', content: userMessage, timestamp: Date.now() })
    set((s) => ({ generating: { ...s.generating, chat: true } }))
    setTimeout(() => {
      const responses = [
        `I'll help you with that. Let me analyze your request and create an execution plan.\n\n**Step 1:** Analyze input requirements\n**Step 2:** Select optimal providers\n**Step 3:** Execute pipeline\n\nReady to proceed?`,
        `Great idea! Here's my approach:\n\n1. **Content Analysis** — Breaking down your creative brief\n2. **Asset Generation** — Using the best available providers\n3. **Quality Review** — Ensuring output meets standards\n\nShall I begin?`,
      ]
      get().addChatMessage({ role: 'assistant', content: responses[Math.floor(Math.random() * responses.length)], timestamp: Date.now() })
      set((s) => ({ generating: { ...s.generating, chat: false } }))
    }, 1500)
  },

  dropAssetOnTimeline: (asset, trackId) => {
    const state = get()
    const track = state.timelineTracks.find((t) => t.id === trackId)
    if (!track) return
    const lastEnd = track.clips.length > 0 ? Math.max(...track.clips.map((c) => c.start + c.width)) : 0
    set((s) => ({
      timelineTracks: s.timelineTracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, { id: `clip-${Date.now()}`, start: lastEnd + 2, width: 20, label: asset.name, assetId: asset.id }] } : t
      ),
    }))
  },

  // Mock data fetchers (replace with real API calls later)
  fetchJobs: async () => {
    await new Promise((r) => setTimeout(r, 500))
    set({ jobs: get().jobs })
  },
  fetchArtifacts: async () => {
    await new Promise((r) => setTimeout(r, 500))
    set({ artifacts: get().artifacts })
  },
  fetchProviders: async () => {
    await new Promise((r) => setTimeout(r, 500))
    set({
      providers: [
        { id: 'genx', name: 'GenX', status: 'active', capabilities: ['video.generate', 'image.generate', 'avatar.generate'], modelCount: 12, lastSynced: Date.now() - 3600000 },
        { id: 'together', name: 'Together AI', status: 'active', capabilities: ['image.generate', 'rag.ingest'], modelCount: 45, lastSynced: Date.now() - 7200000 },
        { id: 'groq', name: 'Groq', status: 'active', capabilities: ['text.chat', 'voice.tts', 'voice.stt'], modelCount: 8, lastSynced: Date.now() - 1800000 },
        { id: 'mimo', name: 'MiMo', status: 'experimental', capabilities: ['text.chat'], modelCount: 2 },
      ],
    })
  },
  fetchApps: async () => {
    await new Promise((r) => setTimeout(r, 500))
    set({ apps: get().apps })
  },
  fetchModels: async () => {
    await new Promise((r) => setTimeout(r, 500))
    set({
      models: [
        { id: 'm1', provider: 'groq', name: 'llama-3.3-70b-versatile', capability: 'text.chat', status: 'available' },
        { id: 'm2', provider: 'groq', name: 'whisper-large-v3', capability: 'voice.stt', status: 'available' },
        { id: 'm3', provider: 'groq', name: 'orpheus-v1-english', capability: 'voice.tts', status: 'available' },
        { id: 'm4', provider: 'together', name: 'FLUX.1-schnell-Free', capability: 'image.generate', status: 'available' },
        { id: 'm5', provider: 'together', name: 'm2-bert-80M-32k', capability: 'rag.ingest', status: 'available' },
        { id: 'm6', provider: 'genx', name: 'genx-video-v2', capability: 'video.generate', status: 'available' },
        { id: 'm7', provider: 'genx', name: 'genx-image-xl', capability: 'image.generate', status: 'available' },
      ],
    })
  },
  testProvider: async (providerId) => {
    await new Promise((r) => setTimeout(r, 1500))
    return Math.random() > 0.1
  },
  createApp: async (name) => {
    await new Promise((r) => setTimeout(r, 800))
    const app: AppConnection = {
      id: `app-${Date.now()}`, name, slug: name.toLowerCase().replace(/\s+/g, '-'),
      environment: 'dev', status: 'active',
      apiKey: `amk_${Math.random().toString(36).slice(2, 18)}`,
      webhookUrl: '', capabilities: [], tokenBalance: 1000, dailyBudget: 0,
    }
    set((s) => ({ apps: [...s.apps, app] }))
    return app
  },
  syncModels: async () => {
    await new Promise((r) => setTimeout(r, 2000))
    set((s) => ({
      providers: s.providers.map((p) => ({ ...p, lastSynced: Date.now() })),
    }))
  },
}))
