/**
 * Subtitle generation for long-form video.
 *
 * Generates SRT and WebVTT subtitle files from scene narration text
 * with scene-aligned timing. No external dependencies required.
 */

export interface SubtitleSegment {
  index: number
  startTimeSeconds: number
  endTimeSeconds: number
  text: string
}

export interface SubtitleGenerationInput {
  scenes: Array<{
    sceneNumber: number
    subtitleText: string
    durationSeconds: number
  }>
  format: 'srt' | 'vtt'
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function buildSubtitleSegments(
  scenes: Array<{ sceneNumber: number; subtitleText: string; durationSeconds: number }>
): SubtitleSegment[] {
  const segments: SubtitleSegment[] = []
  let currentTime = 0

  for (const scene of scenes) {
    if (!scene.subtitleText?.trim()) continue
    segments.push({
      index: segments.length + 1,
      startTimeSeconds: currentTime,
      endTimeSeconds: currentTime + scene.durationSeconds,
      text: scene.subtitleText.trim(),
    })
    currentTime += scene.durationSeconds
  }

  return segments
}

export function generateSrt(segments: SubtitleSegment[]): string {
  return segments
    .map(
      (seg) =>
        `${seg.index}\n${formatSrtTime(seg.startTimeSeconds)} --> ${formatSrtTime(seg.endTimeSeconds)}\n${seg.text}\n`
    )
    .join('\n')
}

export function generateVtt(segments: SubtitleSegment[]): string {
  const header = 'WEBVTT\n\n'
  const body = segments
    .map(
      (seg) =>
        `${seg.index}\n${formatVttTime(seg.startTimeSeconds)} --> ${formatVttTime(seg.endTimeSeconds)}\n${seg.text}\n`
    )
    .join('\n')
  return header + body
}

export function generateSubtitles(input: SubtitleGenerationInput): string {
  const segments = buildSubtitleSegments(input.scenes)
  if (segments.length === 0) return ''

  return input.format === 'vtt' ? generateVtt(segments) : generateSrt(segments)
}

export function getSubtitleMimeType(format: 'srt' | 'vtt'): string {
  return format === 'vtt' ? 'text/vtt' : 'application/x-subrip'
}
