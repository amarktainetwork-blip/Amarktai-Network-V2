import { describe, expect, it } from 'vitest'
import { classifyParentWorkflow } from '../apps/worker/src/parent-workflow.js'
import { deriveSocialAdCandidateState } from '../apps/worker/src/social-ad-workflow.js'

describe('social-ad candidate parent state', () => {
  it('waits for candidate generation while jobs are queued or processing', () => {
    const state = deriveSocialAdCandidateState([
      { id: 'candidate-1', status: 'completed', artifactId: 'artifact-1', sceneNumber: 1 },
      { id: 'candidate-2', status: 'processing', sceneNumber: 2 },
      { id: 'candidate-3', status: 'queued', sceneNumber: 3 },
    ])
    expect(state.phase).toBe('candidate_generation')
    expect(state.completed).toBe(1)
    expect(state.processing).toBe(1)
    expect(state.queued).toBe(1)
    expect(state.progress).toBeGreaterThan(5)
    expect(state.progress).toBeLessThan(55)
  })

  it('advances to quality selection only when every candidate has an artifact', () => {
    const state = deriveSocialAdCandidateState([
      { id: 'candidate-1', status: 'completed', artifactId: 'artifact-1', sceneNumber: 1 },
      { id: 'candidate-2', status: 'completed', artifactId: 'artifact-2', sceneNumber: 2 },
      { id: 'candidate-3', status: 'completed', artifactId: 'artifact-3', sceneNumber: 3 },
    ])
    expect(state.phase).toBe('candidate_quality_pending')
    expect(state.completeWithArtifacts).toBe(true)
    expect(state.artifactIds).toEqual(['artifact-1', 'artifact-2', 'artifact-3'])
    expect(state.progress).toBe(55)
  })

  it('does not treat completed jobs without durable artifacts as quality-ready', () => {
    const state = deriveSocialAdCandidateState([
      { id: 'candidate-1', status: 'completed', artifactId: 'artifact-1', sceneNumber: 1 },
      { id: 'candidate-2', status: 'completed', artifactId: null, sceneNumber: 2 },
    ])
    expect(state.completeWithArtifacts).toBe(false)
    expect(state.phase).toBe('candidate_generation')
  })

  it('preserves retryable partial failures instead of falsely completing the workflow', () => {
    const state = deriveSocialAdCandidateState([
      { id: 'candidate-1', status: 'completed', artifactId: 'artifact-1', sceneNumber: 1 },
      { id: 'candidate-2', status: 'failed', retryCount: 1, error: 'provider timeout', sceneNumber: 2 },
    ])
    expect(state.phase).toBe('partial_candidate_failure')
    expect(state.retryableFailures).toEqual([{
      jobId: 'candidate-2', candidateIndex: 2, retryCount: 1, error: 'provider timeout',
    }])
  })

  it('terminalizes generation only when every candidate failed or was cancelled', () => {
    const state = deriveSocialAdCandidateState([
      { id: 'candidate-1', status: 'failed', retryCount: 3, sceneNumber: 1 },
      { id: 'candidate-2', status: 'cancelled', sceneNumber: 2 },
    ])
    expect(state.phase).toBe('candidate_generation_failed')
    expect(state.allFailed).toBe(true)
  })
})

describe('parent workflow classification', () => {
  it('keeps long-form and social-ad state machines separate', () => {
    expect(classifyParentWorkflow({ capability: 'long_form_video', metadataJson: '{}' })).toBe('long_form_video')
    expect(classifyParentWorkflow({ capability: 'social_content_generation', metadataJson: JSON.stringify({ socialAdVideo: true }) })).toBe('social_ad_video')
    expect(classifyParentWorkflow({ capability: 'social_content_generation', metadataJson: '{}' })).toBe('unknown')
  })
})
