import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepinfraEditImage } from './deepinfra-image-client.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deepinfraEditImage', () => {
  it('uses the governed multipart image-edits endpoint and validates image bytes', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.deepinfra.com/v1/images/edits')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret', Accept: 'application/json' })
      expect(init?.body).toBeInstanceOf(FormData)
      const form = init?.body as FormData
      expect(form.get('model')).toBe('provider/image-edit-model')
      expect(form.get('prompt')).toBe('Replace the background')
      expect(form.get('response_format')).toBe('b64_json')
      expect(form.get('image')).toBeInstanceOf(Blob)
      expect(form.get('mask')).toBeInstanceOf(Blob)
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG.toString('base64'), revised_prompt: 'Replace the background cleanly' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await deepinfraEditImage({
      apiKey: 'secret',
      model: 'provider/image-edit-model',
      imageBuffer: PNG,
      imageMimeType: 'image/png',
      maskBuffer: PNG,
      maskMimeType: 'image/png',
      prompt: 'Replace the background',
      size: '1024x1024',
    })

    expect(result).toMatchObject({
      mimeType: 'image/png',
      model: 'provider/image-edit-model',
      revisedPrompt: 'Replace the background cleanly',
    })
    expect(result.imageBuffer.equals(PNG)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects provider responses without supported image signatures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('not-an-image').toString('base64') }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(deepinfraEditImage({
      apiKey: 'secret',
      model: 'provider/image-edit-model',
      imageBuffer: PNG,
      imageMimeType: 'image/png',
      prompt: 'Edit this image',
    })).rejects.toMatchObject({ code: 'malformed_response', provider: 'deepinfra' })
  })
})
