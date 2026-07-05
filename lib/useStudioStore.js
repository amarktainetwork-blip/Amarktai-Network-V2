'use client'
import { create } from 'zustand'

const PROVIDER_STATE = [
  { id: 'genx', name: 'GenX', status: 'backend_pending', capabilities: ['video.generate', 'image.generate', 'avatar.generate', 'music.generate'], modelCount: 0, lastSynced: null },
  { id: 'groq', name: 'Groq', status: 'backend_pending', capabilities: ['text.chat', 'voice.tts', 'voice.stt'], modelCount: 0, lastSynced: null },
  { id: 'together', name: 'Together AI', status: 'backend_pending', capabilities: ['image.generate', 'image.edit', 'rag.ingest'], modelCount: 0, lastSynced: null },
  { id: 'mimo', name: 'MiMo', status: 'backend_pending', capabilities: ['text.reasoning', 'text.code'], modelCount: 0, lastSynced: null },
  { id: 'deepinfra', name: 'DeepInfra', status: 'gated_backend_pending', capabilities: ['uncensored.text'], modelCount: 0, lastSynced: null },
]

const MODEL_CONTRACTS = [
  { id: 'model-contract-groq', provider: 'groq', name: 'Backend catalog pending', capability: 'text.chat', status: 'backend_pending' },
  { id: 'model-contract-together', provider: 'together', name: 'Backend catalog pending', capability: 'image.generate', status: 'backend_pending' },
  { id: 'model-contract-genx', provider: 'genx', name: 'Backend catalog pending', capability: 'video.generate', status: 'backend_pending' },
  { id: 'model-contract-mimo', provider: 'mimo', name: 'Backend catalog pending', capability: 'text.reasoning', status: 'backend_pending' },
  { id: 'model-contract-deepinfra', provider: 'deepinfra', name: 'Gated catalog pending', capability: 'uncensored.text', status: 'gated_backend_pending' },
]

export const useStudioStore = create((set, get) => ({
  generatedAssets: [],
  timelineTracks: [
    { id: 'video', label: 'Video', color: 'cyan', clips: [] },
    { id: 'voice', label: 'Voice', color: 'violet', clips: [] },
    { id: 'music', label: 'Music', color: 'amber', clips: [] },
    { id: 'captions', label: 'Captions', color: 'emerald', clips: [] },
  ],
  chatHistory: [
    { role: 'assistant', content: 'Studio is in contract mode. Prompts can be drafted here, but provider execution is disabled until the Fastify /api/v1 backend is wired.', timestamp: Date.now() },
  ],
  generating: {},
  nodeStates: {},

  uxMode: 'creator',
  setUxMode: (mode) => set({ uxMode: mode }),

  jobs: [],
  artifacts: [],
  providers: [],
  apps: [],
  models: [],

  addAsset: () => null,
  addClipToTrack: () => null,
  addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),
  setGenerating: (key, value) => set((s) => ({ generating: { ...s.generating, [key]: value } })),
  setNodeState: (nodeId, state) => set((s) => ({ nodeStates: { ...s.nodeStates, [nodeId]: state } })),

  requestGeneration: async (capability) => {
    const key = capability.split('.')[0]
    set((s) => ({
      generating: { ...s.generating, [key]: false },
      nodeStates: { ...s.nodeStates, [key]: 'backend_pending' },
    }))
    return { ok: false, capability, reason: 'backend_pending' }
  },

  simulateChatResponse: (userMessage) => {
    const store = get()
    store.addChatMessage({ role: 'user', content: userMessage, timestamp: Date.now() })
    set((s) => ({ generating: { ...s.generating, chat: true } }))
    setTimeout(() => {
      get().addChatMessage({
        role: 'assistant',
        content: 'Backend integration pending. The dashboard will not fabricate a provider response until a real /api/v1 capability route is available.',
        timestamp: Date.now(),
      })
      set((s) => ({ generating: { ...s.generating, chat: false } }))
    }, 300)
  },

  dropAssetOnTimeline: () => null,

  createWorkspace: async (workspaceData) => {
    const { appName, environment, webhookUrl, agentName, coreDirectives, brandFiles } = workspaceData
    const slug = appName.toLowerCase().replace(/\s+/g, '-')
    const id = Date.now()

    const app = {
      id: `app-${id}`,
      appSlug: slug,
      appName,
      status: 'backend_pending',
      environment: environment || 'dev',
      webhookUrl: webhookUrl || '',
      tokenBalance: 0,
      apiKeys: [],
      createdAt: id,
    }

    const agent = {
      id: `agent-${id}`,
      name: agentName || `${appName} Agent`,
      description: coreDirectives || '',
      status: 'backend_pending',
      appSlug: slug,
      knowledge: 0,
      tasks: 0,
      avatar: 'AI',
      capabilities: ['text.chat', 'image.generate'],
      brandVault: brandFiles || [],
      crossAppAccess: false,
    }

    set((s) => ({ apps: [...s.apps, app] }))
    return { app, agent }
  },

  fetchJobs: async () => set({ jobs: get().jobs }),
  fetchArtifacts: async () => set({ artifacts: get().artifacts }),
  fetchProviders: async () => set({ providers: PROVIDER_STATE }),
  fetchApps: async () => set({ apps: get().apps }),
  fetchModels: async () => set({ models: MODEL_CONTRACTS }),
  testProvider: async () => ({ ok: false, reason: 'backend_integration_pending' }),
  createApp: async (name) => {
    const id = Date.now()
    const app = {
      id: `app-${id}`,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      environment: 'dev',
      status: 'backend_pending',
      apiKey: null,
      webhookUrl: '',
      capabilities: [],
      tokenBalance: 0,
      dailyBudget: 0,
    }
    set((s) => ({ apps: [...s.apps, app] }))
    return app
  },
  syncModels: async () => set({ models: MODEL_CONTRACTS }),
}))
