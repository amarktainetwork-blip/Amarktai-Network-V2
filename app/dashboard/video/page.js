'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/useStudioStore'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { getRuntimeCapabilityProof, runtimeProofStatusClasses, runtimeProofStatusLabel } from '@/lib/runtime-proof-status'
import { Video, Zap, Clock, Film, Loader2, Download, Send } from 'lucide-react'

const QUALITY_MODES = ['Balanced', 'Premium', 'Fast', 'Budget']
const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4']

export default function VideoStudioPage() {
  const [mode, setMode] = useState('short')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobResult, setJobResult] = useState(null)
  const [longResult, setLongResult] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [longOptions, setLongOptions] = useState({ targetDurationSeconds: 60, sceneCount: 5, voiceoverEnabled: true, subtitlesEnabled: true, musicBedEnabled: true })
  const pollRef = useRef(null)
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const shortProof = getRuntimeCapabilityProof(runtimeProofStatus, 'video_generation')
  const shortReady = shortProof.readyForDashboardExecution === true

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const handleSubmit = async () => {
    if (!prompt.trim() || !shortReady || submitting) return
    setSubmitting(true)
    setJobResult(null)
    try {
      const { submitJob, pollJob } = useStudioStore.getState()
      const input = { prompt: prompt.trim() }
      if (duration.trim()) input.duration = duration.trim()
      const result = await submitJob('video_generation', input)
      if (!result.ok || !result.jobId) {
        setJobResult({ status: 'failed', error: result.error })
        return
      }
      let attempts = 0
      let job = null
      while (attempts < 90) {
        job = await pollJob(result.jobId)
        if (!job || job.status === 'completed' || job.status === 'failed') break
        await new Promise((r) => setTimeout(r, 3000))
        attempts++
      }
      setJobResult(job || { status: 'timeout', error: 'Job polling timed out' })
    } catch (err) {
      setJobResult({ status: 'failed', error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const loadPreview = async (artifactId) => {
    const token = localStorage.getItem('amarktai_token')
    const response = await fetch(`/api/v1/artifacts/${artifactId}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!response.ok) throw new Error('Final video preview could not be loaded')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(await response.blob()))
  }

  const handleLongSubmit = async () => {
    if (!prompt.trim() || submitting) return
    setSubmitting(true); setLongResult(null)
    try {
      const token = localStorage.getItem('amarktai_token')
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const response = await fetch('/api/admin/long-form-video/executions', { method: 'POST', headers, body: JSON.stringify({ request: {
        prompt: prompt.trim(), aspectRatio: '16:9', style: 'cinematic', tone: 'professional', count: 1, routingMode: 'balanced', ...longOptions,
      } }) })
      const created = await response.json()
      if (!response.ok || !created.executionId) throw new Error(created.details || created.message || 'Long-form submission failed')
      setLongResult(created.status)
      for (let attempt = 0; attempt < 600; attempt++) {
        const statusResponse = await fetch(`/api/admin/long-form-video/executions/${created.executionId}`, { headers })
        const body = await statusResponse.json()
        if (!statusResponse.ok) throw new Error(body.message || 'Long-form status failed')
        const status = body.execution
        setLongResult(status)
        if (status.parent?.status === 'completed' && status.finalArtifactId) { await loadPreview(status.finalArtifactId); break }
        if (status.parent?.status === 'cancelled' || status.componentState?.assembly?.jobId && status.blockedReasons?.includes('assembly_failed')) break
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    } catch (error) {
      setLongResult({ parent: { status: 'failed', error: error.message }, blockedReasons: [error.message] })
    } finally { setSubmitting(false) }
  }

  const downloadFinal = async () => {
    if (!longResult?.finalArtifactId) return
    const token = localStorage.getItem('amarktai_token')
    const response = await fetch(`/api/v1/artifacts/${longResult.finalArtifactId}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!response.ok) return
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a'); link.href = url; link.download = `long-form-${longResult.executionId}.mp4`; link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Video Studio" subtitle="Create short or automatic long-form video. Orchestra handles provider and model routing." />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Short Video</span>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">
              <Film className="mr-1 h-2.5 w-2.5" /> Live
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Orchestra-routed approved provider transport</p>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Image-to-Video</span>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Routed
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Together source-aware transport; artifact permission required</p>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Long-Form Video</span>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[9px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Automatic
            </Badge>
          </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Scenes, narration, subtitles, music, and final assembly progress automatically.</p>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Storyboard</span>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Automatic
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Scene planning and outline</p>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Voiceover / Subtitles</span>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[9px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Automatic
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Canonical TTS, deterministic subtitles, and FFmpeg burn-in</p>
        </Card>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('short')}
                className={`rounded-md border px-4 py-2 text-xs transition ${mode === 'short' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
              >
                <Film className="mr-1.5 inline h-3 w-3" /> Short Video
              </button>
              <button
                onClick={() => setMode('long')}
                className={`rounded-md border px-4 py-2 text-xs transition ${mode === 'long' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
              >
                <Clock className="mr-1.5 inline h-3 w-3" /> Long-Form Video
              </button>
            </div>
          </div>

          {mode === 'short' && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Scene / Prompt</label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the video scene..."
                  className="min-h-[80px] bg-white/[0.04] text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium">Duration target (optional)</label>
                <Input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 5s, 10s"
                  className="bg-white/[0.04] text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
                  <Zap className="mr-1 h-2.5 w-2.5" /> Auto mode
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${runtimeProofStatusClasses(shortProof)}`}>
                  {runtimeProofStatusLabel(shortProof)}
                </Badge>
                <span className="text-[10px] text-muted-foreground">Platform selects provider and model</span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || !shortReady || submitting}
                  className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"
                >
                  {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Send className="mr-1.5 h-3 w-3" />}
                  {submitting ? 'Rendering...' : 'Render'}
                </Button>
                {!shortReady && (
                  <span className="text-[10px] text-muted-foreground">
                    Disabled until backend proof passes.
                  </span>
                )}
              </div>
            </>
          )}

          {mode === 'long' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Video brief</label>
                <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the long-form video..." className="min-h-[100px] bg-white/[0.04] text-sm" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="number" min="30" max="600" value={longOptions.targetDurationSeconds} onChange={(event) => setLongOptions((value) => ({ ...value, targetDurationSeconds: Number(event.target.value) }))} aria-label="Target duration seconds" className="bg-white/[0.04] text-sm" />
                <Input type="number" min="2" max="20" value={longOptions.sceneCount} onChange={(event) => setLongOptions((value) => ({ ...value, sceneCount: Number(event.target.value) }))} aria-label="Scene count" className="bg-white/[0.04] text-sm" />
              </div>
              <div className="flex flex-wrap gap-2">
                {[['voiceoverEnabled', 'Voiceover'], ['subtitlesEnabled', 'Subtitles'], ['musicBedEnabled', 'Music bed']].map(([key, label]) => (
                  <button key={key} onClick={() => setLongOptions((value) => ({ ...value, [key]: !value[key] }))} className={`rounded-md border px-3 py-1.5 text-xs ${longOptions[key] ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] text-muted-foreground'}`}>{label}</button>
                ))}
              </div>
              <Button onClick={handleLongSubmit} disabled={!prompt.trim() || submitting} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
                {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Send className="mr-1.5 h-3 w-3" />}
                {submitting ? 'Building video...' : 'Create long-form video'}
              </Button>
              <p className="text-[10px] text-muted-foreground">One request creates and advances every enabled component. Provider and model selection remain hidden.</p>
            </div>
          )}
        </div>
      </Card>

      {mode === 'short' && jobResult && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Video className="h-4 w-4 text-cyan-300" /> Render Result</h3>

          {jobResult.status === 'completed' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <p className="text-xs font-semibold text-emerald-200">Job completed</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {jobResult.provider && <span>Provider: <span className="text-violet-300">{jobResult.provider}</span></span>}
                  {jobResult.model && <span>Model: <span className="font-mono text-[10px]">{jobResult.model}</span></span>}
                </div>
                {jobResult.artifactId && (
                  <div className="mt-3 flex items-center gap-2">
                    <Link href="/dashboard/artifacts" className="text-cyan-300 hover:underline flex items-center gap-1 text-xs">
                      <Download className="h-3 w-3" /> View artifact
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {jobResult.status === 'failed' && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-4">
              <p className="text-xs font-semibold text-rose-200">Job failed</p>
              {jobResult.error && <p className="mt-1 text-[10px] text-rose-300">{jobResult.error}</p>}
            </div>
          )}

          {jobResult.status !== 'completed' && jobResult.status !== 'failed' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <p className="text-xs text-amber-200">Job {jobResult.status || 'pending'}</p>
            </div>
          )}
        </Card>
      )}

      {mode === 'long' && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-cyan-300" /> Long-Form Workflow</h3>
          <div className="space-y-3">
            {!longResult && <p className="text-xs text-muted-foreground">Submit one request to start scenes, voiceover, subtitles, music, and final assembly.</p>}
            {longResult?.componentState && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <ComponentProgress label="Scenes" value={`${longResult.componentState.scenes.completedCount}/${longResult.componentState.scenes.requestedCount}`} ready={longResult.componentState.scenes.ready} />
                <ComponentProgress label="Voiceover" value={longResult.componentState.voiceover.requested ? `${longResult.componentState.voiceover.completedCount}/${longResult.componentState.voiceover.expectedCount}` : 'Off'} ready={longResult.componentState.voiceover.ready} />
                <ComponentProgress label="Subtitles" value={longResult.componentState.subtitles.generated ? longResult.componentState.subtitles.format?.toUpperCase() : 'Pending'} ready={longResult.componentState.subtitles.ready} />
                <ComponentProgress label="Music" value={longResult.componentState.musicBed.status} ready={longResult.componentState.musicBed.ready} />
                <ComponentProgress label="Assembly" value={longResult.componentState.assembly.ready ? 'Completed' : longResult.componentState.assembly.assemblyProcessing ? 'Processing' : longResult.componentState.assembly.assemblyQueued ? 'Queued' : 'Waiting'} ready={longResult.componentState.assembly.ready} />
              </div>
            )}
            {longResult?.blockedReasons?.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[10px] text-amber-200">{longResult.blockedReasons.join(' · ')}</div>}
            {longResult?.parent?.error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3 text-[10px] text-rose-200">{longResult.parent.error}</div>}
            {previewUrl && <video src={previewUrl} controls className="w-full rounded-lg border border-white/[0.08]" />}
            {longResult?.finalArtifactId && <Button onClick={downloadFinal} variant="outline" className="text-xs"><Download className="mr-1.5 h-3 w-3" /> Download final video</Button>}
          </div>
        </Card>
      )}

      {mode === 'short' && !jobResult && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Video className="h-4 w-4 text-cyan-300" /> Render Result</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
            <div className="text-center">
              <Video className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Submit a prompt to render a video</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-amber-300" /> Planned Controls</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Quality Mode</label>
            <div className="flex flex-wrap gap-2">
              {QUALITY_MODES.map((m) => (
                <button
                  key={m}
                  disabled
                  className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/60">Routing backend pending.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Aspect Ratio</label>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r}
                  disabled
                  className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Duration</label>
              <Input disabled placeholder="e.g. 30s, 60s" className="bg-white/[0.04] text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Scene Count (Long-Form)</label>
              <Input disabled type="number" placeholder="Pending" className="bg-white/[0.04] text-sm" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Storyboard Outline</label>
            <Textarea disabled placeholder="Scene-by-scene outline for long-form video" className="min-h-[60px] bg-white/[0.04] text-sm" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Subtitles</label>
              <Input disabled placeholder="Pending" className="bg-white/[0.04] text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Voiceover</label>
              <Input disabled placeholder="Pending" className="bg-white/[0.04] text-sm" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Brand Mode</label>
            <Input disabled placeholder="Pending" className="bg-white/[0.04] text-sm" />
          </div>
        </div>
      </Card>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">
          Provider/model selection is handled by the platform runtime. No manual overrides are exposed in app-facing flows.
          External apps request video capabilities only — they never call providers directly.
        </p>
      </div>
    </PageTransition>
  )
}

function ComponentProgress({ label, value, ready }) {
  return (
    <div className={`rounded-lg border p-3 ${ready ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-black/20'}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${ready ? 'text-emerald-200' : 'text-amber-200'}`}>{value}</p>
    </div>
  )
}
