import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ATOMIC_CAPABILITY_KEYS,
  CAPABILITY_KEYS,
  COMPOSITE_CAPABILITY_KEYS,
  EXECUTOR_REGISTRATIONS,
  getRuntimeTruth,
  resolveStructuredOutputContract,
} from '../packages/core/src/index.ts'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
const fixture = (path: string) => JSON.parse(source(path))

describe('final platform recovery contract', () => {
  it('derives disjoint atomic/composite counts and canonical truth metrics', () => {
    expect(new Set([...ATOMIC_CAPABILITY_KEYS, ...COMPOSITE_CAPABILITY_KEYS]).size).toBe(CAPABILITY_KEYS.length)
    expect(ATOMIC_CAPABILITY_KEYS.filter((key) => COMPOSITE_CAPABILITY_KEYS.includes(key as never))).toEqual([])
    const truth = getRuntimeTruth()
    expect(truth.metrics.atomicCapabilityCount).toBe(ATOMIC_CAPABILITY_KEYS.length)
    expect(truth.metrics.compositeCapabilityCount).toBe(COMPOSITE_CAPABILITY_KEYS.length)
    expect(truth.metrics.callableCapabilityCount).toBe(ATOMIC_CAPABILITY_KEYS.length + COMPOSITE_CAPABILITY_KEYS.length)
  })

  it('uses transport/task executor profiles and distinct stream registrations without model IDs', () => {
    expect(EXECUTOR_REGISTRATIONS.every((entry) => entry.modelCompatibility === 'transport_task_profile' && entry.compatibleModels.length === 0)).toBe(true)
    expect(EXECUTOR_REGISTRATIONS.find((entry) => entry.id === 'deepinfra.chat')?.executionMode).toBe('queued')
    expect(EXECUTOR_REGISTRATIONS.find((entry) => entry.id === 'deepinfra.streaming-chat')?.executionMode).toBe('stream')
    const registry = source('packages/core/src/executor-registry.ts')
    expect(registry).not.toMatch(/compatibleModels:\s*\[["']/)
  })

  it('selects truthful structured-output enforcement modes', () => {
    expect(resolveStructuredOutputContract(['json_schema', 'json_object'])).toMatchObject({ selectedMode: 'json_schema', validationMode: 'provider_json_schema' })
    expect(resolveStructuredOutputContract(['json_object'])).toMatchObject({ selectedMode: 'json_object', validationMode: 'provider_json_object_local_schema' })
    expect(resolveStructuredOutputContract([])).toMatchObject({ selectedMode: 'none', validationMode: 'prompt_json_local_schema' })
  })

  it('contains a complete deterministic avatar app onboarding fixture', () => {
    const avatar = fixture('scripts/fixtures/avatar-app-onboarding.json')
    for (const key of ['chat', 'streaming_chat', 'image_generation', 'image_edit', 'tts', 'voice_clone', 'stt', 'avatar_generation', 'lip_sync', 'video_generation', 'image_to_video', 'long_form_video', 'music_generation']) {
      expect(avatar.capabilities).toContain(key)
    }
    expect(avatar.permissions).toMatchObject({ voiceSelection: true, voiceCloneConsentRequired: true, artifactRead: true, artifactWrite: true, memoryRead: true, approvalRequired: true, webhooks: true })
    expect(source('scripts/proof-avatar-app-onboarding.mjs')).toContain("process.argv.includes('--apply')")
  })

  it('keeps both paid advert proofs explicit and materially unrelated', () => {
    const course = fixture('scripts/fixtures/course2career-advert.json')
    const second = fixture('scripts/fixtures/harbourlight-advert.json')
    expect(course).toMatchObject({ brandName: 'Course2Career', targetDurationSeconds: 30, sceneCount: 3, aspectRatio: '16:9' })
    expect(second).toMatchObject({ brandName: 'HarbourLight', targetDurationSeconds: 30, sceneCount: 3, aspectRatio: '16:9' })
    expect(second.audience).not.toBe(course.audience)
    expect(second.musicBrief).not.toBe(course.musicBrief)
    expect(source('scripts/lib/manual-long-form-live.mjs')).toContain("process.argv.includes('--confirm-paid-live')")
  })

  it('has read-only inventory, dry-run planning, and host-guarded cleanup', () => {
    const inventory = source('deploy/vps-inventory.sh')
    const planner = source('deploy/vps-cleanup-plan.sh')
    const cleanup = source('deploy/vps-cleanup.sh')
    expect(inventory).toContain('docker system df')
    expect(planner).toContain('Nothing was deleted')
    expect(cleanup).toContain('--confirm-host')
    expect(cleanup).not.toContain('docker volume prune')
    expect(cleanup).not.toContain('docker compose down -v')
  })

  it('contains no fake production voice model or global voice default', () => {
    const sources = [
      source('packages/providers/src/genx-voice-client.ts'),
      source('packages/core/src/direct-provider-contracts.ts'),
      source('apps/api/src/routes/admin-long-form-video.ts'),
      source('packages/core/src/model-catalog.ts'),
    ].join('\n')
    expect(sources).not.toContain('genx-tts-v1')
    expect(sources).not.toContain('genx-stt-v1')
    expect(sources).not.toContain("'tara'")
  })

  it('keeps removed and coding-only providers outside runtime execution', () => {
    const truth = getRuntimeTruth()
    expect(truth.providerPolicy.runtimeExecutionProviders).toEqual(['genx', 'together', 'deepinfra'])
    expect(truth.providerPolicy.codingOnlyProviders).toEqual(['mimo'])
    expect(truth.providers.some((provider) => provider.provider === 'groq')).toBe(false)
  })
})
