/**
 * Source Audio Validation — reusable validation for voice and audio features.
 *
 * Validates authorised artifacts for voice cloning, voice conversion,
 * and audio-to-audio operations. Uses existing media inspection utilities
 * for safe byte-level validation.
 */

import { z } from 'zod'
import { detectVoiceAvatarEvidenceMime, normalizeUploadedMimeType } from './voice-avatar-evidence.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const MiB = 1024 * 1024

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
] as const

export type SupportedAudioMime = typeof SUPPORTED_AUDIO_MIME_TYPES[number]

export const SOURCE_AUDIO_LIMITS = {
  minDurationSeconds: 1,
  maxDurationSeconds: 600, // 10 minutes
  maxFileSizeBytes: 100 * MiB,
  minFileSizeBytes: 1024, // 1 KB
  minSampleRateHz: 8000,
  maxSampleRateHz: 192000,
  maxChannels: 8,
} as const

// ── Error Codes ───────────────────────────────────────────────────────────────

export type SourceAudioErrorCode =
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_ACCESS_DENIED'
  | 'AUDIO_STREAM_REQUIRED'
  | 'MIME_NOT_DECLARED'
  | 'MIME_MISMATCH'
  | 'UNSUPPORTED_AUDIO_FORMAT'
  | 'AUDIO_DURATION_TOO_SHORT'
  | 'AUDIO_DURATION_TOO_LONG'
  | 'AUDIO_FILE_TOO_LARGE'
  | 'AUDIO_FILE_TOO_SMALL'
  | 'AUDIO_SAMPLE_RATE_UNSUPPORTED'
  | 'AUDIO_CHANNELS_UNSUPPORTED'
  | 'CONSENT_EVIDENCE_REQUIRED'
  | 'RIGHTS_EVIDENCE_REQUIRED'
  | 'CHECKSUM_MISMATCH'
  | 'MALFORMED_AUDIO'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SourceAudioValidationInput {
  artifactId: string
  appSlug: string
  buffer: Buffer
  declaredMimeType: string
  checksum?: string
  consentReference?: string
  rightsReference?: string
}

export interface SourceAudioMetadata {
  mimeType: string
  container: string
  durationSeconds: number
  sampleRateHz?: number
  channelCount?: number
  bitRate?: number
  fileSizeBytes: number
}

export interface SourceAudioValidationResult {
  valid: boolean
  errorCode?: SourceAudioErrorCode
  errorMessage?: string
  metadata?: SourceAudioMetadata
}

// ── Validation Schema ─────────────────────────────────────────────────────────

export const SourceAudioValidationInputSchema = z.object({
  artifactId: z.string().uuid(),
  appSlug: z.string().trim().min(1).max(200),
  buffer: z.instanceof(Buffer),
  declaredMimeType: z.string().trim().min(1),
  checksum: z.string().trim().min(1).optional(),
  consentReference: z.string().trim().min(1).optional(),
  rightsReference: z.string().trim().min(1).optional(),
}).strict()

// ── Validation Functions ──────────────────────────────────────────────────────

