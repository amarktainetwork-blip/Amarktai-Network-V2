'use client'
import { create } from 'zustand'

const PROVEN_CAPABILITIES = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation']

export const useStudioStore = create((set, get) => ({
  chatHistory: [],
  generating: {},
  lastJob: null,

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
    if (!PROVEN_CAPABILITIES.includes(capability)) {
      return { ok: false, error: `Capability "${capability}" is not proven yet` }
    }

    set((s) => ({ generating: { ...s.generating, [capability]: true } }))

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null
      const res = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          appSlug: 'dashboard-studio',
          capability,
          prompt: input.prompt || input.text || input.query || '',
          input,
          options,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        set((s) => ({ generating: { ...s.generating, [capability]: false } }))
        return { ok: false, error: data.message || 'Job submission failed' }
      }

      set((s) => ({
        generating: { ...s.generating, [capability]: false },
        lastJob: data,
      }))

      return { ok: true, jobId: data.jobId, status: data.status }
    } catch (err) {
      set((s) => ({ generating: { ...s.generating, [capability]: false } }))
      return { ok: false, error: err.message || 'Network error' }
    }
  },

  pollJob: async (jobId) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      return await res.json()
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
