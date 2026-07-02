import { create } from 'zustand'

const MOCK_ASSET_TEMPLATES = {
  'text.chat': { type: 'document', mime: 'text/markdown', gradient: 'from-sky-500/20 to-indigo-500/20', icon: 'document' },
  'image.generate': { type: 'image', mime: 'image/png', gradient: 'from-cyan-500/20 to-violet-500/20', icon: 'image' },
  'image.edit': { type: 'image', mime: 'image/png', gradient: 'from-pink-500/20 to-orange-500/20', icon: 'image' },
  'video.generate': { type: 'video', mime: 'video/mp4', gradient: 'from-emerald-500/20 to-cyan-500/20', icon: 'video' },
  'video.longform': { type: 'video', mime: 'video/mp4', gradient: 'from-indigo-500/20 to-purple-500/20', icon: 'video' },
  'music.generate': { type: 'audio', mime: 'audio/wav', gradient: 'from-violet-500/20 to-fuchsia-500/20', icon: 'audio' },
  'voice.tts': { type: 'audio', mime: 'audio/wav', gradient: 'from-teal-500/20 to-emerald-500/20', icon: 'audio' },
  'voice.stt': { type: 'document', mime: 'text/plain', gradient: 'from-amber-500/20 to-rose-500/20', icon: 'document' },
  'avatar.generate': { type: 'video', mime: 'video/mp4', gradient: 'from-fuchsia-500/20 to-pink-500/20', icon: 'video' },
  'scrape.crawl': { type: 'document', mime: 'application/json', gradient: 'from-lime-500/20 to-green-500/20', icon: 'document' },
  'rag.ingest': { type: 'document', mime: 'application/json', gradient: 'from-sky-500/20 to-cyan-500/20', icon: 'document' },
}

let assetCounter = 0

export const useStudioStore = create((set, get) => ({
  // Generated assets (shared across sidebar, timeline, proof runner)
  generatedAssets: [],

  // Chat history for Director panel
  chatHistory: [
    { role: 'assistant', content: 'Welcome to the Studio Director. I can help you plan and execute multi-step creative workflows.\n\nDescribe what you want to create and I\'ll build an execution plan.' }
  ],

  // Timeline tracks
  timelineTracks: [
    { id: 'video', label: 'Video', color: 'cyan', clips: [] },
    { id: 'voice', label: 'Voice', color: 'violet', clips: [] },
    { id: 'music', label: 'Music', color: 'amber', clips: [] },
    { id: 'captions', label: 'Captions', color: 'emerald', clips: [] },
  ],

  // Generation states per tab
  generating: {},

  // Node canvas states
  nodeStates: {
    chat: 'idle', image: 'idle', video: 'idle', longvideo: 'idle',
    music: 'idle', voice: 'idle', avatar: 'idle', scrape: 'idle', rag: 'idle',
  },

  // Chat: add user message
  addChatMessage: (role, content) => set((s) => ({
    chatHistory: [...s.chatHistory, { role, content, timestamp: Date.now() }],
  })),

  // Chat: simulate AI response
  simulateChatResponse: (userMessage) => {
    const store = get()
    store.addChatMessage('user', userMessage)
    set({ generating: { ...get().generating, chat: true } })

    setTimeout(() => {
      const responses = [
        `I'll help you with that. Let me analyze your request and create an execution plan.\n\n**Step 1:** Analyze input requirements\n**Step 2:** Select optimal providers\n**Step 3:** Execute pipeline\n\nReady to proceed?`,
        `Great idea! Here's my approach:\n\n1. **Content Analysis** — Breaking down your creative brief\n2. **Asset Generation** — Using the best available providers\n3. **Quality Review** — Ensuring output meets standards\n\nShall I begin?`,
        `I've drafted a multi-step workflow for this:\n\n- **Phase 1:** Research & reference gathering\n- **Phase 2:** Core content generation\n- **Phase 3:** Polish & export\n\nWant me to execute this pipeline?`,
      ]
      const response = responses[Math.floor(Math.random() * responses.length)]
      store.addChatMessage('assistant', response)
      set({ generating: { ...get().generating, chat: false } })
    }, 1500)
  },

  // Generate asset (simulated)
  simulateGeneration: (type, meta = {}) => {
    const key = type.split('.')[0]
    set({ generating: { ...get().generating, [key]: true }, nodeStates: { ...get().nodeStates, [key]: 'processing' } })

    return new Promise((resolve) => {
      setTimeout(() => {
        assetCounter++
        const template = MOCK_ASSET_TEMPLATES[type] || MOCK_ASSET_TEMPLATES['text.chat']
        const asset = {
          id: `asset-${Date.now()}-${assetCounter}`,
          type: template.type,
          mime: template.mime,
          gradient: template.gradient,
          icon: template.icon,
          title: meta.title || `${type} output #${assetCounter}`,
          size: `${(Math.random() * 5 + 0.5).toFixed(1)} MB`,
          capability: type,
          createdAt: Date.now(),
        }

        const store = get()
        set({
          generatedAssets: [...store.generatedAssets, asset],
          generating: { ...store.generating, [key]: false },
          nodeStates: { ...store.nodeStates, [key]: 'complete' },
        })

        // Auto-add to timeline
        if (template.type === 'video') {
          const trackIdx = store.timelineTracks.findIndex((t) => t.id === 'video')
          if (trackIdx >= 0) {
            const tracks = [...store.timelineTracks]
            const lastClip = tracks[trackIdx].clipstart || 0
            const lastEnd = tracks[trackIdx].clips.length > 0
              ? Math.max(...tracks[trackIdx].clips.map((c) => c.start + c.width))
              : 0
            tracks[trackIdx] = {
              ...tracks[trackIdx],
              clips: [...tracks[trackIdx].clips, { start: lastEnd + 2, width: 25, label: asset.title, assetId: asset.id }],
            }
            set({ timelineTracks: tracks })
          }
        } else if (template.type === 'audio') {
          const trackId = type.includes('voice') ? 'voice' : 'music'
          const trackIdx = store.timelineTracks.findIndex((t) => t.id === trackId)
          if (trackIdx >= 0) {
            const tracks = [...store.timelineTracks]
            const lastEnd = tracks[trackIdx].clips.length > 0
              ? Math.max(...tracks[trackIdx].clips.map((c) => c.start + c.width))
              : 0
            tracks[trackIdx] = {
              ...tracks[trackIdx],
              clips: [...tracks[trackIdx].clips, { start: lastEnd + 2, width: 20, label: asset.title, assetId: asset.id }],
            }
            set({ timelineTracks: tracks })
          }
        }

        resolve(asset)
      }, 2000)
    })
  },

  // Drop asset onto timeline
  dropAssetOnTimeline: (asset, trackId) => {
    const store = get()
    const trackIdx = store.timelineTracks.findIndex((t) => t.id === trackId)
    if (trackIdx < 0) return

    const tracks = [...store.timelineTracks]
    const lastEnd = tracks[trackIdx].clips.length > 0
      ? Math.max(...tracks[trackIdx].clips.map((c) => c.start + c.width))
      : 0
    tracks[trackIdx] = {
      ...tracks[trackIdx],
      clips: [...tracks[trackIdx].clips, { start: lastEnd + 2, width: 20, label: asset.title, assetId: asset.id }],
    }
    set({ timelineTracks: tracks })
  },

  // Reset node state
  resetNodeState: (nodeId) => set((s) => ({
    nodeStates: { ...s.nodeStates, [nodeId]: 'idle' },
  })),
}))
