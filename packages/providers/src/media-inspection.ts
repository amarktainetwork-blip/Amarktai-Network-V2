import { CanonicalProviderError } from './provider-errors.js'

export interface InspectedImage {
  width: number
  height: number
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export interface InspectedTimedMedia {
  duration: number
  durationSource: string
  width?: number
  height?: number
}

export function inspectImageBuffer(buffer: Buffer, provider: string): InspectedImage {
  if (buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && buffer.subarray(12, 16).toString('ascii') === 'IHDR') {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    if (width > 0 && height > 0) return { width, height, mimeType: 'image/png' }
  }

  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue }
      const marker = buffer[offset + 1]!
      offset += 2
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > buffer.length) break
      const length = buffer.readUInt16BE(offset)
      if (length < 2 || offset + length > buffer.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        const height = buffer.readUInt16BE(offset + 3)
        const width = buffer.readUInt16BE(offset + 5)
        if (width > 0 && height > 0) return { width, height, mimeType: 'image/jpeg' }
      }
      offset += length
    }
  }

  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const format = buffer.subarray(12, 16).toString('ascii')
    let width = 0
    let height = 0
    if (format === 'VP8X') {
      width = 1 + buffer.readUIntLE(24, 3)
      height = 1 + buffer.readUIntLE(27, 3)
    } else if (format === 'VP8 ' && buffer.length >= 30) {
      width = buffer.readUInt16LE(26) & 0x3fff
      height = buffer.readUInt16LE(28) & 0x3fff
    } else if (format === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21)
      width = (bits & 0x3fff) + 1
      height = ((bits >>> 14) & 0x3fff) + 1
    }
    if (width > 0 && height > 0) return { width, height, mimeType: 'image/webp' }
  }

  throw artifactError(provider, 'returned image bytes do not contain a supported nonzero pixel size')
}

export function inspectAudioBuffer(buffer: Buffer, mimeType: string, provider: string): InspectedTimedMedia {
  const normalizedMime = mimeType.split(';', 1)[0]!.trim().toLowerCase()
  if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/wave' || isRiffWave(buffer)) {
    const duration = inspectWavDuration(buffer)
    if (duration > 0) return { duration, durationSource: 'wav_header' }
  }
  if (normalizedMime === 'audio/flac' || buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    const duration = inspectFlacDuration(buffer)
    if (duration > 0) return { duration, durationSource: 'flac_streaminfo' }
  }
  if (normalizedMime === 'audio/ogg' || buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    const duration = inspectOggDuration(buffer)
    if (duration > 0) return { duration, durationSource: 'ogg_granule_position' }
  }
  if (normalizedMime === 'audio/mp4' || normalizedMime === 'audio/x-m4a' || hasIsoFtyp(buffer)) {
    const media = inspectIsoBaseMedia(buffer)
    if (media.duration > 0) return { duration: media.duration, durationSource: 'mp4_mvhd' }
  }
  if (normalizedMime === 'audio/mpeg' || normalizedMime === 'audio/mp3' || isMp3(buffer)) {
    const duration = inspectMp3Duration(buffer)
    if (duration > 0) return { duration, durationSource: 'mp3_frame_bitrate' }
  }
  throw artifactError(provider, 'returned audio bytes do not contain a measurable nonzero duration')
}

export function inspectVideoBuffer(buffer: Buffer, mimeType: string, provider: string): InspectedTimedMedia {
  const normalizedMime = mimeType.split(';', 1)[0]!.trim().toLowerCase()
  let media: InspectedTimedMedia | null = null
  if (normalizedMime === 'video/mp4' || normalizedMime === 'video/quicktime' || hasIsoFtyp(buffer)) {
    media = inspectIsoBaseMedia(buffer)
  } else if (normalizedMime === 'video/webm' || isWebm(buffer)) {
    media = inspectWebm(buffer)
  }
  if (media && media.duration > 0 && (media.width ?? 0) > 0 && (media.height ?? 0) > 0) return media
  throw artifactError(provider, 'returned video bytes do not contain measurable duration and nonzero dimensions')
}

function inspectWavDuration(buffer: Buffer): number {
  if (!isRiffWave(buffer)) return 0
  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii')
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ' && size >= 16 && offset + 20 <= buffer.length) byteRate = buffer.readUInt32LE(offset + 16)
    if (id === 'data') { dataSize = Math.min(size, Math.max(0, buffer.length - offset - 8)); break }
    offset += 8 + size + (size % 2)
  }
  return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0
}

function inspectFlacDuration(buffer: Buffer): number {
  if (buffer.length < 42 || buffer.subarray(0, 4).toString('ascii') !== 'fLaC') return 0
  const blockType = buffer[4]! & 0x7f
  const blockLength = buffer.readUIntBE(5, 3)
  if (blockType !== 0 || blockLength < 34 || buffer.length < 8 + blockLength) return 0
  const packed = buffer.readBigUInt64BE(18)
  const sampleRate = Number((packed >> 44n) & 0xfffffn)
  const totalSamples = Number(packed & 0xfffffffffn)
  return sampleRate > 0 && totalSamples > 0 ? totalSamples / sampleRate : 0
}

function inspectOggDuration(buffer: Buffer): number {
  if (buffer.length < 27 || buffer.subarray(0, 4).toString('ascii') !== 'OggS') return 0
  const opus = buffer.indexOf(Buffer.from('OpusHead'))
  const vorbis = buffer.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]))
  const sampleRate = opus >= 0 ? 48_000 : vorbis >= 0 && vorbis + 16 <= buffer.length ? buffer.readUInt32LE(vorbis + 12) : 0
  let offset = buffer.length - 4
  while (offset >= 0 && buffer.subarray(offset, offset + 4).toString('ascii') !== 'OggS') offset--
  if (offset < 0 || offset + 14 > buffer.length || sampleRate <= 0) return 0
  const granule = Number(buffer.readBigUInt64LE(offset + 6))
  return Number.isSafeInteger(granule) && granule > 0 ? granule / sampleRate : 0
}

