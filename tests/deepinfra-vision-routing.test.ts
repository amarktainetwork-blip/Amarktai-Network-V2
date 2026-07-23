import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getExecutorRegistration,
  isExecutorModelCompatible,
  type ExecutorModelMetadata,
} from '../packages/core/src/executor-registry.js'

function visionMetadata(capability: string): ExecutorModelMetadata {
  return {
    taskType: 'vision',
    category: 'vision',
    capabilities: [capability],
    modalitiesIn: ['text', 'image'],
    modalitiesOut: ['text'],
    transportProfile: 'openai_chat_sse',
    endpointFamily: 'deepinfra_openai_v1/openai_chat',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
  }
}

describe('DeepInfra vision executor registration', () => {
  it('selects a compatible live-metadata vision route for video understanding', () => {
    const registration = getExecutorRegistration('video_understanding', 'deepinfra')
    expect(registration?.id).toBe('deepinfra.vision')
    expect(registration?.compatibleModels).toEqual([])
    expect(isExecutorModelCompatible(registration!, 'new-account-vision-model', visionMetadata('video_understanding'))).toBe(true)
  })

  it('rejects text-only and incomplete models', () => {
    const registration = getExecutorRegistration('video_understanding', 'deepinfra')!
    expect(isExecutorModelCompatible(registration, 'text-only', {
      ...visionMetadata('video_understanding'),
      modalitiesIn: ['text'],
    })).toBe(false)
    expect(isExecutorModelCompatible(registration, 'unknown-shape', {
      ...visionMetadata('video_understanding'),
      responseShapeKnown: false,
    })).toBe(false)
  })

  it('activates the handler in the production worker without a model allowlist', () => {
    const worker = readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url), 'utf8')
    const registration = readFileSync(new URL('../apps/worker/src/providers/vision-handler-registration.ts', import.meta.url), 'utf8')
    expect(worker).toContain("import './providers/vision-handler-registration.js'")
    expect(registration).toContain("DIRECT_EXECUTOR_HANDLERS['deepinfra.vision']")
    expect(registration).not.toMatch(/llama|qwen|gemma|modelId\s*=/i)
  })
})
