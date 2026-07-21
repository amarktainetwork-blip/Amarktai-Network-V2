import { z } from 'zod'
import type { ArtifactType } from './artifacts.js'
import type { CapabilityKey } from './capabilities.js'

export const VOICE_AVATAR_EVIDENCE_PURPOSES = [
  'voice_source_audio',
  'voice_identity_verification',
  'voice_consent',
  'voice_recording_consent',
  'voice_preview',
  'avatar_portrait',
  'avatar_identity_verification',
  'avatar_consent',
  'avatar_creation_evidence',
  'avatar_preview',
] as const

export type VoiceAvatarEvidencePurpose = (typeof VOICE_AVATAR_EVIDENCE_PURPOSES)[number]

export const VoiceAvatarEvidencePurposeSchema = z.enum(VOICE_AVATAR_EVIDENCE_PURPOSES)

export type VoiceAvatarEvidenceConfig = {
  capability: Extract<CapabilityKey, 'voice_clone' | 'avatar_generation'>
  artifactType: Extract<ArtifactType, 'audio' | 'image' | 'video' | 'document'>
  subType: string
  maxBytes: number
  allowedMimeTypes: readonly string[]
}

const MiB = 1024 * 1024
const AUDIO_MIMES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'] as const
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const
const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const
const IDENTITY_MIMES = [...IMAGE_MIMES, 'application/pdf', ...VIDEO_MIMES] as const
const CONSENT_MIMES = ['application/pdf', ...AUDIO_MIMES, ...VIDEO_MIMES] as const

export const VOICE_AVATAR_EVIDENCE_CONFIG: Record<VoiceAvatarEvidencePurpose, VoiceAvatarEvidenceConfig> = {
  voice_source_audio: {
    capability: 'voice_clone',
    artifactType: 'audio',
    subType: 'voice_source_audio',
    maxBytes: 50 * MiB,
    allowedMimeTypes: AUDIO_MIMES,
  },
  voice_identity_verification: {
    capability: 'voice_clone',
    artifactType: 'document',
    subType: 'voice_identity_verification',
    maxBytes: 50 * MiB,
    allowedMimeTypes: IDENTITY_MIMES,
  },
  voice_consent: {
    capability: 'voice_clone',
    artifactType: 'document',
    subType: 'voice_consent',
    maxBytes: 100 * MiB,
    allowedMimeTypes: CONSENT_MIMES,
  },
  voice_recording_consent: {
    capability: 'voice_clone',
    artifactType: 'document',
    subType: 'voice_recording_consent',
    maxBytes: 100 * MiB,
    allowedMimeTypes: CONSENT_MIMES,
  },
  voice_preview: {
    capability: 'voice_clone',
    artifactType: 'audio',
    subType: 'voice_preview',
    maxBytes: 50 * MiB,
    allowedMimeTypes: AUDIO_MIMES,
  },
  avatar_portrait: {
    capability: 'avatar_generation',
    artifactType: 'image',
    subType: 'avatar_portrait',
    maxBytes: 20 * MiB,
    allowedMimeTypes: IMAGE_MIMES,
  },
  avatar_identity_verification: {
    capability: 'avatar_generation',
    artifactType: 'document',
    subType: 'avatar_identity_verification',
    maxBytes: 50 * MiB,
    allowedMimeTypes: IDENTITY_MIMES,
  },
  avatar_consent: {
    capability: 'avatar_generation',
    artifactType: 'document',
    subType: 'avatar_consent',
    maxBytes: 100 * MiB,
    allowedMimeTypes: CONSENT_MIMES,
  },
  avatar_creation_evidence: {
    capability: 'avatar_generation',
    artifactType: 'document',
    subType: 'avatar_creation_evidence',
    maxBytes: 20 * MiB,
    allowedMimeTypes: [...IMAGE_MIMES, 'application/pdf'],
  },
  avatar_preview: {
    capability: 'avatar_generation',
    artifactType: 'video',
    subType: 'avatar_preview',
    maxBytes: 150 * MiB,
    allowedMimeTypes: [...IMAGE_MIMES, ...VIDEO_MIMES],
  },
}

export function normalizeUploadedMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase().split(';', 1)[0] ?? ''
  const aliases: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-flac': 'audio/flac',
    'audio/mp3': 'audio/mpeg',
    'image/jpg': 'image/jpeg',
    'application/x-pdf': 'application/pdf',
    'video/x-m4v': 'video/mp4',
  }
  return aliases[normalized] ?? normalized
}

function startsWith(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

function ascii(buffer: Buffer, start: number, length: number): string {
  if (buffer.length < start + length) return ''
  return buffer.subarray(start, start + length).toString('ascii')
}

export function detectVoiceAvatarEvidenceMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null
  if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf'
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WAVE') return 'audio/wav'
  if (ascii(buffer, 0, 4) === 'fLaC') return 'audio/flac'
  if (ascii(buffer, 0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (buffer[0] === 0xff && (((buffer[1] ?? 0) & 0xf6) === 0xf0)) return 'audio/aac'
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (ascii(buffer, 4, 4) === 'ftyp') {
    const brand = ascii(buffer, 8, 4)
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  }
  return null
}

export function validateVoiceAvatarEvidenceUpload(input: {
  purpose: VoiceAvatarEvidencePurpose
  buffer: Buffer
  declaredMimeType: string
}): { config: VoiceAvatarEvidenceConfig; detectedMimeType: string; declaredMimeType: string } {
  const config = VOICE_AVATAR_EVIDENCE_CONFIG[input.purpose]
  if (!config) throw new Error('VOICE_AVATAR_EVIDENCE_PURPOSE_INVALID')
  if (input.buffer.length === 0) throw new Error('VOICE_AVATAR_EVIDENCE_EMPTY')
  if (input.buffer.length > config.maxBytes) throw new Error('VOICE_AVATAR_EVIDENCE_TOO_LARGE')
  const detectedMimeType = detectVoiceAvatarEvidenceMime(input.buffer)
  if (!detectedMimeType) throw new Error('VOICE_AVATAR_EVIDENCE_TYPE_UNKNOWN')
  const declaredMimeType = normalizeUploadedMimeType(input.declaredMimeType)
  if (declaredMimeType !== detectedMimeType) throw new Error('VOICE_AVATAR_EVIDENCE_MIME_MISMATCH')
  if (!config.allowedMimeTypes.includes(detectedMimeType)) throw new Error('VOICE_AVATAR_EVIDENCE_TYPE_NOT_ALLOWED')
  return { config, detectedMimeType, declaredMimeType }
}
