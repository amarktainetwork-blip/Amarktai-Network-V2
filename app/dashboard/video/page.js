'use client'

import { useEffect, useRef, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/useStudioStore'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { getRuntimeCapabilityProof } from '@/lib/runtime-proof-status'
import { adminFetch, getAdminToken } from '@/lib/admin-session'
import { Download, Film, Image as ImageIcon, Video } from 'lucide-react'

const LONG_EXECUTION_KEY = 'amarktai_long_form_execution_id'
const LONG_PLAN_KEY = 'amarktai_long_form_plan'
const ROUTING_MODES = ['balanced', 'quality', 'economy', 'fast']
const ROUTING_LABELS = { balanced: 'Balanced', quality: 'Quality', economy: 'Economy', fast: 'Fast' }
const MODES = [
  ['video_generation', 'Text to video'],
  ['image_to_video', 'Image to video'],
  ['video_to_video', 'Video to video'],
  ['long_form_video', 'Long-form video'],
]

export default function VideoStudioPage() {
  const [mode, setMode] = useState('video_generation')
  const [prompt, setPrompt] = useState('')
  const [sourceArtifactId, setSourceArtifactId] = useState('')
  const [artifacts, setArtifacts] = useState([])
  const [result, setResult] = useState(null)
  const [longResult, setLongResult] = useState(null)
  const [executionId, setExecutionId] = useState('')
  const [running, setRunning] = useState(false)
  const [duration, setDuration] = useState(30)
  const [sceneCount, setSceneCount] = useState(3)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [style, setStyle] = useState('cinematic')
  const [tone, setTone] = useState('professional')
  const [routingMode, setRoutingMode] = useState('quality')
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false)
  const [musicBedEnabled, setMusicBedEnabled] = useState(false)
  const [planResult, setPlanResult] = useState(null)
  const [planPhase, setPlanPhase] = useState('idle')
  const [previewJobs, setPreviewJobs] = useState({})
  const [previewRunning, setPreviewRunning] = useState(false)
  const stopped = useRef(false)
  const { status } = useRuntimeProofStatus()
  const proof = getRuntimeCapabilityProof(status, mode)

  const loadArtifacts = async () => {
    const response = await adminFetch('/api/admin/artifacts?limit=200')
    const data = await response.json()
    setArtifacts((data.artifacts || []).filter((artifact) => artifact.status === 'completed'))
  }

  useEffect(() => {
    stopped.current = false
    loadArtifacts().catch(() => {})
    const stored = localStorage.getItem(LONG_EXECUTION_KEY)
    if (stored) { setMode('long_form_video'); setExecutionId(stored); pollLong(stored) }
    const storedPlan = localStorage.getItem(LONG_PLAN_KEY)
    if (storedPlan) { try { setPlanResult(JSON.parse(storedPlan)); setPlanPhase('review') } catch {} }
    return () => { stopped.current = true }
  }, [])

  const pollLong = async (id) => {
    const headers = { Authorization: `Bearer ${getAdminToken()}` }
    for (let attempt = 0; attempt < 1200 && !stopped.current; attempt++) {
      const response = await fetch(`/api/admin/long-form-video/executions/${id}`, { headers, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) { setLongResult({ error: data.message || 'Long-form status failed' }); break }
      const execution = data.execution; setLongResult(execution)
      const currentExecutionId = execution?.parent?.executionId || execution?.executionId
      if (currentExecutionId && currentExecutionId !== id) continue
      const terminal = ['completed', 'failed', 'cancelled'].includes(execution?.parent?.status)
        || execution?.failedScenes > 0 || execution?.componentState?.assembly?.status === 'failed'
      if (terminal) break
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  const generatePlan = async () => {
    setRunning(true); setPlanResult(null); setLongResult(null); setPlanPhase('planning')
    try {
      const response = await adminFetch('/api/admin/long-form-video/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          targetDurationSeconds: duration,
          sceneCount,
          aspectRatio,
          style,
          tone,
          routingMode,
          voiceoverEnabled,
          subtitlesEnabled,
          musicBedEnabled,
          count: 1,
          planningMode: 'automatic',
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.plan) throw new Error(data.message || data.details || 'Plan generation failed')
      setPlanResult(data)
      setPlanPhase('review')
      localStorage.setItem(LONG_PLAN_KEY, JSON.stringify(data))
    } catch (error) {
      setPlanResult({ error: error.message })
      setPlanPhase('idle')
    } finally { setRunning(false) }
  }

  const approvePlan = async () => {
    if (!planResult?.planId || !planResult?.versionHash || !planResult?.executionId) return
    setRunning(true)
    try {
      const response = await adminFetch('/api/admin/long-form-video/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planResult.planId,
          versionHash: planResult.versionHash,
          executionId: planResult.executionId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.executionId) throw new Error(data.message || data.details || 'Plan approval failed')
      setExecutionId(data.executionId)
      localStorage.setItem(LONG_EXECUTION_KEY, data.executionId)
      localStorage.removeItem(LONG_PLAN_KEY)
      setPlanPhase('executing')
      setPlanResult(null)
      await pollLong(data.executionId)
    } catch (error) {
      setLongResult({ error: error.message })
    } finally { setRunning(false) }
  }

  const submit = async () => {
    setRunning(true); setResult(null); setLongResult(null)
    try {
      if (mode === 'long_form_video') {
        await generatePlan()
      } else {
        const input = { prompt: prompt.trim() }
        if (mode === 'image_to_video') input.sourceImageArtifactId = sourceArtifactId
        if (mode === 'video_to_video') input.sourceVideoArtifactId = sourceArtifactId
        const submitted = await useStudioStore.getState().submitJob(mode, input)
        if (!submitted.ok) throw new Error(submitted.error)
        let job
        for (let attempt = 0; attempt < 300; attempt++) {
          job = await useStudioStore.getState().pollJob(submitted.jobId); setResult(job)
          if (['completed', 'failed', 'cancelled'].includes(job?.status)) break
          await new Promise((resolve) => setTimeout(resolve, 2500))
        }
        if (job?.status === 'completed') await loadArtifacts()
      }
    } catch (error) {
      if (mode === 'long_form_video') setLongResult({ error: error.message })
      else setResult({ status: 'failed', error: error.message })
    } finally { setRunning(false) }
  }

  const retryScene = async (sceneNumber) => {
    if (!executionId) return
    setRunning(true)
    try {
      const response = await adminFetch(`/api/admin/long-form-video/executions/${executionId}/scenes/${sceneNumber}/retry`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Scene retry failed')
      if (data.execution) setLongResult(data.execution)
      await pollLong(executionId)
    } catch (error) {
      setLongResult((current) => ({ ...current, error: error.message }))
    } finally { setRunning(false) }
  }

  const previewScene = async (sceneNumber) => {
    if (!planResult?.planId || !planResult?.versionHash || !planResult?.executionId) return
    setPreviewRunning(true)
    try {
      const response = await adminFetch('/api/admin/long-form-video/preview-scene', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionId: planResult.executionId,
          planId: planResult.planId,
          versionHash: planResult.versionHash,
          sceneNumber,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.details || 'Scene preview failed')
      setPreviewJobs((prev) => ({ ...prev, [sceneNumber]: data }))
      if (data.status === 'queued' || data.status === 'processing') {
        pollPreviewJob(sceneNumber, data.previewJobId)
      }
    } catch (error) {
      setPreviewJobs((prev) => ({ ...prev, [sceneNumber]: { error: error.message } }))
    } finally { setPreviewRunning(false) }
  }

  const retryPreview = async (sceneNumber) => {
    if (!planResult?.planId || !planResult?.versionHash || !planResult?.executionId) return
    setPreviewRunning(true)
    try {
      const response = await adminFetch('/api/admin/long-form-video/preview-scene/retry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionId: planResult.executionId,
          planId: planResult.planId,
          versionHash: planResult.versionHash,
          sceneNumber,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.details || 'Scene preview retry failed')
      setPreviewJobs((prev) => ({ ...prev, [sceneNumber]: data }))
      if (data.status === 'queued' || data.status === 'processing') {
        pollPreviewJob(sceneNumber, data.previewJobId)
      }
    } catch (error) {
      setPreviewJobs((prev) => ({ ...prev, [sceneNumber]: { error: error.message } }))
    } finally { setPreviewRunning(false) }
  }

  const pollPreviewJob = async (sceneNumber, jobId) => {
    const headers = { Authorization: `Bearer ${getAdminToken()}` }
    for (let attempt = 0; attempt < 300 && !stopped.current; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      try {
        const response = await fetch(`/api/admin/jobs/${jobId}`, { headers, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) break
        const job = data.job ?? data
        setPreviewJobs((prev) => ({ ...prev, [sceneNumber]: { ...prev[sceneNumber], ...job, status: job.status } }))
        if (['completed', 'failed', 'cancelled'].includes(job.status)) break
      } catch { break }
    }
  }

  const sourceType = mode === 'image_to_video' ? 'image/' : 'video/'
  const sources = artifacts.filter((artifact) => artifact.mimeType?.startsWith(sourceType))
  const source = sources.find((artifact) => artifact.id === sourceArtifactId)
  const needsSource = mode === 'image_to_video' || mode === 'video_to_video'
  const canRun = prompt.trim() && (mode === 'long_form_video' || proof.readyForDashboardExecution) && (!needsSource || sourceArtifactId)
  const finalArtifactId = longResult?.finalArtifactId || longResult?.parent?.artifactId
  const currentExecutionId = longResult?.parent?.executionId || longResult?.executionId || executionId

  return <PageTransition className="space-y-6">
    <PageHeader title="Video Studio" subtitle="Text, source-aware, and automatic long-form video. Orchestra owns provider and model selection." />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{MODES.map(([key, label]) => { const modeProof = getRuntimeCapabilityProof(status, key); return <button key={key} onClick={() => { setMode(key); setResult(null); setSourceArtifactId(''); setPlanResult(null); setPlanPhase('idle') }} className={`rounded-lg border p-4 text-left ${mode === key ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/[0.07] bg-white/[0.02]'}`}><div className="text-sm font-semibold">{label}</div><div className={`mt-1 text-[10px] ${modeProof.readyForDashboardExecution ? 'text-emerald-300' : 'text-amber-300'}`}>{modeProof.readyForDashboardExecution ? 'Executable' : 'Runtime checks pending'}</div></button> })}</div>
    <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5">
      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the video" className="min-h-28" />
      {mode === 'long_form_video' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Control label="Duration"><select aria-label="Duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></Control>
        <Control label="Scene count"><select aria-label="Scene count" value={sceneCount} onChange={(event) => setSceneCount(Number(event.target.value))} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value={3}>3 scenes</option><option value={5}>5 scenes</option></select></Control>
        <Control label="Aspect ratio"><select aria-label="Aspect ratio" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></Control>
        <Control label="Style"><select aria-label="Style" value={style} onChange={(event) => setStyle(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value="cinematic">Cinematic</option><option value="documentary">Documentary</option><option value="commercial">Commercial</option></select></Control>
        <Control label="Tone"><select aria-label="Tone" value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value="professional">Professional</option><option value="inspiring">Inspiring</option><option value="dramatic">Dramatic</option></select></Control>
        <Control label="Routing mode"><select aria-label="Routing mode" value={routingMode} onChange={(event) => setRoutingMode(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2">{ROUTING_MODES.map((m) => <option key={m} value={m}>{ROUTING_LABELS[m]}</option>)}</select></Control>
        <Toggle label="Voiceover" checked={voiceoverEnabled} onChange={setVoiceoverEnabled} />
        <Toggle label="Subtitles" checked={subtitlesEnabled} onChange={setSubtitlesEnabled} />
        <Toggle label="Music bed" checked={musicBedEnabled} onChange={setMusicBedEnabled} />
      </div>}
      {needsSource && <><select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"><option value="">Select an authorised {mode === 'image_to_video' ? 'image' : 'video'} artifact</option>{sources.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.title || artifact.id} · {artifact.appSlug}</option>)}</select>{source && <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 text-[10px] text-muted-foreground">Source provenance: {source.appSlug} / {source.id}</div>{mode === 'image_to_video' ? <img src={`/api/admin/artifacts/${source.id}/file`} alt="Selected source" className="max-h-64 rounded object-contain" /> : <video src={`/api/admin/artifacts/${source.id}/file`} controls preload="metadata" className="max-h-64 w-full rounded" />}</div>}</>}
      {!proof.readyForDashboardExecution && mode !== 'long_form_video' && <p className="text-xs text-amber-200">{proof.description}</p>}
      {mode === 'long_form_video' && planPhase === 'idle' && <Button onClick={submit} disabled={!canRun || running}>{running ? 'Generating plan...' : 'Generate plan'}</Button>}
      {mode === 'long_form_video' && planPhase === 'review' && <div className="flex gap-2"><Button onClick={approvePlan} disabled={running}>{running ? 'Approving...' : 'Approve and execute'}</Button><Button variant="outline" onClick={() => { setPlanResult(null); setPlanPhase('idle'); localStorage.removeItem(LONG_PLAN_KEY) }}>Discard plan</Button></div>}
      {mode !== 'long_form_video' && <Button onClick={submit} disabled={!canRun || running}>{running ? 'Running...' : 'Generate video'}</Button>}
    </Card>

    {mode === 'long_form_video' && planPhase === 'review' && planResult && !planResult.error && <Card className="space-y-4 border-cyan-500/20 bg-cyan-500/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Plan Ready</Badge><span className="text-[10px] text-amber-200">Planning only — no media provider calls started</span></div>
      <div className="grid gap-2 sm:grid-cols-3 text-xs">
        <div><span className="text-muted-foreground">Plan ID:</span> <code className="text-[10px]">{planResult.planId}</code></div>
        <div><span className="text-muted-foreground">Version hash:</span> <code className="text-[10px]">{planResult.versionHash}</code></div>
        <div><span className="text-muted-foreground">Duration:</span> {planResult.plan?.totalDurationSeconds}s</div>
        <div><span className="text-muted-foreground">Routing:</span> {planResult.plan?.routingMode}</div>
        <div><span className="text-muted-foreground">Scenes:</span> {planResult.plan?.storyboard?.scenes?.length}</div>
        <div><span className="text-muted-foreground">Narration words:</span> {planResult.plan?.storyboard?.scenes?.reduce((s, sc) => s + (sc.voiceoverText?.split(/\s+/).length || 0), 0) || 0}</div>
      </div>
      {planResult.validation && !planResult.validation.valid && <div className="rounded bg-rose-500/5 p-3 text-xs text-rose-200">Validation errors: {planResult.validation.errors.join('; ')}</div>}
      <div className="grid gap-3 md:grid-cols-3">{(planResult.plan?.storyboard?.scenes || []).map((scene) => <PlanSceneCard key={scene.sceneNumber} scene={scene} preview={previewJobs[scene.sceneNumber]} previewRunning={previewRunning} onPreview={() => previewScene(scene.sceneNumber)} onRetryPreview={() => retryPreview(scene.sceneNumber)} />)}</div>
      {planResult.plan?.callToAction && <div className="text-xs"><span className="font-semibold">CTA:</span> {planResult.plan.callToAction}</div>}
      {planResult.plan?.legalQualifier && <div className="text-xs"><span className="font-semibold">Legal:</span> {planResult.plan.legalQualifier}</div>}
      {planResult.plan?.musicBrief && <div className="text-xs"><span className="font-semibold">Music brief:</span> {planResult.plan.musicBrief}</div>}
    </Card>}

    {mode !== 'long_form_video' && result && <Card className="space-y-3 border-white/[0.07] bg-white/[0.02] p-5"><Badge variant="outline">{result.status}</Badge>{result.error && <p className="text-sm text-rose-300">{result.error}</p>}{result.status === 'completed' && result.artifactId && <><video controls preload="metadata" src={`/api/admin/artifacts/${result.artifactId}/file`} className="w-full rounded-lg" /><div className="flex flex-wrap gap-2 text-[10px]"><Badge variant="outline">{result.provider}</Badge><Badge variant="outline">{result.model}</Badge><Badge variant="outline">Source {sourceArtifactId || 'text'}</Badge></div><a href={`/api/admin/artifacts/${result.artifactId}/file?download=1`} className="inline-flex items-center text-sm text-cyan-300"><Download className="mr-2 h-4 w-4" />Download video</a></>}</Card>}
    {mode === 'long_form_video' && (currentExecutionId || longResult) && <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5"><div className="flex flex-wrap items-center gap-2"><Film className="h-4 w-4" /><span className="text-xs">Parent execution</span><code className="text-xs">{currentExecutionId}</code><Badge variant="outline">{longResult?.parent?.status || (longResult?.error ? 'failed' : 'loading')}</Badge></div>{(longResult?.error || longResult?.parent?.error) && <p className="text-sm text-rose-300">{longResult?.error || longResult?.parent?.error}</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Component label="Scene plan" state={{ status: longResult?.planId ? 'persisted' : 'waiting' }} /><Component label="Voiceover" state={longResult?.componentState?.voiceover} /><Component label="Subtitles" state={longResult?.componentState?.subtitles} /><Component label="Music" state={longResult?.componentState?.musicBed} /><Component label="Assembly" state={longResult?.componentState?.assembly} /></div><div className="grid gap-3 md:grid-cols-3">{(longResult?.scenes || []).map((scene) => <Scene key={scene.jobId} scene={scene} running={running} onRetry={retryScene} />)}</div>{(longResult?.blockedReasons || []).length > 0 && <pre className="rounded bg-rose-500/5 p-3 text-xs text-rose-200">{longResult.blockedReasons.join('\n')}</pre>}{finalArtifactId && <><video controls preload="metadata" src={`/api/admin/artifacts/${finalArtifactId}/file`} className="w-full rounded-lg" /><a href={`/api/admin/artifacts/${finalArtifactId}/file?download=1`} className="inline-flex items-center text-sm text-cyan-300"><Download className="mr-2 h-4 w-4" />Download final video</a></>}</Card>}
  </PageTransition>
}

function PlanSceneCard({ scene, preview, previewRunning, onPreview, onRetryPreview }) {
  const previewStatus = preview?.status
  const isPreviewQueued = previewStatus === 'queued'
  const isPreviewProcessing = previewStatus === 'processing'
  const isPreviewCompleted = previewStatus === 'completed'
  const isPreviewFailed = previewStatus === 'failed'
  const previewArtifactId = preview?.artifactId || preview?.metadata?.artifactId

  return <div className="space-y-2 rounded-lg border border-cyan-500/10 bg-cyan-500/[0.02] p-3">
    <div className="flex items-center justify-between"><span className="text-xs font-semibold">Scene {scene.sceneNumber}: {scene.title}</span><Badge variant="outline">{scene.durationSeconds}s</Badge></div>
    {scene.objective && <div className="text-[10px]"><span className="font-semibold">Objective:</span> {scene.objective}</div>}
    <div className="text-[10px] text-muted-foreground line-clamp-3">{scene.visualPrompt}</div>
    {scene.negativePrompt && <div className="text-[10px] text-amber-200/60">Avoid: {scene.negativePrompt}</div>}
    {scene.cameraDirection && <div className="text-[10px]"><span className="font-semibold">Camera:</span> {scene.cameraDirection}</div>}
    {scene.voiceoverText && <div className="text-[10px]"><span className="font-semibold">Voiceover:</span> {scene.voiceoverText}</div>}
    {scene.subtitleText && <div className="text-[10px]"><span className="font-semibold">Subtitle:</span> {scene.subtitleText}</div>}
    {scene.overlays?.length > 0 && <div className="text-[10px]"><span className="font-semibold">Overlays:</span> {scene.overlays.map((o) => o.text).join(' | ')}</div>}
    <div className="mt-2 space-y-2 border-t border-cyan-500/10 pt-2">
      {!previewStatus && <Button size="sm" variant="outline" disabled={previewRunning} onClick={onPreview}>Preview this scene</Button>}
      {(isPreviewQueued || isPreviewProcessing) && <div className="flex items-center gap-2"><Badge variant="outline">{previewStatus}</Badge><span className="text-[10px] text-muted-foreground">Routing: {preview?.routingMode || 'pending'}</span></div>}
      {isPreviewCompleted && <div className="space-y-1">
        <div className="flex items-center gap-2"><Badge variant="outline" className="bg-emerald-500/10">Preview complete</Badge>{preview?.provider && <span className="text-[10px] text-muted-foreground">{preview.provider} / {preview.model}</span>}</div>
        {previewArtifactId && <><video controls preload="metadata" src={`/api/admin/artifacts/${previewArtifactId}/file`} className="w-full rounded" /><a href={`/api/admin/artifacts/${previewArtifactId}/file?download=1`} className="inline-flex items-center text-xs text-cyan-300"><Download className="mr-1 h-3 w-3" />Download preview</a></>}
      </div>}
      {isPreviewFailed && <div className="space-y-1"><Badge variant="outline" className="bg-rose-500/10">Preview failed</Badge>{preview?.error && <p className="text-[10px] text-rose-300">{preview.error}</p>}<Button size="sm" variant="outline" disabled={previewRunning} onClick={onRetryPreview}>Retry preview</Button></div>}
      {preview?.reused && <span className="text-[10px] text-muted-foreground">(Reused existing preview)</span>}
    </div>
  </div>
}

function Component({ label, state }) {
  return <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="text-xs font-semibold">{label}</div><div className="mt-1 text-[10px] text-muted-foreground">{state?.status || state?.state || (state?.complete ? 'completed' : 'waiting')}</div>{state?.retryCount > 0 && <div className="text-[10px] text-amber-200">Retries: {state.retryCount}</div>}</div>
}

function Control({ label, children }) {
  return <label className="space-y-1 text-xs"><span className="text-muted-foreground">{label}</span>{children}</label>
}

function Toggle({ label, checked, onChange }) {
  return <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
}

function Scene({ scene, running, onRetry }) {
  const retryable = scene.status === 'failed' && scene.retryCount < 3
  return <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Scene {scene.sceneNumber}</span><Badge variant="outline">{scene.status}</Badge></div>{scene.error && <p className="text-[11px] text-rose-300">{scene.error}</p>}{scene.provider && <div className="text-[10px] text-muted-foreground">{scene.provider} / {scene.model}</div>}{retryable && <Button size="sm" variant="outline" disabled={running} onClick={() => onRetry(scene.sceneNumber)}>Retry scene {scene.sceneNumber}</Button>}</div>
}
