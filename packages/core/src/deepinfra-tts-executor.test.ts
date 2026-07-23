import { describe, expect, it } from 'vitest'
import { getExecutorRegistration, isExecutorModelCompatible } from './executor-registry.js'

describe('DeepInfra TTS executor registration', () => {
  it('accepts discovered text-to-speech models only through the audio speech contract', () => {
    const registration = getExecutorRegistration('tts', 'deepinfra')
    expect(registration).toMatchObject({
      id: 'deepinfra.task-inference',
      sourceArtifactRequired: false,
      artifactOutput: 'audio',
      executionMode: 'queued',
    })
    expect(isExecutorModelCompatible(registration!, 'hexgrad/Kokoro-82M', {
      category: 'text-to-speech',
      taskType: 'text-to-speech',
      capabilities: ['tts'],
      modalitiesIn: ['text'],
      modalitiesOut: ['audio'],
      transportProfile: 'openai_audio_speech_binary',
      endpointFamily: 'deepinfra_v1/audio_speech',
      endpointShapeKnown: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
    })).toBe(true)
  })

  it('rejects native JSON metadata for the same capability', () => {
    const registration = getExecutorRegistration('tts', 'deepinfra')!
    expect(isExecutorModelCompatible(registration, 'provider/unknown-tts', {
      category: 'text-to-speech',
      taskType: 'text-to-speech',
      capabilities: ['tts'],
      modalitiesIn: ['text'],
      modalitiesOut: ['audio'],
      transportProfile: 'native_inference_json',
      endpointFamily: 'deepinfra_native_v1/native_inference',
      endpointShapeKnown: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
    })).toBe(false)
  })
})
