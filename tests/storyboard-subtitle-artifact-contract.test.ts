import { describe, expect, it } from 'vitest'
import { ARTIFACT_MIME_MAP, isValidMimeForType } from '../packages/core/src/artifacts.ts'

describe('storyboard and subtitle artifact contracts', () => {
  it('accepts JSON storyboards and both governed subtitle formats', () => {
    expect(isValidMimeForType('document', 'application/json')).toBe(true)
    expect(isValidMimeForType('transcript', 'application/x-subrip')).toBe(true)
    expect(isValidMimeForType('transcript', 'text/vtt')).toBe(true)
    expect(ARTIFACT_MIME_MAP.transcript).toEqual(expect.arrayContaining(['application/x-subrip', 'text/vtt']))
  })

  it('does not classify subtitle files as audio or video artifacts', () => {
    expect(isValidMimeForType('audio', 'application/x-subrip')).toBe(false)
    expect(isValidMimeForType('video', 'text/vtt')).toBe(false)
  })
})
