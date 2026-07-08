'use client'
import { create } from 'zustand'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP, getBackendCapability } from './capability-map'

const CANONICAL_BACKEND_CAPABILITIES = new Set(
  Object.values(DASHBOARD_TO_BACKEND_CAPABILITY_MAP)
    .map((item) => item.backendCapability)
    .filter(Boolean)
)

function resolveStudioBackendCapability(capability) {
  if (CANONICAL_BACKEND_CAPABILITIES.has(capability)) return capability
  const mapped = getBackendCapability(capability)
  return mapped?.backendCapability || null
}

export const useStudioStore = create((set, get) => ({
  chatHistory: [],
  generating: {},
  lastJob: null,
  jobResults: {},

  uxMode: 'creator',
  setUxMode: (mode) => set({ uxMode: mode }),

  apps: [],

  addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

  submitDraft: (userMessage) => {
    if (!userMessage?.trim()) return
    set((s) => ({
      chatHistory: [...s.chatHistory, { role: 'user', content: userMessage, timestamp: Date.now() }],
    }))
  },

  submitJob: async (capability, input, options = {}) => {
    const backendCapability = resolveStudioBackendCapability(capability)
    if (!backendCapability) {
      return { ok: false, error: 'Capability is not mapped to a backend execution key' }
    }

    set((s) => ({ generating: { ...s.generating, [backendCapability]: true } }))

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
      const res = await fetch('/api/admin/studio/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          capability: backendCapability,
          prompt: input.prompt || input.text || input.query || '',
          input,
          metadata: options,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        set((s) => ({ generating: { ...s.generating, [backendCapability]: false } }))
        return { ok: false, error: data.message || 'Job submission failed' }
      }

      set((s) => ({
        generating: { ...s.generating, [backendCapability]: false },
        lastJob: data,
      }))

      return { ok: true, jobId: data.jobId, status: data.status }
    } catch (err) {
      set((s) => ({ generating: { ...s.generating, [backendCapability]: false } }))
      return { ok: false, error: err.message || 'Network error' }
    }
  },

  pollJob: async (jobId) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      set((s) => ({ jobResults: { ...s.jobResults, [jobId]: data } }))
      return data
    } catch {
      return null
    }
  },

  createWorkspace: async () => ({ ok: false, reason: 'backend_required' }),
  createApp: async () => ({ ok: false, reason: 'backend_required' }),
  fetchApps: async () => {},
  testProvider: async () => ({ ok: false, reason: 'backend_required' }),
  syncModels: async () => ({ ok: false, reason: 'backend_required' }),
}))
