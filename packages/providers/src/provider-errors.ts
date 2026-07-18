export type ProviderErrorCode =
  | 'authentication'
  | 'insufficient_credit'
  | 'rate_limit'
  | 'invalid_request'
  | 'model_not_available'
  | 'unsupported_model'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'content_policy'
  | 'malformed_response'
  | 'artifact_validation'
  | 'cancelled_request'

export class CanonicalProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly provider: string
  readonly status: number | null
  readonly retryable: boolean

  constructor(input: {
    code: ProviderErrorCode
    provider: string
    message: string
    status?: number | null
    retryable?: boolean
    cause?: unknown
  }) {
    super(redactProviderErrorMessage(input.message), { cause: input.cause })
    this.name = 'CanonicalProviderError'
    this.code = input.code
    this.provider = input.provider
    this.status = input.status ?? null
    this.retryable = input.retryable ?? ['rate_limit', 'provider_timeout', 'provider_unavailable'].includes(input.code)
  }
}

export function providerHttpError(input: {
  provider: string
  status: number
  body: string
}): CanonicalProviderError {
  const body = redactProviderErrorMessage(input.body).slice(0, 1_000)
  const lower = body.toLowerCase()
  let code: ProviderErrorCode
  if (/model_not_available|non-serverless|non serverless|dedicated endpoint (?:is )?required|unable to access.+model/.test(lower)) code = 'model_not_available'
  else if (input.status === 401 || input.status === 403) code = 'authentication'
  else if (input.status === 402 || /insufficient|credit|balance|payment/.test(lower)) code = 'insufficient_credit'
  else if (input.status === 429) code = 'rate_limit'
  else if (input.status === 404 || /model.+not found|unsupported model/.test(lower)) code = 'unsupported_model'
  else if (/content|safety|policy|moderation/.test(lower) && input.status < 500) code = 'content_policy'
  else if (input.status >= 500) code = 'provider_unavailable'
  else code = 'invalid_request'
  return new CanonicalProviderError({
    code,
    provider: input.provider,
    status: input.status,
    message: `${input.provider} HTTP ${input.status}: ${body || '[empty response]'}`,
  })
}

export function normalizeProviderError(provider: string, error: unknown): CanonicalProviderError {
  if (error instanceof CanonicalProviderError) return error
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|cancelled/i.test(error.message))) {
    return new CanonicalProviderError({
      code: 'cancelled_request',
      provider,
      message: `${provider} request was cancelled`,
      cause: error,
    })
  }
  return new CanonicalProviderError({
    code: 'provider_unavailable',
    provider,
    message: error instanceof Error ? error.message : `${provider} request failed`,
    cause: error,
  })
}

export function redactProviderErrorMessage(message: string): string {
  let safe = message
  const secrets = [
    process.env.GROQ_API_KEY,
    process.env.TOGETHER_API_KEY,
    process.env.GENX_API_KEY,
    process.env.DEEPINFRA_API_KEY,
    process.env.MIMO_API_KEY,
    process.env.PROVIDER_KEY_ENCRYPTION_SECRET,
    process.env.JWT_SECRET,
  ].filter((secret): secret is string => Boolean(secret))
  for (const secret of secrets) safe = safe.split(secret).join('[redacted]')
  return safe
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|secret)["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi, '$1=[redacted]')
    .replace(/v1:[A-Za-z0-9+/=:_-]+/g, 'v1:[redacted]')
}
