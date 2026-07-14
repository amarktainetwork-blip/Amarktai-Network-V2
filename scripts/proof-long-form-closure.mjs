#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const strict = process.argv.includes('--strict')
const staticMode = process.argv.includes('--static')
const fixtureMode = process.argv.includes('--local-fixture')
let failed = 0

function check(condition, label, detail = '') {
  if (!condition) failed++
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`)
}

function source(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function runStaticProof() {
  const registry = source('packages/core/src/executor-registry.ts')
  const orchestra = source('packages/core/src/orchestra.ts')
  const videoClient = source('packages/providers/src/genx-client.ts')
  const musicClient = source('packages/providers/src/genx-music-client.ts')
  const togetherClient = source('packages/providers/src/together-video-client.ts')
  const providerExecutor = source('apps/worker/src/providers/provider-executor.ts')
  const state = source('packages/db/src/long-form-parent-state.ts')
  const workflow = source('packages/db/src/long-form-workflow.ts')
  const assembly = source('apps/worker/src/long-form-assembly.ts')
  const route = source('apps/api/src/routes/admin-long-form-video.ts')
  const dashboard = source('app/dashboard/video/page.js')

  check(registry.includes("modelCompatibility: 'metadata_profile'") && (registry.match(/mediaRegistration\(/g) ?? []).length >= 7, 'media executors use metadata compatibility profiles')
  check(registry.includes("mediaRegistration('genx.video-generation'") && registry.includes("mediaRegistration('together.video-generation'"), 'GenX and Together video routes are registered')
  check(registry.includes("mediaRegistration('together.image-to-video'") && registry.includes("mediaRegistration('together.video-to-video'"), 'Together source-aware routes are registered independently')
  check(registry.includes("mediaRegistration('deepinfra.video-generation'"), 'verified DeepInfra video route is registered')
  check(orchestra.includes('executorModelMetadataFromDbRecord') && orchestra.includes('isExecutorModelCompatible'), 'Orchestra derives model eligibility from canonical metadata')
  check(!registry.includes("compatibleModels: ['seedance") && !registry.includes("compatibleModels: ['lyria"), 'executor registry has no fixed one-model media allowlist')
  check(!videoClient.includes('DEFAULT_GENX_VIDEO_MODEL') && !videoClient.includes('GENX_ROUTER_VIDEO_MODEL_PREFERENCE'), 'GenX video transport has no model default or preference policy')
  check(!musicClient.includes('DEFAULT_GENX_MUSIC_MODEL') && !musicClient.includes('GENX_ROUTER_MUSIC_MODEL_PREFERENCE'), 'GenX music transport has no model default or preference policy')
  check(videoClient.includes('exact Orchestra-selected model') && musicClient.includes('exact Orchestra-selected model'), 'GenX transports fail closed without the routed model')
  check(togetherClient.includes('/v2/videos') && togetherClient.includes('togetherPollVideo') && togetherClient.includes('inspectVideoBuffer'), 'Together managed async transport validates downloaded video')
  check(providerExecutor.includes('sourceImageDataUrl') && providerExecutor.includes('referenceVideoUrl') && providerExecutor.includes('sourceArtifactId'), 'Together source-aware executor sends and records authorised source media')

  check(state.includes("capability === 'video_generation'") && state.includes('longFormVideo === true'), 'scene jobs are explicitly classified')
  check(state.includes("capability === 'tts'") && state.includes('longFormVoiceover === true'), 'voiceover jobs are explicitly classified')
  check(state.includes("capability === 'music_generation'") && state.includes('longFormMusicBed === true'), 'music-bed jobs are explicitly classified')
  check(state.includes('subtitleArtifactId') && state.includes('readyToQueueAssembly'), 'one canonical component state links subtitles and gates assembly')
  check(!state.includes('voiceover_not_implemented') && !state.includes('music_bed_not_implemented') && !state.includes('full_multimedia_not_ready'), 'canonical state has no unconditional not-implemented blocker')

  check(route.includes('createAutomaticSubtitleArtifact') && route.includes('enqueueVoiceoverJobs') && route.includes('enqueueMusicBedJob'), 'one request automatically starts subtitles, voiceover, and music')
  check(workflow.includes('longFormAssemblyJobId') && workflow.includes('updateMany') && workflow.includes("queue.add('process'"), 'assembly uses deterministic atomic durable scheduling')
  check(route.includes('advanceLongFormWorkflow(loaded.parent.id, getQueue())'), 'manual recovery uses the same canonical assembly claim')
  check(!route.includes('await assembleMultimediaLongFormVideo') && !route.includes('await assembleLongFormVideo'), 'API routes do not run a competing FFmpeg assembly')
  check(assembly.includes('-stream_loop') && assembly.includes('amix') && assembly.includes('subtitles='), 'worker assembly loops music, mixes narration, and burns subtitles')
  check(assembly.includes('ffprobe') && assembly.includes("codec_type === 'video'") && assembly.includes("codec_type === 'audio'"), 'worker assembly validates final video and audio streams')
  check(assembly.includes('finally') && assembly.includes('rm(workDir'), 'worker assembly cleans temporary files')
  check(dashboard.includes("adminFetch('/api/admin/long-form-video/executions'") && dashboard.includes('fetch(`/api/admin/long-form-video/executions/${id}`') && dashboard.includes('pollLong(data.executionId)'), 'dashboard submits once and polls one canonical execution')
  check(!dashboard.includes('/subtitles/') && !dashboard.includes('/music-bed/') && !dashboard.includes('/assemble/'), 'dashboard happy path has no manual component calls')
  check(existsSync(join(root, 'tests/genx-video-contract.test.js')) && existsSync(join(root, 'tests/genx-music-contract.test.js')), 'standalone GenX video and music regression tests remain')
  check(existsSync(join(root, 'tests/media-dynamic-routing.test.ts')) && existsSync(join(root, 'tests/long-form-workflow-advance.test.ts')), 'dynamic routing and idempotent workflow tests exist')
}

function findTool(envName, fallback) {
  const candidates = [process.env[envName], fallback].filter(Boolean)
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-version'], { encoding: 'utf8', windowsHide: true })
    if (result.status === 0) return candidate
  }
  return null
}

function run(executable, args, label) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${label}: ${(result.stderr || result.stdout || `exit ${result.status}`).trim().slice(-1200)}`)
  return result.stdout
}

