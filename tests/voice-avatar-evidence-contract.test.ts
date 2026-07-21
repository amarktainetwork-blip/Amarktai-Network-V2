import { describe, expect, it } from 'vitest'
import {
  VOICE_AVATAR_EVIDENCE_CONFIG,
  VOICE_AVATAR_EVIDENCE_PURPOSES,
  detectVoiceAvatarEvidenceMime,
  normalizeUploadedMimeType,
  validateVoiceAvatarEvidenceUpload,
} from '../packages/core/src/voice-avatar-evidence.ts'

function bytes(prefix: number[], size = Math.max(prefix.length, 32)): Buffer {
  const buffer = Buffer.alloc(size)
  Buffer.from(prefix).copy(buffer)
  return buffer
}

const samples = {
  pdf: Buffer.from('%PDF-1.7\nfixture'),
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: bytes([0xff, 0xd8, 0xff, 0xe0]),
  webp: (() => { const buffer = Buffer.alloc(32); buffer.write('RIFF', 0); buffer.write('WEBP', 8); return buffer })(),
  wav: (() => { const buffer = Buffer.alloc(44); buffer.write('RIFF', 0); buffer.write('WAVE', 8); return buffer })(),
  flac: Buffer.from('fLaCfixture'),
  ogg: Buffer.from('OggSfixture'),
  mp3: Buffer.from('ID3fixture'),
  aac: bytes([0xff, 0xf1, 0x50, 0x80]),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3]),
  mp4: (() => { const buffer = Buffer.alloc(32); buffer.writeUInt32BE(24, 0); buffer.write('ftyp', 4); buffer.write('isom', 8); return buffer })(),
  mov: (() => { const buffer = Buffer.alloc(32); buffer.writeUInt32BE(24, 0); buffer.write('ftyp', 4); buffer.write('qt  ', 8); return buffer })(),
}

describe('voice and avatar evidence purpose policy', () => {
  it('defines only explicit profile evidence purposes', () => {
    expect([...VOICE_AVATAR_EVIDENCE_PURPOSES]).toEqual([
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
    ])
    expect(Object.keys(VOICE_AVATAR_EVIDENCE_CONFIG).sort()).toEqual([...VOICE_AVATAR_EVIDENCE_PURPOSES].sort())
  })

  it('maps voice evidence to voice_clone and avatar evidence to avatar_generation', () => {
    for (const purpose of VOICE_AVATAR_EVIDENCE_PURPOSES) {
      expect(VOICE_AVATAR_EVIDENCE_CONFIG[purpose].capability).toBe(purpose.startsWith('voice_') ? 'voice_clone' : 'avatar_generation')
      expect(VOICE_AVATAR_EVIDENCE_CONFIG[purpose].maxBytes).toBeGreaterThan(0)
    }
  })

  it('does not allow SVG or generic text uploads', () => {
    for (const config of Object.values(VOICE_AVATAR_EVIDENCE_CONFIG)) {
      expect(config.allowedMimeTypes).not.toContain('image/svg+xml')
      expect(config.allowedMimeTypes).not.toContain('text/html')
      expect(config.allowedMimeTypes).not.toContain('text/plain')
    }
  })
})

describe('voice and avatar evidence signature detection', () => {
  it.each([
    [samples.pdf, 'application/pdf'],
    [samples.png, 'image/png'],
    [samples.jpeg, 'image/jpeg'],
    [samples.webp, 'image/webp'],
    [samples.wav, 'audio/wav'],
    [samples.flac, 'audio/flac'],
    [samples.ogg, 'audio/ogg'],
    [samples.mp3, 'audio/mpeg'],
    [samples.aac, 'audio/aac'],
    [samples.webm, 'video/webm'],
    [samples.mp4, 'video/mp4'],
    [samples.mov, 'video/quicktime'],
  ])('detects supported magic bytes', (buffer, expected) => {
    expect(detectVoiceAvatarEvidenceMime(buffer)).toBe(expected)
  })

  it('returns null for HTML, SVG, executable and arbitrary bytes', () => {
    expect(detectVoiceAvatarEvidenceMime(Buffer.from('<html>not evidence</html>'))).toBeNull()
    expect(detectVoiceAvatarEvidenceMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(detectVoiceAvatarEvidenceMime(Buffer.from('MZ executable'))).toBeNull()
    expect(detectVoiceAvatarEvidenceMime(Buffer.from([1, 2, 3, 4, 5]))).toBeNull()
  })

  it('normalizes safe MIME aliases only', () => {
    expect(normalizeUploadedMimeType('audio/x-wav; charset=binary')).toBe('audio/wav')
    expect(normalizeUploadedMimeType('image/jpg')).toBe('image/jpeg')
    expect(normalizeUploadedMimeType('application/x-pdf')).toBe('application/pdf')
    expect(normalizeUploadedMimeType('text/html')).toBe('text/html')
  })
})

describe('voice and avatar evidence upload validation', () => {
  it('derives stored artifact type from detected bytes', () => {
    expect(validateVoiceAvatarEvidenceUpload({
      purpose: 'voice_identity_verification',
      buffer: samples.png,
      declaredMimeType: 'image/png',
    })).toMatchObject({ detectedMimeType: 'image/png', artifactType: 'image' })

    expect(validateVoiceAvatarEvidenceUpload({
      purpose: 'voice_consent',
      buffer: samples.wav,
      declaredMimeType: 'audio/x-wav',
    })).toMatchObject({ detectedMimeType: 'audio/wav', artifactType: 'audio' })

    expect(validateVoiceAvatarEvidenceUpload({
      purpose: 'avatar_preview',
      buffer: samples.mp4,
      declaredMimeType: 'video/mp4',
    })).toMatchObject({ detectedMimeType: 'video/mp4', artifactType: 'video' })
  })

  it('rejects declared and detected MIME mismatch', () => {
    expect(() => validateVoiceAvatarEvidenceUpload({
      purpose: 'avatar_portrait',
      buffer: samples.png,
      declaredMimeType: 'image/jpeg',
    })).toThrow('VOICE_AVATAR_EVIDENCE_MIME_MISMATCH')
  })

  it('rejects a valid file type when the purpose forbids it', () => {
    expect(() => validateVoiceAvatarEvidenceUpload({
      purpose: 'avatar_portrait',
      buffer: samples.pdf,
      declaredMimeType: 'application/pdf',
    })).toThrow('VOICE_AVATAR_EVIDENCE_TYPE_NOT_ALLOWED')
  })

  it('rejects empty, unknown and oversized evidence', () => {
    expect(() => validateVoiceAvatarEvidenceUpload({
      purpose: 'voice_source_audio',
      buffer: Buffer.alloc(0),
      declaredMimeType: 'audio/wav',
    })).toThrow('VOICE_AVATAR_EVIDENCE_EMPTY')
    expect(() => validateVoiceAvatarEvidenceUpload({
      purpose: 'voice_source_audio',
      buffer: Buffer.from('arbitrary'),
      declaredMimeType: 'audio/wav',
    })).toThrow('VOICE_AVATAR_EVIDENCE_TYPE_UNKNOWN')
    expect(() => validateVoiceAvatarEvidenceUpload({
      purpose: 'avatar_portrait',
      buffer: Buffer.concat([samples.png, Buffer.alloc(VOICE_AVATAR_EVIDENCE_CONFIG.avatar_portrait.maxBytes)]),
      declaredMimeType: 'image/png',
    })).toThrow('VOICE_AVATAR_EVIDENCE_TOO_LARGE')
  })
})