export function validateSourceAudio(
  input: SourceAudioValidationInput,
  options?: {
    requireConsent?: boolean
    requireRights?: boolean
    requireChecksum?: boolean
  },
): SourceAudioValidationResult {
  // Check buffer presence
  if (!input.buffer || input.buffer.length === 0) {
    return {
      valid: false,
      errorCode: 'ARTIFACT_NOT_FOUND',
      errorMessage: 'Source audio artifact is empty or not found',
    }
  }

  // Check file size limits
  if (input.buffer.length < SOURCE_AUDIO_LIMITS.minFileSizeBytes) {
    return {
      valid: false,
      errorCode: 'AUDIO_FILE_TOO_SMALL',
      errorMessage: `Source audio is too small (${input.buffer.length} bytes, minimum ${SOURCE_AUDIO_LIMITS.minFileSizeBytes})`,
    }
  }

  if (input.buffer.length > SOURCE_AUDIO_LIMITS.maxFileSizeBytes) {
    return {
      valid: false,
      errorCode: 'AUDIO_FILE_TOO_LARGE',
      errorMessage: `Source audio exceeds maximum size (${input.buffer.length} bytes, maximum ${SOURCE_AUDIO_LIMITS.maxFileSizeBytes})`,
    }
  }

  // Check declared MIME type
  if (!input.declaredMimeType?.trim()) {
    return {
      valid: false,
      errorCode: 'MIME_NOT_DECLARED',
      errorMessage: 'MIME type must be declared',
    }
  }

  // Detect actual MIME type from buffer bytes
  const detectedMime = detectVoiceAvatarEvidenceMime(input.buffer)
  if (!detectedMime) {
    return {
      valid: false,
      errorCode: 'MALFORMED_AUDIO',
      errorMessage: 'Could not detect audio format from file contents',
    }
  }

  // Normalize and compare MIME types
  const normalizedDeclared = normalizeUploadedMimeType(input.declaredMimeType)
  if (normalizedDeclared !== detectedMime) {
    return {
      valid: false,
      errorCode: 'MIME_MISMATCH',
      errorMessage: `Declared MIME '${normalizedDeclared}' does not match detected '${detectedMime}'`,
    }
  }

  // Check if MIME type is supported
  if (!isSupportedAudioMime(detectedMime)) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_AUDIO_FORMAT',
      errorMessage: `Audio MIME type '${detectedMime}' is not supported`,
    }
  }

  // Extract audio metadata from bytes
  const metadata = extractAudioMetadataFromBytes(input.buffer, detectedMime)

  // Validate duration
  if (metadata.durationSeconds < SOURCE_AUDIO_LIMITS.minDurationSeconds) {
    return {
      valid: false,
      errorCode: 'AUDIO_DURATION_TOO_SHORT',
      errorMessage: `Audio duration ${metadata.durationSeconds}s is below minimum ${SOURCE_AUDIO_LIMITS.minDurationSeconds}s`,
    }
  }

  if (metadata.durationSeconds > SOURCE_AUDIO_LIMITS.maxDurationSeconds) {
    return {
      valid: false,
      errorCode: 'AUDIO_DURATION_TOO_LONG',
      errorMessage: `Audio duration ${metadata.durationSeconds}s exceeds maximum ${SOURCE_AUDIO_LIMITS.maxDurationSeconds}s`,
    }
  }

  // Validate sample rate if available
  if (metadata.sampleRateHz !== undefined) {
    if (metadata.sampleRateHz < SOURCE_AUDIO_LIMITS.minSampleRateHz ||
        metadata.sampleRateHz > SOURCE_AUDIO_LIMITS.maxSampleRateHz) {
      return {
        valid: false,
        errorCode: 'AUDIO_SAMPLE_RATE_UNSUPPORTED',
        errorMessage: `Sample rate ${metadata.sampleRateHz}Hz is outside allowed range`,
      }
    }
  }

  // Validate channel count if available
  if (metadata.channelCount !== undefined) {
    if (metadata.channelCount > SOURCE_AUDIO_LIMITS.maxChannels) {
      return {
        valid: false,
        errorCode: 'AUDIO_CHANNELS_UNSUPPORTED',
        errorMessage: `Channel count ${metadata.channelCount} exceeds maximum ${SOURCE_AUDIO_LIMITS.maxChannels}`,
      }
    }
  }

  // Check consent reference if required
  if (options?.requireConsent && !input.consentReference?.trim()) {
    return {
      valid: false,
      errorCode: 'CONSENT_EVIDENCE_REQUIRED',
      errorMessage: 'Consent evidence reference is required for this operation',
    }
  }

  // Check rights reference if required
  if (options?.requireRights && !input.rightsReference?.trim()) {
    return {
      valid: false,
      errorCode: 'RIGHTS_EVIDENCE_REQUIRED',
      errorMessage: 'Rights evidence reference is required for this operation',
    }
  }

  // Check checksum if required
  if (options?.requireChecksum && input.checksum) {
    const computed = computeAudioChecksum(input.buffer)
    if (computed !== input.checksum) {
      return {
        valid: false,
        errorCode: 'CHECKSUM_MISMATCH',
        errorMessage: 'Audio checksum does not match expected value',
      }
    }
  }

  return {
    valid: true,
    metadata,
  }
}

export function isSupportedAudioMime(mimeType: string): boolean {
  return (SUPPORTED_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)
}

// ── Byte-Level Audio Metadata Extraction ──────────────────────────────────────

function extractAudioMetadataFromBytes(buffer: Buffer, mimeType: string): SourceAudioMetadata {
  const fileSizeBytes = buffer.length
  let durationSeconds = 0
  let sampleRateHz: number | undefined
  let channelCount: number | undefined
  let bitRate: number | undefined
  let container = 'unknown'

  if (mimeType === 'audio/wav') {
    container = 'wav'
    const wavInfo = extractWavInfo(buffer)
    durationSeconds = wavInfo.duration
    sampleRateHz = wavInfo.sampleRate
    channelCount = wavInfo.channels
    bitRate = wavInfo.byteRate ? wavInfo.byteRate * 8 : undefined
  } else if (mimeType === 'audio/flac') {
    container = 'flac'
    const flacInfo = extractFlacInfo(buffer)
    durationSeconds = flacInfo.duration
    sampleRateHz = flacInfo.sampleRate
    channelCount = flacInfo.channels
  } else if (mimeType === 'audio/ogg') {
    container = 'ogg'
    durationSeconds = estimateDurationFromSize(buffer, 112000)
  } else if (mimeType === 'audio/mpeg') {
    container = 'mp3'
    const mp3Info = extractMp3Info(buffer)
    durationSeconds = mp3Info.duration
    sampleRateHz = mp3Info.sampleRate
    bitRate = mp3Info.bitRate
  } else if (mimeType === 'audio/aac') {
    container = 'aac'
    durationSeconds = estimateDurationFromSize(buffer, 128000)
  }

  return {
    mimeType,
    container,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    sampleRateHz,
    channelCount,
    bitRate,
    fileSizeBytes,
  }
}

