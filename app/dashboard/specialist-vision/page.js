'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, Download, ShieldAlert } from 'lucide-react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { adminFetch } from '@/lib/admin-session'
import { useStudioStore } from '@/lib/useStudioStore'

const TASKS = ['depth_estimation', 'keypoint_detection', 'mask_generation', 'zero_shot_object_detection', 'visual_document_retrieval', 'video_classification']

export default function SpecialistVisionPage() {
  const [task, setTask] = useState(TASKS[0])
  const [artifacts, setArtifacts] = useState([])
  const [artifactId, setArtifactId] = useState('')
  const [intent, setIntent] = useState('product\nlogo\nperson')
  const [query, setQuery] = useState('Find the most relevant cited page evidence.')
  const [truth, setTruth] = useState({})
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    Promise.all([
      adminFetch('/api/admin/artifacts?limit=200').then((response) => response.json()),
      adminFetch('/api/admin/truth').then((response) => response.json()),
    ]).then(([artifactData, truthData]) => {
      setArtifacts((artifactData.artifacts || []).filter((item) => ['image', 'video', 'document'].includes(item.type) && item.status === 'completed'))
      const entries = truthData.truth?.capabilities || truthData.truth?.releaseReadiness || []
      setTruth(Object.fromEntries(entries.filter((item) => TASKS.includes(item.capability)).map((item) => [item.capability, item])))
    }).catch(() => {})
  }, [])

  const selected = truth[task]
  const eligible = useMemo(() => artifacts.filter((artifact) => task === 'video_classification' ? artifact.type === 'video' : task === 'visual_document_retrieval' ? artifact.type === 'document' : artifact.type === 'image'), [artifacts, task])
  useEffect(() => { if (!eligible.some((item) => item.id === artifactId)) setArtifactId(eligible[0]?.id || '') }, [eligible, artifactId])

  const upload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError('')
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('The selected file could not be read.'))
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.readAsDataURL(file)
      })
      const response = await adminFetch('/api/admin/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability: task, title: file.name, declaredMimeType: file.type || undefined, dataBase64 }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Source artifact upload failed.')
      const uploaded = { id: result.artifactId, type: result.kind, title: file.name, mimeType: result.mimeType, status: 'completed' }
      setArtifacts((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)])
      setArtifactId(result.artifactId)
    } catch (error) { setUploadError(error.message) }
    finally { setUploading(false); event.target.value = '' }
  }

  const submit = async () => {
    setBusy(true); setJob(null)
    const labels = intent.split('\n').map((item) => item.trim()).filter(Boolean)
    const common = { maxCredits: 100, idempotencyKey: `dashboard-${task}-${Date.now()}` }
    const input = task === 'depth_estimation' ? { ...common, sourceImageArtifactId: artifactId, outputMode: 'relative', normalize: true, visualization: true }
      : task === 'keypoint_detection' ? { ...common, sourceImageArtifactId: artifactId, domain: labels[0] || 'generic', confidenceThreshold: 0.5, overlay: true }
        : task === 'mask_generation' ? { ...common, sourceImageArtifactId: artifactId, guidance: { type: 'prompt', prompt: labels[0] || 'foreground subject' }, outputFormat: 'binary_png', overlay: true, maxMasks: 10 }
          : task === 'zero_shot_object_detection' ? { ...common, sourceImageArtifactId: artifactId, candidateLabels: labels, confidenceThreshold: 0.25, maxDetections: 100, overlay: true }
            : task === 'visual_document_retrieval' ? { ...common, sourceDocumentArtifactId: artifactId, query, maxResults: 8, citationsRequired: true }
              : { ...common, sourceVideoArtifactId: artifactId, candidateLabels: labels, samplingProfile: 'balanced', temporalSegmentation: true }
    try {
      const submitted = await useStudioStore.getState().submitJob(task, { ...input, prompt: query || task })
      if (!submitted.ok) throw new Error(submitted.error)
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const state = await useStudioStore.getState().pollJob(submitted.jobId); setJob(state)
        if (['completed', 'failed', 'cancelled'].includes(state?.status)) break
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    } catch (error) { setJob({ status: 'failed', error: error.message }) }
    finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!job?.id) return
    const response = await adminFetch(`/api/admin/jobs/${encodeURIComponent(job.id)}?action=cancel`, { method: 'POST' })
    setJob(await response.json())
  }
  const retry = async () => {
    if (!job?.id) return
    const response = await adminFetch(`/api/admin/jobs/${encodeURIComponent(job.id)}?action=requeue`, { method: 'POST' })
    setJob(await response.json())
  }

  let output = job?.output
  try { output = JSON.parse(output) } catch {}
  const artifactIds = [...new Set(JSON.stringify(output || {}).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi) || [])]

  return <PageTransition className="space-y-6">
    <PageHeader title="Specialist Vision" subtitle="Provider-neutral, artifact-authorised durable execution. Orchestra owns every executor and model decision." />
    <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center gap-3"><Eye className="h-4 w-4 text-cyan-300" /><select value={task} onChange={(event) => setTask(event.target.value)} className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm">{TASKS.map((value) => <option key={value}>{value}</option>)}</select><Badge variant="outline">{selected?.releaseCandidate || selected?.readyForDashboardExecution ? 'Executable' : 'Truthfully blocked'}</Badge></div>
      {!(selected?.releaseCandidate || selected?.readyForDashboardExecution) && <div className="flex gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{selected?.blockedReasons?.join(', ') || selected?.blocker || 'No production-compatible executor is registered. Local fixture proof is not live-provider proof.'}</span></div>}
      <label className="text-sm">Authorised source artifact<select value={artifactId} onChange={(event) => setArtifactId(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"><option value="">Select an authorised artifact</option>{eligible.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.title || artifact.id} · {artifact.mimeType}</option>)}</select></label>
      <label className="block text-sm">Upload a new authorised source<input type="file" accept={task === 'video_classification' ? 'video/mp4' : task === 'visual_document_retrieval' ? 'application/pdf,text/plain,text/markdown,image/png,image/jpeg' : 'image/png,image/jpeg,image/webp'} onChange={upload} disabled={uploading} className="mt-2 block w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs" /></label>
      {uploading && <p className="text-xs text-cyan-200">Inspecting and storing source artifact…</p>}
      {uploadError && <p className="text-xs text-rose-300">{uploadError}</p>}
      {task === 'visual_document_retrieval' && <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cited retrieval query" />}
      {task !== 'depth_estimation' && task !== 'visual_document_retrieval' && <Textarea value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="One candidate label or task intent per line" />}
      <div className="flex gap-2"><Button onClick={submit} disabled={busy || !artifactId || !(selected?.releaseCandidate || selected?.readyForDashboardExecution)}>{busy ? 'Polling durable execution…' : 'Submit'}</Button>{job && !['completed', 'failed', 'cancelled'].includes(job.status) && <Button variant="outline" onClick={cancel}>Cancel</Button>}{job?.status === 'failed' && <Button variant="outline" onClick={retry}>Retry eligible failure</Button>}</div>
    </Card>
    {job && <Card className="space-y-3 border-white/[0.07] bg-white/[0.02] p-5"><div className="flex gap-2"><Badge variant="outline">{job.status}</Badge><Badge variant="outline">{job.progress ?? 0}%</Badge></div>{job.error && <p className="text-sm text-rose-300">{job.error}</p>}<pre className="max-h-96 overflow-auto rounded bg-black/30 p-4 text-xs">{JSON.stringify({ output, executionEvidence: job.executionEvidence }, null, 2)}</pre><div className="flex flex-wrap gap-2">{artifactIds.map((id) => <Button key={id} size="sm" variant="outline" onClick={() => window.open(`/api/admin/artifacts/${encodeURIComponent(id)}/file?download=1`, '_blank')}><Download className="mr-2 h-3.5 w-3.5" />{id.slice(0, 8)}</Button>)}</div></Card>}
  </PageTransition>
}
