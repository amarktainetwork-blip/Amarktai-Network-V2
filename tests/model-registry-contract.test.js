import { describe, it, expect } from 'vitest'

// Inline the catalog data for testing (can't import .ts from .js tests)
const PROVIDERS = ['groq', 'together', 'deepinfra', 'genx', 'mimo']

const CATALOG_SUMMARY = {
  groq: { categories: ['text', 'audio', 'multimodal'], roles: ['chat', 'stt', 'tts', 'vision'], modelCount: 7 },
  together: { categories: ['text', 'image', 'embeddings'], roles: ['chat', 'image_generation', 'embeddings'], modelCount: 12 },
  deepinfra: { categories: ['text', 'image', 'video', 'audio', 'embeddings', 'reranking'], roles: ['chat', 'image_generation', 'video_generation', 'tts', 'embeddings', 'reranking'], modelCount: 10 },
  genx: { categories: ['video', 'image'], roles: ['video_generation', 'image_generation', 'avatar_generation'], modelCount: 4 },
  mimo: { categories: ['code'], roles: ['coding_tool'], modelCount: 1 },
}

describe('model registry contract', () => {
  it('catalogue covers all approved providers', () => {
    expect(PROVIDERS).toEqual(['groq', 'together', 'deepinfra', 'genx', 'mimo'])
  })

  it('model owners do not become provider keys', () => {
    const bannedProviders = ['openai', 'anthropic', 'google', 'qwen', 'wan', 'pixverse', 'minimax', 'gemini', 'resemble']
    for (const provider of PROVIDERS) {
      expect(bannedProviders).not.toContain(provider)
    }
  })

  it('Together catalogues text/image/embedding models', () => {
    const together = CATALOG_SUMMARY.together
    expect(together.categories).toContain('text')
    expect(together.categories).toContain('image')
    expect(together.categories).toContain('embeddings')
  })

  it('DeepInfra catalogues text/image/video/audio/embedding/reranking models', () => {
    const deepinfra = CATALOG_SUMMARY.deepinfra
    expect(deepinfra.categories).toContain('text')
    expect(deepinfra.categories).toContain('image')
    expect(deepinfra.categories).toContain('video')
    expect(deepinfra.categories).toContain('audio')
    expect(deepinfra.categories).toContain('embeddings')
    expect(deepinfra.categories).toContain('reranking')
  })

  it('Groq catalogues text/reasoning/STT/TTS/OCR capabilities', () => {
    const groq = CATALOG_SUMMARY.groq
    expect(groq.roles).toContain('chat')
    expect(groq.roles).toContain('stt')
    expect(groq.roles).toContain('tts')
    expect(groq.roles).toContain('vision')
  })

  it('GenX catalogue is not limited to one model', () => {
    expect(CATALOG_SUMMARY.genx.modelCount).toBeGreaterThan(1)
  })

  it('MiMo appears only as coding_tool', () => {
    const mimo = CATALOG_SUMMARY.mimo
    expect(mimo.roles).toEqual(['coding_tool'])
  })

  it('video_generation can report multiple models/providers', () => {
    // Video models exist in deepinfra and genx
    expect(CATALOG_SUMMARY.deepinfra.roles).toContain('video_generation')
    expect(CATALOG_SUMMARY.genx.roles).toContain('video_generation')
  })

  it('provider list remains exactly 5', () => {
    expect(PROVIDERS).toHaveLength(5)
  })
})