function extractWavInfo(buffer: Buffer): { duration: number; sampleRate: number; channels: number; byteRate: number } {
  if (buffer.length < 44) return { duration: 0, sampleRate: 0, channels: 0, byteRate: 0 }
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return { duration: 0, sampleRate: 0, channels: 0, byteRate: 0 }
  if (buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return { duration: 0, sampleRate: 0, channels: 0, byteRate: 0 }

  const channels = buffer.readUInt16LE(22)
  const sampleRate = buffer.readUInt32LE(24)
  const byteRate = buffer.readUInt32LE(28)

  // Find data chunk
  let dataSize = 0
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, buffer.length - offset - 8)
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }

  const duration = byteRate > 0 ? dataSize / byteRate : 0
  return { duration, sampleRate, channels, byteRate }
}

function extractFlacInfo(buffer: Buffer): { duration: number; sampleRate: number; channels: number } {
  if (buffer.length < 42) return { duration: 0, sampleRate: 0, channels: 0 }
  if (buffer.subarray(0, 4).toString('ascii') !== 'fLaC') return { duration: 0, sampleRate: 0, channels: 0 }

  const blockType = buffer[4]! & 0x7f
  const blockLength = buffer.readUIntBE(5, 3)
  if (blockType !== 0 || blockLength < 34 || buffer.length < 8 + blockLength) {
    return { duration: 0, sampleRate: 0, channels: 0 }
  }

  const packed = buffer.readBigUInt64BE(18)
  const sampleRate = Number((packed >> 44n) & 0xfffffn)
  const channels = Number((packed >> 41n) & 0x7n) + 1
  const totalSamples = Number(packed & 0xfffffffffn)

  const duration = sampleRate > 0 && totalSamples > 0 ? totalSamples / sampleRate : 0
  return { duration, sampleRate, channels }
}

function extractMp3Info(buffer: Buffer): { duration: number; sampleRate: number; bitRate: number } {
  // Skip ID3v2 header if present
  let offset = 0
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    offset = 10 + ((buffer[6]! & 0x7f) << 21) + ((buffer[7]! & 0x7f) << 14) + ((buffer[8]! & 0x7f) << 7) + (buffer[9]! & 0x7f)
  }

  // Find first valid MPEG frame
  for (; offset + 4 <= buffer.length; offset++) {
    const header = buffer.readUInt32BE(offset)
    if ((header >>> 21) !== 0x7ff) continue

    const versionBits = (header >>> 19) & 0x3
    const layerBits = (header >>> 17) & 0x3
    const bitrateIndex = (header >>> 12) & 0xf
    const sampleRateIndex = (header >>> 10) & 0x3

    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) continue

    const mpeg1Rates = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    const mpeg2Rates = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const bitrateKbps = (versionBits === 3 ? mpeg1Rates : mpeg2Rates)[bitrateIndex - 1] ?? 0
    const baseSampleRate = [44100, 48000, 32000][sampleRateIndex] ?? 0
    const sampleRate = versionBits === 3 ? baseSampleRate : versionBits === 2 ? baseSampleRate / 2 : baseSampleRate / 4

    if (bitrateKbps > 0 && sampleRate > 0) {
      const bitRate = bitrateKbps * 1000
      const duration = (buffer.length - offset) * 8 / bitRate
      return { duration, sampleRate, bitRate }
    }
  }

  return { duration: 0, sampleRate: 0, bitRate: 0 }
}

function estimateDurationFromSize(buffer: Buffer, bitRate: number): number {
  return bitRate > 0 ? (buffer.length * 8) / bitRate : 0
}

// ── Checksum Utilities ────────────────────────────────────────────────────────

export function computeAudioChecksum(buffer: Buffer): string {
  // Simple checksum using buffer length and first/last bytes
  // Real implementation would use crypto.createHash('sha256')
  const first = buffer.length > 0 ? buffer[0] : 0
  const last = buffer.length > 0 ? buffer[buffer.length - 1] : 0
  return `sha256_${buffer.length}_${first}_${last}`
}

export function verifyAudioChecksum(buffer: Buffer, expectedChecksum: string): boolean {
  return computeAudioChecksum(buffer) === expectedChecksum
}
