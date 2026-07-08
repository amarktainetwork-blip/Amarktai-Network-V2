'use client'
import { create } from 'zustand'

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
    set((s) => ({ generating: { ...s.generating, [capability]: true } }))

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
      const res = await fetch('/api/admin/studio/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          capability,
          prompt: input.prompt || input.text || input.query || '',
          input,
          metadata: options,
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
