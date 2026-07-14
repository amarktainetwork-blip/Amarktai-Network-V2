import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../app/dashboard/video/page.js', import.meta.url), 'utf8')

describe('long-form dashboard one-request contract', () => {
  it('submits and polls one parent execution without provider/model or manual component calls', () => {
    expect(source).toContain("adminFetch('/api/admin/long-form-video/executions'")
    expect(source).toContain('/api/admin/long-form-video/executions/${id}')
    expect(source).toContain("localStorage.setItem(LONG_EXECUTION_KEY, data.executionId)")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/subtitles")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/music-bed")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/assemble")
    expect(source).not.toContain('Provider selector')
    expect(source).not.toContain('Model selector')
  })

  it('shows independent component progress and final preview/download', () => {
    for (const field of ['componentState?.scenes', 'componentState?.voiceover', 'componentState?.subtitles', 'componentState?.musicBed', 'componentState?.assembly']) expect(source).toContain(field)
    expect(source).toContain('/api/admin/artifacts/${finalArtifactId}/file')
    expect(source).toContain('Download final video')
  })
})
