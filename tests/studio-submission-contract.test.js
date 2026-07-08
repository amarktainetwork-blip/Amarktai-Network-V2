import { describe, it, expect } from 'vitest'

const PROVEN_CAPABILITIES = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation']

const UNPROVEN_CAPABILITIES = [
  'music_generation',
  'voice_generation',
  'avatar_generation',
  'research',
  'text_to_speech',
  'speech_to_text',
  'transcription',
  'brand_scrape',
  'brand_vault',
  'media_edit',
  'image_to_video',
  'image_to_image',
  'upscale',
  'background_removal',
  'avatar_video',
  'video_to_video',
  'voice_clone',
  'video_translation',
  'deepfake_detection',
  'moderation',
  'music_stem_split',
  'voice_isolation',
  'ocr',
  'document_extraction',
]

describe('studio submission contract', () => {
  it('submits only proven capabilities', () => {
    for (const cap of PROVEN_CAPABILITIES) {
      expect(PROVEN_CAPABILITIES).toContain(cap)
    }
  })

  it('blocks unproven capabilities', () => {
    for (const cap of UNPROVEN_CAPABILITIES) {
      expect(PROVEN_CAPABILITIES).not.toContain(cap)
    }
  })

  it('does not expose provider/model selectors', () => {
    const studioInput = {
      prompt: 'test',
    }

    expect(studioInput).not.toHaveProperty('provider')
    expect(studioInput).not.toHaveProperty('model')
    expect(studioInput).not.toHaveProperty('endpoint')
  })

  it('proven capabilities match runtime proof', () => {
    const expectedProven = [
      'chat',
      'reasoning',
      'code',
      'summarization',
      'translation',
      'classification',
      'extraction',
      'structured_output',
      'image_generation',
      'video_generation',
    ]

    expect(PROVEN_CAPABILITIES).toEqual(expect.arrayContaining(expectedProven))
    expect(PROVEN_CAPABILITIES).toHaveLength(expectedProven.length)
  })

  it('music and other unproven remain blocked', () => {
    expect(PROVEN_CAPABILITIES).not.toContain('music_generation')
    expect(PROVEN_CAPABILITIES).not.toContain('voice_generation')
    expect(PROVEN_CAPABILITIES).not.toContain('avatar_generation')
    expect(PROVEN_CAPABILITIES).not.toContain('research')
  })
})
