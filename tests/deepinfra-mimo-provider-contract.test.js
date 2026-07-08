import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deepinfraChat,
  mimoChat,
  resolveDeepInfraChatModel,
  resolveMimoChatModel,
} from '../packages/providers/src/index.ts'

describe('DeepInfra and MiMo OpenAI-compatible provider clients', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DEEPINFRA_CHAT_MODEL
    delete process.env.MIMO_CHAT_MODEL
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

  it('MiMo chat calls its OpenAI-compatible endpoint when policy allows callers to use it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'mimo-v2.5',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await mimoChat({
      apiKey: 'mimo-secret-key',
      providerDefaultModel: 'mimo-v2.5',
      prompt: 'test',
    })

    expect(result).toMatchObject({ content: 'ok', model: 'mimo-v2.5' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer mimo-secret-key',
        }),
      }),
    )
  })

  it('resolves models from request, DB default, env, then safe code default', () => {
    process.env.DEEPINFRA_CHAT_MODEL = 'deepinfra-env-model'
    process.env.MIMO_CHAT_MODEL = 'mimo-env-model'

    expect(resolveDeepInfraChatModel({ requestModel: 'request-model' })).toBe('request-model')
    expect(resolveDeepInfraChatModel({ providerDefaultModel: 'db-model' })).toBe('db-model')
    expect(resolveDeepInfraChatModel()).toBe('deepinfra-env-model')

    expect(resolveMimoChatModel({ requestModel: 'request-model' })).toBe('request-model')
    expect(resolveMimoChatModel({ providerDefaultModel: 'db-model' })).toBe('db-model')
    expect(resolveMimoChatModel()).toBe('mimo-env-model')
  })
})
