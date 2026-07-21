import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  canReadSourceArtifactForApp,
  createCanonicalProviderUsage,
  type CapabilityKey,
  type ProviderKey,
} from '@amarktai/core'
import { findCompletedArtifactByTraceId, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const runFile = promisify(execFile)
const FIXTURE_SWITCH = 'release-candidate-v1'
const FIXTURE_SAFETY_TOKEN = 'amarktai-release-fixture-local-ci-v1'

function hasFixtureDatabase(): boolean {
  try {
    const database = new URL(process.env.DATABASE_URL ?? '')
    return database.hostname === 'mariadb' && database.pathname === '/amarktai_fixture'
  } catch {
    return false
  }
}

export function isReleaseFixtureAdapterEnabled(): boolean {
  return process.env.NODE_ENV === 'test'
    && process.env.RELEASE_FIXTURE_MODE === 'true'
    && process.env.RELEASE_FIXTURE_SAFETY_TOKEN === FIXTURE_SAFETY_TOKEN
    && process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === FIXTURE_SWITCH
    && hasFixtureDatabase()
}

export function assertFixtureAdapterConfiguration(): void {
  const configured = [
    process.env.AMARKTAI_TEST_FIXTURE_ADAPTER,
    process.env.RELEASE_FIXTURE_MODE,
    process.env.RELEASE_FIXTURE_SAFETY_TOKEN,
  ].some((value) => Boolean(value?.trim()))
  if (configured && !isReleaseFixtureAdapterEnabled()) {
    throw new Error('Release fixture execution requires the exact test-only adapter, mode, safety token, and disposable MariaDB target')
  }
}

function fixtureRoute(capability: CapabilityKey): { provider: ProviderKey; model: string } {
  if (capability === 'image_generation') {
    return { provider: 'together', model: `fixture/${capability}` }
  }
  if (capability === 'video_generation' || capability === 'image_to_video' || capability === 'video_to_video'
    || capability === 'music_generation' || capability === 'song_generation'
    || capability === 'tts' || capability === 'stt') {
    return { provider: 'genx', model: `fixture/${capability}` }
  }
  if (capability === 'embeddings' || capability === 'feature_extraction' || capability === 'sentence_similarity' || capability === 'reranking') {
    return { provider: 'deepinfra', model: `fixture/${capability}` }
  }
  return { provider: 'deepinfra', model: `fixture/${capability}` }
}

function textResult(payload: WorkerJobData, provider: ProviderKey, model: string): ProcessorResult {
  const prompt = payload.prompt.trim()
  let output: unknown = `Fixture response for: ${prompt}`
  if (payload.capability === 'structured_output') output = { fixture: true, summary: prompt.slice(0, 80) }
  if (payload.capability === 'classification' || payload.capability === 'zero_shot_classification') output = { label: 'fixture_label', score: 0.99 }
  if (payload.capability === 'token_classification') output = [{ entity: 'FIXTURE', word: prompt.split(/\s+/)[0] || 'fixture', score: 0.99 }]
  if (payload.capability === 'fill_mask') output = [{ token_str: 'fixture', score: 0.99 }]
  if (payload.capability === 'table_qa') output = { answer: 'fixture answer', coordinates: [[0, 0]] }
  if (payload.capability === 'embeddings' || payload.capability === 'feature_extraction') {
    const texts = Array.isArray(payload.input?.texts) && payload.input.texts.length > 0 ? payload.input.texts : [prompt]
    output = { vectors: texts.map(() => [0.1, 0.2, 0.3, 0.4]), dimensions: 4 }
  }
  if (payload.capability === 'sentence_similarity') output = { scores: [0.99] }
  if (payload.capability === 'reranking') {
    const documents = Array.isArray(payload.input?.documents) ? payload.input.documents : []
    output = {
      results: documents.map((document, index) => ({
        index,
        score: Math.max(0.5, 0.99 - index * 0.01),
        text: typeof document === 'object' && document !== null && 'text' in document
          ? String((document as Record<string, unknown>).text ?? '')
          : String(document ?? ''),
      })),
    }
  }
  if (payload.capability === 'question_answering') {
    const sourceIds = Array.isArray(payload.input?.sourceIds)
      ? payload.input.sourceIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    output = {
      answer: 'AmarktAI Network owns provider routing, model selection, grants, durable execution, evidence, artifacts, quality gates, budgets, memory and RAG.',
      supportedByContext: sourceIds.length > 0,
      sourceIds: sourceIds.slice(0, 1),
    }
  }
  if (payload.capability === 'stt') output = { transcript: 'Deterministic fixture transcription.', language: 'en', duration: 2, segments: [] }

  return {
    success: true,
    status: 'completed',
    provider,
    model,
    output: typeof output === 'string' ? output : JSON.stringify(output),
    metadata: {
      evidenceSource: 'local_fixture',
      liveProviderProof: false,
      usage: createCanonicalProviderUsage({ provider, model, inputTokens: 4, outputTokens: 8, totalTokens: 12 }),
      outputValidation: { valid: true, contract: 'deterministic_release_fixture' },
    },
  }
}

async function verifySourceArtifact(payload: WorkerJobData): Promise<string | null> {
  if (!['image_to_video', 'video_to_video', 'stt'].includes(payload.capability)) return null
  const sourceId = typeof payload.input?.sourceArtifactId === 'string'
    ? payload.input.sourceArtifactId
    : typeof payload.input?.sourceImageArtifactId === 'string'
      ? payload.input.sourceImageArtifactId
      : typeof payload.input?.sourceVideoArtifactId === 'string'
        ? payload.input.sourceVideoArtifactId
        : typeof payload.input?.audioArtifactId === 'string'
          ? payload.input.audioArtifactId
          : typeof payload.input?.artifactId === 'string'
            ? payload.input.artifactId
            : null
  if (!sourceId) throw new Error(`Fixture ${payload.capability} requires a source artifact`)
  const source = await getArtifactRecord(sourceId)
  if (!source || source.status !== 'completed' || !canReadSourceArtifactForApp(payload.appSlug, source.appSlug)) {
    throw new Error('Authorised source artifact was not found')
  }
  const expected = payload.capability === 'image_to_video' ? 'image/' : payload.capability === 'video_to_video' ? 'video/' : 'audio/'
  if (!source.mimeType.startsWith(expected)) throw new Error(`Source artifact must have MIME type ${expected}*`)
  return sourceId
}

async function generateFixtureMedia(capability: CapabilityKey): Promise<{ data: Buffer; mimeType: string; type: 'image' | 'video' | 'audio' | 'music'; duration?: number; width?: number; height?: number }> {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const dir = await mkdtemp(join(tmpdir(), 'amarktai-release-fixture-'))
  try {
    if (capability === 'image_generation') {
      const output = join(dir, 'fixture.png')
      await runFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x14532d:s=320x180:d=0.1', '-frames:v', '1', '-threads', '1', '-y', output])
      return { data: await readFile(output), mimeType: 'image/png', type: 'image', width: 320, height: 180 }
    }
    if (capability === 'tts' || capability === 'music_generation' || capability === 'song_generation') {
      const output = join(dir, 'fixture.wav')
      const frequency = capability === 'tts' ? '660' : '330'
      await runFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=2`, '-ac', '1', '-c:a', 'pcm_s16le', '-y', output])
      return { data: await readFile(output), mimeType: 'audio/wav', type: capability === 'tts' ? 'audio' : 'music', duration: 2 }
    }
    if (capability === 'stt') {
      const transcriptData = JSON.stringify({ text: 'Deterministic fixture transcription.', language: 'en', duration: 2, segments: [] })
      return { data: Buffer.from(transcriptData), mimeType: 'application/json', type: 'audio', duration: 2 }
    }
    const output = join(dir, 'fixture.mp4')
    await runFile(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=0x172554:s=320x180:r=24:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-movflags', '+faststart', '-y', output,
    ])
    return { data: await readFile(output), mimeType: 'video/mp4', type: 'video', duration: 2, width: 320, height: 180 }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function executeReleaseFixture(payload: WorkerJobData): Promise<ProcessorResult> {
  if (!isReleaseFixtureAdapterEnabled()) throw new Error('Release fixture adapter is not enabled')
  const capability = payload.capability as CapabilityKey
  const { provider, model } = fixtureRoute(capability)
  const grant = payload.appGrantSnapshot
  if (['image_to_video', 'video_to_video', 'stt'].includes(capability) && !grant?.artifactRead) {
    return { success: false, status: 'failed', provider, model, error: `AppCapabilityGrant denies source-artifact read for '${capability}'.` }
  }
  if (['image_generation', 'video_generation', 'image_to_video', 'video_to_video', 'music_generation', 'song_generation', 'tts', 'stt'].includes(capability) && !grant?.artifactWrite) {
    return { success: false, status: 'failed', provider, model, error: `AppCapabilityGrant denies artifact write for '${capability}'.` }
  }
  const sourceArtifactId = await verifySourceArtifact(payload)

  if (!['image_generation', 'video_generation', 'image_to_video', 'video_to_video', 'music_generation', 'song_generation', 'tts', 'stt'].includes(capability)) {
    return textResult(payload, provider, model)
  }

  const existing = await findCompletedArtifactByTraceId(payload.traceId, capability)
  if (existing) {
    return {
      success: true,
      status: 'completed',
      provider,
      model,
      artifactId: existing.id,
      output: JSON.stringify({ artifactId: existing.id, artifactUrl: existing.storageUrl, mimeType: existing.mimeType, fileSizeBytes: existing.fileSizeBytes, reused: true }),
      metadata: { evidenceSource: 'local_fixture', liveProviderProof: false, outputValidation: { valid: true, contract: 'reused_release_fixture_artifact' } },
    }
  }

  const media = await generateFixtureMedia(capability)
  const artifact = await saveArtifact({
    input: {
      appSlug: payload.appSlug,
      type: media.type,
      subType: capability,
      title: `${capability} deterministic fixture`,
      description: 'Local release-candidate fixture evidence; never live provider proof.',
      provider,
      model,
      traceId: payload.traceId,
      mimeType: media.mimeType,
      metadata: {
        capability,
        provider,
        model,
        source: 'deterministic local fixture',
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        sourceArtifactId,
        duration: media.duration,
        width: media.width,
        height: media.height,
        longFormVideo: payload.metadata?.longFormVideo === true,
        parentJobId: payload.metadata?.parentJobId,
        executionId: payload.metadata?.executionId,
        sceneNumber: payload.metadata?.sceneNumber,
      },
    },
    data: media.data,
    explicitMimeType: media.mimeType,
  })
  const output: Record<string, unknown> = {
    artifactId: artifact.id,
    artifactUrl: artifact.storageUrl,
    mimeType: artifact.mimeType,
    fileSizeBytes: artifact.fileSizeBytes,
    duration: media.duration,
    width: media.width,
    height: media.height,
    sourceArtifactId,
  }
  if (capability === 'stt') {
    const transcriptData = JSON.parse(media.data.toString('utf8'))
    output.transcript = transcriptData.text
    output.language = transcriptData.language
    output.segments = transcriptData.segments
  }
  return {
    success: true,
    status: 'completed',
    provider,
    model,
    artifactId: artifact.id,
    output: JSON.stringify(output),
    metadata: {
      ...output,
      evidenceSource: 'local_fixture',
      liveProviderProof: false,
      usage: createCanonicalProviderUsage({ provider, model, audioSeconds: media.type === 'audio' || media.type === 'music' ? media.duration : undefined, videoSeconds: media.type === 'video' ? media.duration : undefined, imageCount: media.type === 'image' ? 1 : undefined }),
      outputValidation: { valid: true, contract: 'ffmpeg_generated_release_fixture' },
    },
  }
}
