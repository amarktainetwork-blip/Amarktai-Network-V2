import { describe, expect, it } from 'vitest'
import { getExecutorRegistration, isExecutorModelCompatible } from './executor-registry.js'

const compatibleMetadata = {
  category: 'image-to-image',
  taskType: 'image-to-image',
  capabilities: ['image_edit', 'image_to_image'],
  modalitiesIn: ['text', 'image'],
  modalitiesOut: ['image'],
  transportProfile: 'openai_images_edits_multipart',
  endpointFamily: 'deepinfra_openai_v1/images_edits',
  endpointShapeKnown: true,
  requestShapeKnown: true,
  responseShapeKnown: true,
  providerClientExists: true,
  workerExecutorExists: true,
} as const

describe('DeepInfra image transform executor registrations', () => {
  it.each(['image_edit', 'image_to_image'] as const)('registers %s only for the exact multipart image-edit contract', (capability) => {
    const registration = getExecutorRegistration(capability, 'deepinfra')
    expect(registration).toMatchObject({
      id: 'deepinfra.task-inference',
      handlerName: 'executeDeepInfraTaskCapability',
      sourceArtifactRequired: true,
      artifactOutput: 'image',
      executionMode: 'queued',
    })
    expect(isExecutorModelCompatible(registration!, 'provider/image-edit-model', compatibleMetadata)).toBe(true)
  })

  it('does not treat text-to-image or JSON-native models as image transform executors', () => {
    const registration = getExecutorRegistration('image_edit', 'deepinfra')!
    expect(isExecutorModelCompatible(registration, 'provider/text-to-image-model', {
      ...compatibleMetadata,
      category: 'text-to-image',
      taskType: 'text-to-image',
      capabilities: ['image_generation'],
      modalitiesIn: ['text'],
      transportProfile: 'native_inference_binary',
      endpointFamily: 'deepinfra_native_v1/native_inference',
    })).toBe(false)
  })
})
