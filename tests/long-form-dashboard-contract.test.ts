import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../app/dashboard/video/page.js', import.meta.url), 'utf8')

describe('long-form dashboard plan-first contract', () => {
  it('submits a plan first, then polls one parent execution after approval', () => {
    expect(source).toContain("adminFetch('/api/admin/long-form-video/plan'")
    expect(source).toContain("adminFetch('/api/admin/long-form-video/approve'")
    expect(source).toContain('/api/admin/long-form-video/executions/${id}')
    expect(source).toContain("localStorage.setItem(LONG_EXECUTION_KEY, data.executionId)")
    expect(source).toContain('localStorage.getItem(LONG_EXECUTION_KEY)')
    expect(source).not.toContain("fetch('/api/admin/long-form-video/subtitles")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/music-bed")
    expect(source).not.toContain("fetch('/api/admin/long-form-video/assemble")
    expect(source).not.toContain('Provider selector')
    expect(source).not.toContain('Model selector')
  })

  it('shows plan review before approval with scene cards, CTA, legal, music brief', () => {
    expect(source).toContain('Planning only')
    expect(source).toContain('no media provider calls started')
    expect(source).toContain('PlanSceneCard')
    expect(source).toContain('planId')
    expect(source).toContain('versionHash')
    expect(source).toContain('Approve and execute')
    expect(source).toContain('Discard plan')
    expect(source).toContain('planPhase')
    expect(source).toContain('validation')
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

  it('includes routing mode selector with canonical values', () => {
    expect(source).toContain("useState('quality')")
    expect(source).toContain('ROUTING_MODES')
    expect(source).toContain('Routing mode')
    for (const mode of ['balanced', 'quality', 'economy', 'fast']) expect(source).toContain(mode)
  })

  it('prevents stale artifact leakage by keying on execution ID', () => {
    expect(source).toContain('currentExecutionId')
    expect(source).toContain("longResult?.parent?.executionId || longResult?.executionId || executionId")
    expect(source).toContain("localStorage.removeItem(LONG_PLAN_KEY)")
  })
})
