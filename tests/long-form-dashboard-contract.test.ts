import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../app/dashboard/video/page.js', import.meta.url), 'utf8')

describe('long-form dashboard one-request contract', () => {
  it('submits and polls one parent execution without provider/model or manual component calls', () => {
    expect(source).toContain("adminFetch('/api/admin/long-form-video/executions'")
    expect(source).toContain('/api/admin/long-form-video/executions/${id}')
    expect(source).toContain("localStorage.setItem(LONG_EXECUTION_KEY, data.executionId)")
    expect(source).toContain('localStorage.getItem(LONG_EXECUTION_KEY)')
    expect(source).not.toContain('localStorage.removeItem(LONG_EXECUTION_KEY)')
    expect(source).not.toContain("fetch('/api/admin/long-form-video/subtitles")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/music-bed")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/assemble")
    expect(source).not.toContain('Provider selector')
    expect(source).not.toContain('Model selector')
  })

  it('shows durable plan, per-scene progress, retries, and final preview/download', () => {
    for (const field of ['planId', 'longResult?.scenes', 'componentState?.voiceover', 'componentState?.subtitles', 'componentState?.musicBed', 'componentState?.assembly']) expect(source).toContain(field)
    expect(source).toContain('/scenes/${sceneNumber}/retry')
    expect(source).toContain('Retry scene')
    expect(source).toContain('/api/admin/artifacts/${finalArtifactId}/file')
    expect(source).toContain('Download final video')
  })

  it('defaults to the 30-second three-scene milestone with optional media preserved and off', () => {
    expect(source).toContain('useState(30)')
    expect(source).toContain('useState(3)')
    expect(source).toContain("useState('16:9')")
    expect(source).toContain("useState('cinematic')")
    expect(source).toContain("useState('professional')")
    expect(source.match(/useState\(false\)/g)?.length).toBeGreaterThanOrEqual(3)
    for (const label of ['Voiceover', 'Subtitles', 'Music bed']) expect(source).toContain(`label="${label}"`)
  })
})
