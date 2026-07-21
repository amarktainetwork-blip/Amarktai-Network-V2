import { describe, expect, it } from 'vitest'
import { deriveVideoSampleTimestamps } from '../apps/worker/src/video-frame-sampler.js'

describe('video frame sampling timeline', () => {
  it('covers the beginning, middle and end of the video deterministically', () => {
    const timestamps = deriveVideoSampleTimestamps(30, 6)
    expect(timestamps).toHaveLength(6)
    expect(timestamps[0]).toBeGreaterThanOrEqual(0)
    expect(timestamps.at(-1)).toBeLessThanOrEqual(30)
    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right))
    expect(timestamps[2]).toBeLessThan(15)
    expect(timestamps[3]).toBeGreaterThan(15)
  })

  it('supports short clips without selecting timestamps outside the media', () => {
    const timestamps = deriveVideoSampleTimestamps(0.8, 4)
    expect(timestamps.every((value) => value >= 0 && value <= 0.8)).toBe(true)
    expect(new Set(timestamps).size).toBe(4)
  })

  it('rejects invalid duration and excessive sampling', () => {
    expect(() => deriveVideoSampleTimestamps(0, 6)).toThrow('duration must be positive')
    expect(() => deriveVideoSampleTimestamps(30, 1)).toThrow('between 2 and 12')
    expect(() => deriveVideoSampleTimestamps(30, 13)).toThrow('between 2 and 12')
  })
})
