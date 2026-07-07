import {
  ProviderConfigError,
  getProviderCredentialStatus,
  resolveProviderApiKey,
  updateProviderHealthStatus,
  type ProviderCredentialStatus,
} from '@amarktai/db'
import { isValidProvider, type ProviderKey } from '@amarktai/core'

const GATED_PROVIDERS = new Set<ProviderKey>(['mimo', 'deepinfra'])

export interface ProviderLiveTestResult {
  provider: ProviderCredentialStatus
}

export async function testProviderCredential(providerKeyInput: string): Promise<ProviderLiveTestResult> {
  if (!isValidProvider(providerKeyInput)) {
    throw new ProviderConfigError(`Invalid provider key '${providerKeyInput}'`, providerKeyInput, 'invalid-provider')
  }

  const providerKey = providerKeyInput as ProviderKey
  let apiKey = ''

  try {
    const credential = await resolveProviderApiKey(providerKey)
    apiKey = credential.apiKey

    if (GATED_PROVIDERS.has(providerKey)) {
      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'gated',
        healthMessage: `${providerKey} live key testing is not implemented yet. Provider was not marked live.`,
      })
      return { provider }
    }

    if (providerKey === 'groq') {
      const { groqChat } = await import('@amarktai/providers')
      const result = await groqChat({
        apiKey,
        prompt: 'Reply with exactly: AMARKTAI_PROVIDER_TEST_OK',
        maxTokens: 16,
        temperature: 0,
      })

      if (!result.content?.trim()) {
        throw new Error('Groq returned an empty provider test response')
      }

      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'live',
        healthMessage: `Live test passed through Groq chat (${result.model}).`,
      })
      return { provider }
    }

    if (providerKey === 'together') {
      const providerStatus = await getProviderCredentialStatus('together')
      if (!providerStatus.defaultModel?.trim() && !process.env.TOGETHER_IMAGE_MODEL?.trim()) {
        const provider = await updateProviderHealthStatus({
          providerKey,
          healthStatus: 'failed',
          healthMessage: 'Together live test requires a provider defaultModel or TOGETHER_IMAGE_MODEL.',
        })
        return { provider }
      }

      const { togetherGenerateImage } = await import('@amarktai/providers')
      const result = await togetherGenerateImage({
        apiKey,
        providerDefaultModel: providerStatus.defaultModel,
        prompt: 'A tiny blue dot on a white background',
        width: 256,
        height: 256,
        steps: 1,
        n: 1,
      })

      if (!result.images[0]?.buffer?.length) {
        throw new Error('Together returned empty image data')
      }

      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'live',
        healthMessage: `Live test passed through Together image generation (${result.model}).`,
      })
      return { provider }
    }

    if (providerKey === 'genx') {
      const providerStatus = await getProviderCredentialStatus('genx')
      const { genxSubmitVideo } = await import('@amarktai/providers')
      const result = await genxSubmitVideo({
        prompt: 'A simple blue circle rotating slowly',
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        providerDefaultModel: providerStatus.defaultModel || undefined,
        duration: 2,
        aspectRatio: '1:1',
      })

      if (!result.jobId) {
        throw new Error('GenX did not return a job ID from test submission')
      }

      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'live',
        healthMessage: `Live test passed through GenX Router generate endpoint (job: ${result.jobId}).`,
      })
      return { provider }
    }

    const provider = await updateProviderHealthStatus({
      providerKey,
      healthStatus: 'gated',
      healthMessage: `${providerKey} live key testing is not implemented yet. Provider was not marked live.`,
    })
    return { provider }
  } catch (err) {
    if (err instanceof ProviderConfigError && err.code === 'invalid-provider') {
      throw err
    }

    const status = providerStatusForError(err)
    const provider = await updateProviderHealthStatus({
      providerKey,
      healthStatus: status,
      healthMessage: redactProviderSecrets(safeErrorMessage(err), [apiKey]),
    })
    return { provider }
  }
}

function providerStatusForError(err: unknown): 'unconfigured' | 'failed' | 'gated' {
  if (err instanceof ProviderConfigError && err.code === 'missing-config') return 'unconfigured'
  if (err instanceof ProviderConfigError && err.code === 'disabled') return 'gated'
  return 'failed'
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof ProviderConfigError) {
    if (err.code === 'missing-config') return err.message
    if (err.code === 'disabled') return err.message
    if (err.code === 'decrypt-failed') return err.message
  }

  if (err instanceof Error && err.message.trim()) return err.message
  return 'Provider live test failed'
}

export function redactProviderSecrets(message: string, extraSecrets: string[] = []): string {
  const secrets = [
    process.env.GROQ_API_KEY,
    process.env.TOGETHER_API_KEY,
    process.env.GENX_API_KEY,
    process.env.MIMO_API_KEY,
    process.env.DEEPINFRA_API_KEY,
    process.env.JWT_SECRET,
    process.env.PROVIDER_KEY_ENCRYPTION_SECRET,
    ...extraSecrets,
  ].filter((secret): secret is string => !!secret)

  let safe = message
  for (const secret of secrets) {
    safe = safe.split(secret).join('[redacted]')
  }

  return safe.replace(/v1:[A-Za-z0-9+/=:_-]+/g, 'v1:[redacted]')
}
