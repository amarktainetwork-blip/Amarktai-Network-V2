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

// ─── Store ─────────────────────────────────────────────────────
interface StudioState {
  generatedAssets: GeneratedAsset[]
  timelineTracks: TimelineTrack[]
  chatHistory: ChatMessage[]
  generating: Record<string, boolean>
  nodeStates: Record<string, 'idle' | 'processing' | 'complete'>

  addAsset: (asset: GeneratedAsset) => void
  addClipToTrack: (trackId: string, clip: TimelineClip) => void
  addChatMessage: (msg: ChatMessage) => void
  simulateGeneration: (capability: string, meta?: { title?: string }) => Promise<GeneratedAsset>
  simulateChatResponse: (userMessage: string) => void
  setGenerating: (key: string, value: boolean) => void
  setNodeState: (nodeId: string, state: 'idle' | 'processing' | 'complete') => void
  dropAssetOnTimeline: (asset: GeneratedAsset, trackId: string) => void
}

export const useStudioStore = create<StudioState>((set, get) => ({
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

  addAsset: (asset) => set((s) => ({ generatedAssets: [...s.generatedAssets, asset] })),

  addClipToTrack: (trackId, clip) => set((s) => ({
    timelineTracks: s.timelineTracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
    ),
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
    const template = ASSET_TEMPLATES[capability] || ASSET_TEMPLATES['text.chat']
    const asset: GeneratedAsset = {
      id: `asset-${Date.now()}-${assetCounter}`,
      type: template.type,
      name: meta?.title || `${capability} output #${assetCounter}`,
      url: '',
      mime: template.mime,
      size: `${(Math.random() * 5 + 0.5).toFixed(1)} MB`,
      gradient: template.gradient,
      capability,
      createdAt: Date.now(),
    }

    const state = get()
    // Auto-add to appropriate timeline track
    const trackMap: Record<string, string> = { video: 'video', voice: 'voice', music: 'music', avatar: 'video', image: 'video', longvideo: 'video' }
    const targetTrack = trackMap[key] || 'video'
    const track = state.timelineTracks.find((t) => t.id === targetTrack)
    const lastEnd = track && track.clips.length > 0 ? Math.max(...track.clips.map((c) => c.start + c.width)) : 0

    set((s) => ({
      generatedAssets: [...s.generatedAssets, asset],
      generating: { ...s.generating, [key]: false },
      nodeStates: { ...s.nodeStates, [key]: 'complete' },
      timelineTracks: s.timelineTracks.map((t) =>
        t.id === targetTrack
          ? { ...t, clips: [...t.clips, { id: `clip-${Date.now()}`, start: lastEnd + 2, width: 20, label: asset.name, assetId: asset.id }] }
          : t
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
        t.id === trackId
          ? { ...t, clips: [...t.clips, { id: `clip-${Date.now()}`, start: lastEnd + 2, width: 20, label: asset.name, assetId: asset.id }] }
          : t
      ),
    }))
  },
}))