function inspectMp3Duration(buffer: Buffer): number {
  let offset = 0
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    offset = 10 + ((buffer[6]! & 0x7f) << 21) + ((buffer[7]! & 0x7f) << 14) + ((buffer[8]! & 0x7f) << 7) + (buffer[9]! & 0x7f)
  }
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
    const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex] ?? 0
    const sampleRate = versionBits === 3 ? baseSampleRate : versionBits === 2 ? baseSampleRate / 2 : baseSampleRate / 4
    const padding = (header >>> 9) & 1
    const frameLength = Math.floor((versionBits === 3 ? 144_000 : 72_000) * bitrateKbps / sampleRate) + padding
    const nextFrame = offset + frameLength
    if (bitrateKbps > 0 && frameLength > 4 && nextFrame + 4 <= buffer.length && (buffer.readUInt32BE(nextFrame) >>> 21) === 0x7ff) {
      return ((buffer.length - offset) * 8) / (bitrateKbps * 1000)
    }
  }
  return 0
}

function inspectIsoBaseMedia(buffer: Buffer): InspectedTimedMedia {
  let duration = 0
  let width = 0
  let height = 0
  walkIsoBoxes(buffer, 0, buffer.length, (type, contentOffset, boxEnd) => {
    if (type === 'mvhd') {
      const version = buffer[contentOffset]
      const timescaleOffset = contentOffset + (version === 1 ? 20 : 12)
      const durationOffset = contentOffset + (version === 1 ? 24 : 16)
      if (durationOffset + (version === 1 ? 8 : 4) <= boxEnd) {
        const timescale = buffer.readUInt32BE(timescaleOffset)
        const units = version === 1 ? Number(buffer.readBigUInt64BE(durationOffset)) : buffer.readUInt32BE(durationOffset)
        if (timescale > 0 && units > 0) duration = units / timescale
      }
    }
    if (type === 'tkhd' && boxEnd - contentOffset >= 8) {
      const candidateWidth = buffer.readUInt32BE(boxEnd - 8) / 65_536
      const candidateHeight = buffer.readUInt32BE(boxEnd - 4) / 65_536
      if (candidateWidth > 0 && candidateHeight > 0) {
        width = Math.round(candidateWidth)
        height = Math.round(candidateHeight)
      }
    }
  })
  return { duration, width, height, durationSource: 'mp4_mvhd' }
}

function walkIsoBoxes(
  buffer: Buffer,
  start: number,
  end: number,
  visit: (type: string, contentOffset: number, boxEnd: number) => void,
): void {
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta'])
  let offset = start
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    let headerSize = 8
    if (size === 1) {
      if (offset + 16 > end) break
      const large = buffer.readBigUInt64BE(offset + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(large)
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < headerSize || offset + size > end) break
    const contentOffset = offset + headerSize + (type === 'meta' ? 4 : 0)
    const boxEnd = offset + size
    visit(type, contentOffset, boxEnd)
    if (containers.has(type) && contentOffset < boxEnd) walkIsoBoxes(buffer, contentOffset, boxEnd, visit)
    offset = boxEnd
  }
}

function inspectWebm(buffer: Buffer): InspectedTimedMedia {
  const timecodeScale = readEbmlUnsigned(buffer, Buffer.from([0x2a, 0xd7, 0xb1])) || 1_000_000
  const durationUnits = readEbmlFloat(buffer, Buffer.from([0x44, 0x89]))
  const width = readEbmlUnsigned(buffer, Buffer.from([0xb0]))
  const height = readEbmlUnsigned(buffer, Buffer.from([0xba]))
  return {
    duration: durationUnits > 0 ? durationUnits * timecodeScale / 1_000_000_000 : 0,
    durationSource: 'webm_segment_info',
    width,
    height,
  }
}

function readEbmlUnsigned(buffer: Buffer, id: Buffer): number {
  const offset = buffer.indexOf(id)
  if (offset < 0) return 0
  const size = readEbmlVint(buffer, offset + id.length)
  if (!size || size.value < 1 || size.value > 8 || size.next + size.value > buffer.length) return 0
  let value = 0
  for (let i = 0; i < size.value; i++) value = value * 256 + buffer[size.next + i]!
  return value
}

function readEbmlFloat(buffer: Buffer, id: Buffer): number {
  const offset = buffer.indexOf(id)
  if (offset < 0) return 0
  const size = readEbmlVint(buffer, offset + id.length)
  if (!size || size.next + size.value > buffer.length) return 0
  if (size.value === 4) return buffer.readFloatBE(size.next)
  if (size.value === 8) return buffer.readDoubleBE(size.next)
  return 0
}

function readEbmlVint(buffer: Buffer, offset: number): { value: number; next: number } | null {
  const first = buffer[offset]
  if (!first) return null
  let length = 1
  let mask = 0x80
  while (length <= 8 && (first & mask) === 0) { length++; mask >>= 1 }
  if (length > 8 || offset + length > buffer.length) return null
  let value = first & (mask - 1)
  for (let i = 1; i < length; i++) value = value * 256 + buffer[offset + i]!
  return { value, next: offset + length }
}

function isRiffWave(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE'
}

function isMp3(buffer: Buffer): boolean {
  return buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0)
}

function hasIsoFtyp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
}

function isWebm(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
}

function artifactError(provider: string, message: string): CanonicalProviderError {
  return new CanonicalProviderError({ code: 'artifact_validation', provider, message: `${provider} ${message}` })
}
