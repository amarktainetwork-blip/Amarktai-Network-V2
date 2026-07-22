import { describe, expect, it } from 'vitest'
import { getRuntimeModelPolicyBlocker, isRuntimeModelFamilyAllowed } from './model-family-policy.js'

describe('runtime model-family policy', () => {
  it.each([
    ['Qwen/Qwen3-TTS', 'removed_model_family_qwen'],
    ['provider/qwen-image-edit', 'removed_model_family_qwen'],
    ['XiaomiMiMo/MiMo-V2.5-tts', 'coding_only_model_family_mimo'],
    ['provider/mimo-coder', 'coding_only_model_family_mimo'],
  ] as const)('blocks %s with %s', (modelId, blocker) => {
    expect(getRuntimeModelPolicyBlocker(modelId)).toBe(blocker)
    expect(isRuntimeModelFamilyAllowed(modelId)).toBe(false)
  })

  it.each([
    'hexgrad/Kokoro-82M',
    'ResembleAI/chatterbox-turbo',
    'meta-llama/Llama-3.3-70B-Instruct',
    'black-forest-labs/FLUX.1-schnell',
  ])('allows approved provider-hosted model %s', (modelId) => {
    expect(getRuntimeModelPolicyBlocker(modelId)).toBeNull()
    expect(isRuntimeModelFamilyAllowed(modelId)).toBe(true)
  })
})
