import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveTogetherImageModel,
  togetherGenerateImage,
} from '../packages/providers/src/index.ts'
import { TOGETHER_DEFAULT_IMAGE_MODEL } from '../packages/core/src/index.ts'

const ORIGINAL_ENV = process.env

function makeTogetherResponse(model = 'test-serverless-image-model') {
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)
  png.write('IHDR', 12, 4, 'ascii')
  png.writeUInt32BE(64, 16)
  png.writeUInt32BE(32, 20)
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model,
      data: [{ b64_json: png.toString('base64') }],
      usage: { prompt_tokens: 2, completion_tokens: 0, total_tokens: 2 },
    }),
  }
}

describe('Together image model resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      TOGETHER_API_KEY: 'together-test-key',
    }
    delete process.env.TOGETHER_IMAGE_MODEL
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  it('uses an explicit request model first', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeTogetherResponse('explicit-image-model'))

    const result = await togetherGenerateImage({
      prompt: 'blue circle',
      apiKey: 'explicit-key',
      model: 'explicit-image-model',
      providerDefaultModel: 'db-image-model',
      n: 1,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('explicit-image-model')
    expect(result.model).toBe('explicit-image-model')
    expect(result.images[0]).toMatchObject({ width: 64, height: 32, mimeType: 'image/png' })
  })

  it('uses the DB provider default model before env fallback', () => {
    process.env.TOGETHER_IMAGE_MODEL = 'env-image-model'

    expect(resolveTogetherImageModel({
      providerDefaultModel: 'db-image-model',
    })).toBe('db-image-model')
  })

  it('uses TOGETHER_IMAGE_MODEL when no explicit or DB model exists', () => {
    process.env.TOGETHER_IMAGE_MODEL = 'env-image-model'

    expect(resolveTogetherImageModel()).toBe('env-image-model')
  })

  it('does not force the unavailable free Flux model as a default', () => {
    expect(TOGETHER_DEFAULT_IMAGE_MODEL).not.toBe('black-forest-labs/FLUX.1-schnell-Free')
    expect(() => resolveTogetherImageModel()).toThrow('Together image model is not configured')
  })

  it('preserves Together provider errors without leaking the API key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"model_not_available","message":"Unable to access non-serverless model"}',
    })

    await expect(togetherGenerateImage({
      prompt: 'blue circle',
      apiKey: 'super-secret-together-key',
      model: 'unavailable-image-model',
      n: 1,
    })).rejects.toThrow('model_not_available')

    try {
      await togetherGenerateImage({
        prompt: 'blue circle',
        apiKey: 'super-secret-together-key',
        model: 'unavailable-image-model',
        n: 1,
      })
    } catch (err) {
      expect(err.message).toContain('model_not_available')
      expect(err.message).not.toContain('super-secret-together-key')
    }
  })
})
