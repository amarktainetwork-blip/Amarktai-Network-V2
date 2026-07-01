/**
 * Canonical capability definitions — SINGLE SOURCE OF TRUTH.
 *
 * Every capability the platform supports is declared here exactly once.
 * All routing, validation, worker dispatch, and dashboard display
 * import from this module. No other file may duplicate these definitions.
 */

import { z } from 'zod'

// ── Capability Category Enum ──────────────────────────────────────────────────

export const CAPABILITY_CATEGORIES = [
  'text',
  'image',
  'audio',
  'video',
  'code',
  'multimodal',
  'system_ops',
] as const

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

// ── Canonical Capability Keys ─────────────────────────────────────────────────

export const CAPABILITY_KEYS = [
  'chat',
  'reasoning',
  'code',
  'image_generation',
  'image_edit',
  'tts',
  'stt',
  'video_generation',
  'music_generation',
  'avatar_generation',
  'embeddings',
  'reranking',
  'research',
  'multimodal',
  'tool_use',
  'structured_output',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

// ── Capability → Category Mapping (canonical) ─────────────────────────────────

export const CAPABILITY_CATEGORY_MAP: Record<CapabilityKey, CapabilityCategory> = {
  chat: 'text',
  reasoning: 'text',
  code: 'code',
  image_generation: 'image',
  image_edit: 'image',
  tts: 'audio',
  stt: 'audio',
  video_generation: 'video',
  music_generation: 'audio',
  avatar_generation: 'video',
  embeddings: 'text',
  reranking: 'text',
  research: 'text',
  multimodal: 'multimodal',
  tool_use: 'system_ops',
  structured_output: 'system_ops',
}

// ── Capability → Prefix Mapping (for job routing) ─────────────────────────────

export const CAPABILITY_PREFIX_MAP: Record<CapabilityKey, string> = {
  chat: 'text',
  reasoning: 'text',
  code: 'text',
  image_generation: 'image',
  image_edit: 'image',
  tts: 'voice',
  stt: 'voice',
  video_generation: 'video',
  music_generation: 'voice',
  avatar_generation: 'video',
  embeddings: 'text',
  reranking: 'text',
  research: 'text',
  multimodal: 'text',
  tool_use: 'text',
  structured_output: 'text',
}

// ── Capability Definition Schema ──────────────────────────────────────────────

export const CapabilityDefinitionSchema = z.object({
  key: z.enum(CAPABILITY_KEYS),
  label: z.string(),
  description: z.string().default(''),
  category: z.enum(CAPABILITY_CATEGORIES),
  enabled: z.boolean().default(true),
  requiredFlags: z.array(z.string()).default([]),
  allowedProviders: z.array(z.string()).default([]),
})

export type CapabilityDefinition = z.infer<typeof CapabilityDefinitionSchema>

// ── Built-in Capability Catalog ───────────────────────────────────────────────

export const CAPABILITY_CATALOG: CapabilityDefinition[] = CAPABILITY_KEYS.map((key) => ({
  key,
  label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  description: '',
  category: CAPABILITY_CATEGORY_MAP[key],
  enabled: true,
  requiredFlags: [],
  allowedProviders: [],
}))

// ── Validation helpers ────────────────────────────────────────────────────────

export function isValidCapability(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key)
}

export function getCapabilityCategory(key: CapabilityKey): CapabilityCategory {
  return CAPABILITY_CATEGORY_MAP[key]
}

export function getCapabilityPrefix(key: CapabilityKey): string {
  return CAPABILITY_PREFIX_MAP[key]
}
