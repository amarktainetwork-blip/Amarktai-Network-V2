import { createHmac, timingSafeEqual } from 'node:crypto'

export function createProviderMediaUrl(input: {
  artifactId: string
  publicApiUrl: string
  secret: string
  expiresAt?: number
}): string {
  if (!input.artifactId || !input.secret || !input.publicApiUrl) throw new Error('Provider media URL configuration is incomplete')
  const expires = input.expiresAt ?? Math.floor(Date.now() / 1000) + 30 * 60
  const signature = sign(input.artifactId, expires, input.secret)
  const base = input.publicApiUrl.replace(/\/+$/, '')
  return `${base}/api/v1/provider-media/${encodeURIComponent(input.artifactId)}?expires=${expires}&signature=${signature}`
}

export function verifyProviderMediaToken(input: {
  artifactId: string
  expires: number
  signature: string
  secret: string
  now?: number
}): boolean {
  if (!input.artifactId || !input.secret || !Number.isInteger(input.expires) || !input.signature) return false
  if (input.expires < (input.now ?? Math.floor(Date.now() / 1000))) return false
  const expected = Buffer.from(sign(input.artifactId, input.expires, input.secret), 'hex')
  const actual = Buffer.from(input.signature, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sign(artifactId: string, expires: number, secret: string): string {
  return createHmac('sha256', secret).update(`${artifactId}.${expires}`).digest('hex')
}
