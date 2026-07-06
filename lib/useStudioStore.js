'use client'
import { create } from 'zustand'

export const useStudioStore = create((set, get) => ({
  chatHistory: [],
  generating: {},

  uxMode: 'creator',
  setUxMode: (mode) => set({ uxMode: mode }),

  apps: [],

  addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

  // Submit draft only - does not simulate backend response
  submitDraft: (userMessage) => {
    if (!userMessage?.trim()) return
    set((s) => ({
      chatHistory: [...s.chatHistory, { role: 'user', content: userMessage, timestamp: Date.now() }],
    }))
  },

  createWorkspace: async () => ({ ok: false, reason: 'backend_required' }),
  createApp: async () => ({ ok: false, reason: 'backend_required' }),
  fetchApps: async () => {},
  testProvider: async () => ({ ok: false, reason: 'backend_required' }),
  syncModels: async () => ({ ok: false, reason: 'backend_required' }),
}))
