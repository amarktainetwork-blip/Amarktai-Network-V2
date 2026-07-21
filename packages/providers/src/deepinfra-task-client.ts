import { DEEPINFRA_BASE_URL } from '@amarktai/core'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface DeepInfraTaskRequest {
  apiKey: string
  model: string
  input: Record<string, unknown>
  baseUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export async function deepinfraTaskInference(request: DeepInfraTaskRequest): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('provider timeout'))
  }, request.timeoutMs ?? 60_000)
  const cancel = () => controller.abort(request.signal?.reason)
  request.signal?.addEventListener('abort', cancel, { once: true })
  try {
    const baseUrl = (request.baseUrl?.trim() || DEEPINFRA_BASE_URL).replace(/\/openai\/?$/, '').replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/inference/${request.model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request.input),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) throw providerHttpError({ provider: 'deepinfra', status: response.status, body })
    try {
      return body ? JSON.parse(body) : null
    } catch (error) {
      throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra task endpoint returned unreadable JSON', cause: error })
    }
  } catch (error) {
    if (timedOut) {
      throw new CanonicalProviderError({ code: 'provider_timeout', provider: 'deepinfra', message: 'DeepInfra task request timed out', cause: error })
    }
    throw normalizeProviderError('deepinfra', error)
  } finally {
    clearTimeout(timeout)
    request.signal?.removeEventListener('abort', cancel)
  }
}
