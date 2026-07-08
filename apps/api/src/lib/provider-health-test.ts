import {
  ProviderConfigError,
  getProviderCredentialStatus,
  resolveProviderApiKey,
  updateProviderHealthStatus,
  type ProviderCredentialStatus,
} from '@amarktai/db'
import { getGenxBaseUrl, isValidProvider, type ProviderKey } from '@amarktai/core'

const GENX_MODELS_TEST_TIMEOUT_MS = 15_000
const GENX_VIDEO_MODEL_MARKERS = ['seedance', 'video', 'veo', 'wan', 'kling']
const MIMO_CODING_TOOLS_ONLY_MESSAGE = 'MiMo credential is configured but restricted to coding/interactive tools, so backend runtime is disabled until a backend/application-allowed MiMo key is supplied.'
const MIMO_REVIEW_REQUIRED_MESSAGE = 'MiMo credential usage policy requires admin review before backend runtime testing or execution.'

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
    if (providerKey === 'mimo') {
      return testMimoCredential()
    }

    const credential = await resolveProviderApiKey(providerKey)
    apiKey = credential.apiKey

    if (providerKey === 'deepinfra') {
      const providerStatus = await getProviderCredentialStatus('deepinfra')
      const { deepinfraChat } = await import('@amarktai/providers')
      const result = await deepinfraChat({
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
        providerDefaultModel: providerStatus.defaultModel,
        prompt: 'Reply with exactly: AMARKTAI_PROVIDER_TEST_OK',
        maxTokens: 16,
        temperature: 0,
      })

      if (!result.content?.trim()) {
        throw new Error('DeepInfra returned an empty provider test response')
      }

      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'live',
        healthMessage: `Live test passed through DeepInfra chat (${result.model}). Provider health is live; capability proof still requires completed jobs.`,
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
      const modelNames = await testGenxModelsEndpoint({
        apiKey,
        baseUrl: providerStatus.baseUrl || undefined,
      })
      const modelSummary = modelNames.slice(0, 3).join(', ')

      const provider = await updateProviderHealthStatus({
        providerKey,
        healthStatus: 'live',
        healthMessage: `GenX key validated against Router models endpoint. Video completion proof still required. Models seen: ${modelSummary}.`,
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

async function testMimoCredential(): Promise<ProviderLiveTestResult> {
  const providerStatus = await getProviderCredentialStatus('mimo')

  if (!providerStatus.configured) {
    const provider = await updateProviderHealthStatus({
      providerKey: 'mimo',
      healthStatus: 'unconfigured',
      healthMessage: 'MiMo credential is not configured.',
    })
    return { provider }
  }

  if (providerStatus.credentialUsagePolicy === 'coding_tools_only') {
    const provider = await updateProviderHealthStatus({
      providerKey: 'mimo',
      healthStatus: 'runtime_restricted',
      healthMessage: MIMO_CODING_TOOLS_ONLY_MESSAGE,
    })
    return { provider }
  }

  if (providerStatus.credentialUsagePolicy === 'unknown_requires_review') {
    const provider = await updateProviderHealthStatus({
      providerKey: 'mimo',
      healthStatus: 'requires_review',
      healthMessage: MIMO_REVIEW_REQUIRED_MESSAGE,
    })
    return { provider }
  }

  let apiKey = ''
  try {
    const credential = await resolveProviderApiKey('mimo')
    apiKey = credential.apiKey
    const { mimoChat } = await import('@amarktai/providers')
    const result = await mimoChat({
      apiKey,
      baseUrl: providerStatus.baseUrl || undefined,
      providerDefaultModel: providerStatus.defaultModel,
      prompt: 'Reply with exactly: AMARKTAI_PROVIDER_TEST_OK',
      maxTokens: 16,
      temperature: 0,
    })

    if (!result.content?.trim()) {
      throw new Error('MiMo returned an empty provider test response')
    }

    const provider = await updateProviderHealthStatus({
      providerKey: 'mimo',
      healthStatus: 'live',
      healthMessage: `Live test passed through MiMo chat (${result.model}) with backend_runtime_allowed credential policy.`,
    })
    return { provider }
  } catch (err) {
    const status = providerStatusForError(err)
    const provider = await updateProviderHealthStatus({
      providerKey: 'mimo',
      healthStatus: status,
      healthMessage: redactProviderSecrets(safeErrorMessage(err), [apiKey]),
    })
    return { provider }
  }
}

function providerStatusForError(err: unknown): 'unconfigured' | 'failed' | 'gated' {
  if (err instanceof ProviderConfigError && err.code === 'missing-config') return 'unconfigured'
  if (err instanceof ProviderConfigError && err.code === 'disabled') return 'gated'
  if (err instanceof ProviderConfigError && err.code === 'runtime-restricted') return 'gated'
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

interface GenxModelsTestInput {
  apiKey: string
  baseUrl?: string
}

export async function testGenxModelsEndpoint(input: GenxModelsTestInput): Promise<string[]> {
  const baseUrl = input.baseUrl?.trim() || getGenxBaseUrl()
  const url = new URL('/api/v1/models', baseUrl)
  url.searchParams.set('category', 'video')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GENX_MODELS_TEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    const body = await response.text()
    if (!response.ok) {
      throw new Error(`GenX models endpoint HTTP ${response.status}: ${shortSafeBody(body)}`)
    }

    let data: unknown
    try {
      data = body ? JSON.parse(body) : null
    } catch {
      throw new Error(`GenX models endpoint returned unreadable JSON: ${shortSafeBody(body)}`)
    }

    const modelNames = extractModelNames(data)
    if (!modelNames.length) {
      throw new Error('GenX models endpoint returned no parseable video models')
    }

    const hasExpectedVideoModel = modelNames.some((modelName) => {
      const lower = modelName.toLowerCase()
      return GENX_VIDEO_MODEL_MARKERS.some((marker) => lower.includes(marker))
    })

    if (!hasExpectedVideoModel) {
      throw new Error(`GenX models endpoint returned no expected video model names: ${modelNames.slice(0, 5).join(', ')}`)
    }

    return modelNames
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error('GenX provider test timed out after 15s')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function extractModelNames(data: unknown): string[] {
  const candidates = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.models)
      ? data.models
      : isRecord(data) && Array.isArray(data.data)
        ? data.data
        : []

  return candidates
    .map((candidate) => {
      if (typeof candidate === 'string') return candidate
      if (!isRecord(candidate)) return ''
      const name = candidate.id ?? candidate.model ?? candidate.name ?? candidate.slug
      return typeof name === 'string' ? name : ''
    })
    .filter((modelName): modelName is string => !!modelName.trim())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
}

function shortSafeBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  return collapsed.slice(0, 500) || '[empty body]'
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
