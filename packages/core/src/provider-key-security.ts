/**
 * Provider credential encryption and masking helpers.
 *
 * These helpers are pure/server-side utilities. They do not touch the DB and
 * never log or return raw keys except from decryptProviderKey().
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENCRYPTED_PROVIDER_KEY_VERSION = 'v1'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

export function getProviderKeyEncryptionSecret(): string {
  const secret = process.env.PROVIDER_KEY_ENCRYPTION_SECRET ?? process.env.JWT_SECRET
  if (!secret) {
    throw new Error('PROVIDER_KEY_ENCRYPTION_SECRET environment variable is required')
  }
  return secret
}

export function encryptProviderKey(plainText: string, secret = getProviderKeyEncryptionSecret()): string {
  if (!plainText || !plainText.trim()) {
    throw new Error('Provider API key is required')
  }

  const iv = randomBytes(IV_BYTES)
  const key = deriveEncryptionKey(secret)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES })
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTED_PROVIDER_KEY_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptProviderKey(encryptedValue: string, secret = getProviderKeyEncryptionSecret()): string {
  const parts = encryptedValue.split(':')
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_PROVIDER_KEY_VERSION) {
    throw new Error('Unsupported provider key encryption format')
  }

  const [, ivEncoded, tagEncoded, ciphertextEncoded] = parts as [string, string, string, string]
  const key = deriveEncryptionKey(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'), {
    authTagLength: AUTH_TAG_BYTES,
  })
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskProviderKey(rawKey: string): string {
  if (!rawKey) return ''

  const prefix = rawKey.startsWith('gsk_')
    ? 'gsk_'
    : rawKey.startsWith('sk-')
      ? 'sk-'
      : ''
  const suffix = rawKey.length > prefix.length + 4 ? rawKey.slice(-4) : ''
  const masked = `${prefix}********${suffix}`

  return masked === rawKey ? '********' : masked
}

export function isEncryptedProviderKey(value: string): boolean {
  return value.startsWith(`${ENCRYPTED_PROVIDER_KEY_VERSION}:`)
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}
