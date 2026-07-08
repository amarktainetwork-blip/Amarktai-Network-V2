import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deepinfraChat,
  resolveDeepInfraChatModel,
} from '../packages/providers/src/index.ts'

describe('DeepInfra provider client and MiMo runtime export guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DEEPINFRA_CHAT_MODEL
  })

  it('DeepInfra chat calls the OpenAI-compatible chat endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepinfra-db-model',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await deepinfraChat({
      apiKey: 'deepinfra-secret-key',
      providerDefaultModel: 'deepinfra-db-model',
      prompt: 'test',
    })

    expect(result).toMatchObject({ content: 'ok', model: 'deepinfra-db-model' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepinfra.com/v1/openai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer deepinfra-secret-key',
        }),
      }),
    )
  })

  it('resolves DeepInfra models from request, DB default, env, then safe code default', () => {
    process.env.DEEPINFRA_CHAT_MODEL = 'deepinfra-env-model'

    expect(resolveDeepInfraChatModel({ requestModel: 'request-model' })).toBe('request-model')
    expect(resolveDeepInfraChatModel({ providerDefaultModel: 'db-model' })).toBe('db-model')
    expect(resolveDeepInfraChatModel()).toBe('deepinfra-env-model')
  })

  it('does not export a callable MiMo runtime client from the provider package', async () => {
    const providers = await import('../packages/providers/src/index.ts')
    expect(providers.mimoChat).toBeUndefined()
    expect(providers.resolveMimoChatModel).toBeUndefined()
  })
})
