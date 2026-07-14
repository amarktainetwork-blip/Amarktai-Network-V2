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
    return () => { stopped.current = true }
  }, [])

  const pollLong = async (id) => {
    const headers = { Authorization: `Bearer ${getAdminToken()}` }
    for (let attempt = 0; attempt < 1200 && !stopped.current; attempt++) {
      const response = await fetch(`/api/admin/long-form-video/executions/${id}`, { headers, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) { setLongResult({ error: data.message || 'Long-form status failed' }); break }
      const execution = data.execution; setLongResult(execution)
      const terminal = ['completed', 'failed', 'cancelled'].includes(execution?.parent?.status)
      if (terminal) { if (execution.parent.status === 'completed') localStorage.removeItem(LONG_EXECUTION_KEY); break }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  const submit = async () => {
    setRunning(true); setResult(null); setLongResult(null)
    try {
      if (mode === 'long_form_video') {
        const response = await adminFetch('/api/admin/long-form-video/executions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request: { prompt: prompt.trim(), targetDurationSeconds: 60, sceneCount: 5, aspectRatio: '16:9', style: 'cinematic', tone: 'professional', voiceoverEnabled: true, subtitlesEnabled: true, musicBedEnabled: true, count: 1, routingMode: 'balanced' } }),
        })
        const data = await response.json()
        if (!response.ok || !data.executionId) throw new Error(data.message || data.details || 'Long-form submission failed')
        setExecutionId(data.executionId); localStorage.setItem(LONG_EXECUTION_KEY, data.executionId)
        await pollLong(data.executionId)
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

  const sourceType = mode === 'image_to_video' ? 'image/' : 'video/'
  const sources = artifacts.filter((artifact) => artifact.mimeType?.startsWith(sourceType))
  const source = sources.find((artifact) => artifact.id === sourceArtifactId)
  const needsSource = mode === 'image_to_video' || mode === 'video_to_video'
  const canRun = prompt.trim() && proof.readyForDashboardExecution && (!needsSource || sourceArtifactId)
  const finalArtifactId = longResult?.finalArtifactId || longResult?.parent?.artifactId

  return <PageTransition className="space-y-6">
    <PageHeader title="Video Studio" subtitle="Text, source-aware, and automatic long-form video. Orchestra owns provider and model selection." />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{MODES.map(([key, label]) => { const modeProof = getRuntimeCapabilityProof(status, key); return <button key={key} onClick={() => { setMode(key); setResult(null); setSourceArtifactId('') }} className={`rounded-lg border p-4 text-left ${mode === key ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/[0.07] bg-white/[0.02]'}`}><div className="text-sm font-semibold">{label}</div><div className={`mt-1 text-[10px] ${modeProof.readyForDashboardExecution ? 'text-emerald-300' : 'text-amber-300'}`}>{modeProof.readyForDashboardExecution ? 'Executable' : 'Blocked by runtime truth'}</div></button> })}</div>
    <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5">
      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the video" className="min-h-28" />
      {needsSource && <><select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"><option value="">Select an authorised {mode === 'image_to_video' ? 'image' : 'video'} artifact</option>{sources.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.title || artifact.id} · {artifact.appSlug}</option>)}</select>{source && <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 text-[10px] text-muted-foreground">Source provenance: {source.appSlug} / {source.id}</div>{mode === 'image_to_video' ? <img src={`/api/admin/artifacts/${source.id}/file`} alt="Selected source" className="max-h-64 rounded object-contain" /> : <video src={`/api/admin/artifacts/${source.id}/file`} controls preload="metadata" className="max-h-64 w-full rounded" />}</div>}</>}
      {!proof.readyForDashboardExecution && <p className="text-xs text-amber-200">{proof.description}</p>}
      <Button onClick={submit} disabled={!canRun || running}>{running ? 'Running...' : 'Generate video'}</Button>
    </Card>
    {mode !== 'long_form_video' && result && <Card className="space-y-3 border-white/[0.07] bg-white/[0.02] p-5"><Badge variant="outline">{result.status}</Badge>{result.error && <p className="text-sm text-rose-300">{result.error}</p>}{result.status === 'completed' && result.artifactId && <><video controls preload="metadata" src={`/api/admin/artifacts/${result.artifactId}/file`} className="w-full rounded-lg" /><div className="flex flex-wrap gap-2 text-[10px]"><Badge variant="outline">{result.provider}</Badge><Badge variant="outline">{result.model}</Badge><Badge variant="outline">Source {sourceArtifactId || 'text'}</Badge></div><a href={`/api/admin/artifacts/${result.artifactId}/file?download=1`} className="inline-flex items-center text-sm text-cyan-300"><Download className="mr-2 h-4 w-4" />Download video</a></>}</Card>}
    {mode === 'long_form_video' && (executionId || longResult) && <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5"><div className="flex flex-wrap items-center gap-2"><Film className="h-4 w-4" /><code className="text-xs">{executionId}</code><Badge variant="outline">{longResult?.parent?.status || (longResult?.error ? 'failed' : 'loading')}</Badge></div>{longResult?.error && <p className="text-sm text-rose-300">{longResult.error}</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Component label="Scenes" state={longResult?.componentState?.scenes} /><Component label="Voiceover" state={longResult?.componentState?.voiceover} /><Component label="Subtitles" state={longResult?.componentState?.subtitles} /><Component label="Music" state={longResult?.componentState?.musicBed} /><Component label="Assembly" state={longResult?.componentState?.assembly} /></div>{(longResult?.blockedReasons || []).length > 0 && <pre className="rounded bg-rose-500/5 p-3 text-xs text-rose-200">{longResult.blockedReasons.join('\n')}</pre>}{finalArtifactId && <><video controls preload="metadata" src={`/api/admin/artifacts/${finalArtifactId}/file`} className="w-full rounded-lg" /><a href={`/api/admin/artifacts/${finalArtifactId}/file?download=1`} className="inline-flex items-center text-sm text-cyan-300"><Download className="mr-2 h-4 w-4" />Download final video</a></>}</Card>}
  </PageTransition>
}

function Component({ label, state }) {
  return <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="text-xs font-semibold">{label}</div><div className="mt-1 text-[10px] text-muted-foreground">{state?.status || state?.state || (state?.complete ? 'completed' : 'waiting')}</div>{state?.retryCount > 0 && <div className="text-[10px] text-amber-200">Retries: {state.retryCount}</div>}</div>
}