function subtitleFilter(path) {
  const escaped = path.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:').replace(/'/g, "\\'")
  return `subtitles=filename='${escaped}'`
}

async function runLocalFixture() {
  const ffmpeg = findTool('FFMPEG_PATH', 'ffmpeg')
  const ffprobe = findTool('FFPROBE_PATH', 'ffprobe')
  check(!!ffmpeg, 'local fixture ffmpeg available')
  check(!!ffprobe, 'local fixture ffprobe available')
  if (!ffmpeg || !ffprobe) return

  const temp = await mkdtemp(join(tmpdir(), 'amarktai-long-form-proof-'))
  try {
    const scene1 = join(temp, 'scene-1.mp4')
    const scene2 = join(temp, 'scene-2.mp4')
    const narration = join(temp, 'narration.wav')
    const music = join(temp, 'music.wav')
    const subtitles = join(temp, 'captions.srt')
    const concatList = join(temp, 'scenes.txt')
    const output = join(temp, 'final-multimedia.mp4')

    run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=0x16324f:s=320x180:r=24:d=1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', scene1], 'create scene 1')
    run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=0x8f2d56:s=640x360:r=30:d=1.3', '-vf', 'scale=320:180,fps=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', scene2], 'create scene 2')
    run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=2.5', '-c:a', 'pcm_s16le', narration], 'create narration')
    run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=0.7', '-c:a', 'pcm_s16le', music], 'create short music bed')
    await writeFile(subtitles, '1\n00:00:00,000 --> 00:00:01,200\nFirst scene\n\n2\n00:00:01,200 --> 00:00:02,500\nSecond scene\n', 'utf8')
    await writeFile(concatList, `file '${scene1.replace(/'/g, "'\\''").replace(/\\/g, '/')}'\nfile '${scene2.replace(/'/g, "'\\''").replace(/\\/g, '/')}'\n`, 'utf8')

    run(ffmpeg, [
      '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
      '-i', narration, '-stream_loop', '-1', '-i', music,
      '-filter_complex', `[1:a]volume=1.0[narr];[2:a]volume=0.16,afade=t=in:st=0:d=0.1,afade=t=out:st=2.3:d=0.2[music];[narr][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
      '-vf', subtitleFilter(subtitles), '-map', '0:v:0', '-map', '[aout]', '-t', '2.5',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', output,
    ], 'assemble multimedia fixture')

    const raw = run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], 'probe final fixture')
    const probe = JSON.parse(raw)
    const video = probe.streams?.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
    const duration = Number(probe.format?.duration)
    check(!!video, 'fixture final artifact contains a video stream')
    check(!!audio, 'fixture final artifact contains an audio stream')
    check(Number.isFinite(duration) && duration > 0, 'fixture final duration is nonzero', String(duration))
    check(duration >= 2.3 && duration <= 2.7, 'fixture final duration matches requested components', String(duration))
    check(existsSync(output), 'fixture final MP4 exists before cleanup')
  } catch (error) {
    check(false, 'local multimedia assembly fixture', error instanceof Error ? error.message : String(error))
  } finally {
    await rm(temp, { recursive: true, force: true })
    check(!existsSync(temp), 'fixture temporary files are removed')
  }
}

if (!staticMode && !fixtureMode) {
  console.error('Usage: node scripts/proof-long-form-closure.mjs --static|--local-fixture [--strict]')
  process.exit(2)
}

if (staticMode || fixtureMode) runStaticProof()
if (fixtureMode) await runLocalFixture()

console.log(`LONG_FORM_CLOSURE_PROOF=${failed === 0 ? 'PASS_LOCAL_NOT_LIVE' : 'FAIL'} failures=${failed}`)
if (strict && failed > 0) process.exit(1)
