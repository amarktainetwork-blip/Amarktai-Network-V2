'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/useStudioStore'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { getRuntimeCapabilityProof, runtimeProofStatusClasses, runtimeProofStatusLabel } from '@/lib/runtime-proof-status'
import { Image as ImageIcon, Send, Zap, Download, Loader2, WandSparkles, Maximize2 } from 'lucide-react'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function artifactErrorMessage(status) {
  if (status === 401) return 'Unauthorized'
  if (status === 404) return 'Artifact file not found'
  if (status === 409) return 'Artifact is not ready'
  if (status === 502) return 'Backend unavailable'
  return 'Artifact preview unavailable'
}

function parsedOutput(jobResult) {
  try {
    const value = JSON.parse(jobResult?.output || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export default function ImageStudioPage() {
  const [mode, setMode] = useState('generate')
  const [prompt, setPrompt] = useState('')
  const [sourceArtifacts, setSourceArtifacts] = useState([])
  const [selectedArtifactId, setSelectedArtifactId] = useState('')
  const [scaleFactor, setScaleFactor] = useState('2')
  const [outputFormat, setOutputFormat] = useState('png')
  const [artifactsLoading, setArtifactsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [jobResult, setJobResult] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const pollRef = useRef(null)
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const generationProof = getRuntimeCapabilityProof(runtimeProofStatus, 'image_generation')
  const upscaleProof = getRuntimeCapabilityProof(runtimeProofStatus, 'image_upscale')
  const proof = mode === 'upscale' ? upscaleProof : generationProof
  const backendReady = proof.readyForDashboardExecution === true
  const output = parsedOutput(jobResult)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    fetch('/api/admin/artifacts?limit=100', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Artifact listing failed')))
      .then((data) => {
        const images = (data?.artifacts ?? []).filter((artifact) =>
          artifact.status === 'completed' && IMAGE_MIME_TYPES.has(artifact.mimeType)
        )
        setSourceArtifacts(images)
        setSelectedArtifactId((current) => current || images[0]?.id || '')
      })
      .catch(() => setSourceArtifacts([]))
      .finally(() => setArtifactsLoading(false))
  }, [jobResult?.artifactId])

  useEffect(() => {
    setPreviewUrl('')
    setPreviewError('')
    if (!jobResult?.artifactId || jobResult?.status !== 'completed') return

    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    let objectUrl = ''
    let cancelled = false

    async function loadPreview() {
      try {
        const detailRes = await fetch(`/api/admin/artifacts/${jobResult.artifactId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!detailRes.ok) { setPreviewError(artifactErrorMessage(detailRes.status)); return }
        const detail = await detailRes.json()
        const mimeType = detail?.mimeType || ''
        if (!IMAGE_MIME_TYPES.has(mimeType)) { setPreviewError('Preview available from Artifacts page'); return }

        const fileRes = await fetch(`/api/admin/artifacts/${jobResult.artifactId}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!fileRes.ok) { setPreviewError(artifactErrorMessage(fileRes.status)); return }
        const blob = await fileRes.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setPreviewUrl(objectUrl)
      } catch {
        if (!cancelled) setPreviewError('Backend unavailable')
      }
    }
    loadPreview()
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [jobResult?.artifactId, jobResult?.status])

  const canSubmit = mode === 'upscale'
    ? Boolean(selectedArtifactId) && backendReady && !submitting
    : Boolean(prompt.trim()) && backendReady && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setJobResult(null)
    setPreviewUrl('')
    setPreviewError('')
    try {
      const { submitJob, pollJob } = useStudioStore.getState()
      const capability = mode === 'upscale' ? 'image_upscale' : 'image_generation'
      const input = mode === 'upscale'
        ? {
            sourceImageArtifactId: selectedArtifactId,
            scaleFactor: Number(scaleFactor),
            outputFormat,
            idempotencyKey: `dashboard-upscale-${Date.now()}-${selectedArtifactId.slice(0, 8)}`,
          }
        : { prompt: prompt.trim() }
      const result = await submitJob(capability, input)
      if (!result.ok || !result.jobId) {
        setJobResult({ status: 'failed', error: result.error })
        return
      }
      let attempts = 0
      let job = null
      while (attempts < 90) {
        job = await pollJob(result.jobId)
        if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') break
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000))
        attempts++
      }
      setJobResult(job || { status: 'timeout', error: 'Job polling timed out' })
    } catch (error) {
      setJobResult({ status: 'failed', error: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Image Studio" subtitle="Generate new images or upscale governed image artifacts. Platform policy owns every execution route." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={mode === 'generate' ? 'default' : 'outline'} size="sm" onClick={() => { setMode('generate'); setJobResult(null) }} className={mode === 'generate' ? 'bg-cyan-300 text-black' : 'border-white/10'}>
              <WandSparkles className="mr-1.5 h-3.5 w-3.5" /> Generate
            </Button>
            <Button type="button" variant={mode === 'upscale' ? 'default' : 'outline'} size="sm" onClick={() => { setMode('upscale'); setJobResult(null) }} className={mode === 'upscale' ? 'bg-cyan-300 text-black' : 'border-white/10'}>
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Upscale
            </Button>
          </div>

          {mode === 'generate' ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium">Prompt</label>
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) handleSubmit() }}
                placeholder="Describe the image you want to generate..."
                className="bg-white/[0.04] text-sm"
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_140px]">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Source image artifact</label>
                <select value={selectedArtifactId} onChange={(event) => setSelectedArtifactId(event.target.value)} disabled={artifactsLoading || sourceArtifacts.length === 0} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-xs text-foreground outline-none focus:border-cyan-400/50">
                  {sourceArtifacts.length === 0 ? <option value="">No completed image artifacts</option> : sourceArtifacts.map((artifact) => (
                    <option key={artifact.id} value={artifact.id}>{artifact.title || artifact.subType || 'Image artifact'} · {artifact.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Scale</label>
                <select value={scaleFactor} onChange={(event) => setScaleFactor(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-xs text-foreground outline-none focus:border-cyan-400/50">
                  <option value="2">2×</option>
                  <option value="4">4×</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Output</label>
                <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-xs text-foreground outline-none focus:border-cyan-400/50">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </div>
              {!artifactsLoading && sourceArtifacts.length === 0 && (
                <p className="text-[10px] text-amber-200 md:col-span-3">Generate or upload an image first. Completed image artifacts appear here automatically.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
                <Zap className="mr-1 h-2.5 w-2.5" /> Governed auto mode
              </Badge>
              <span className="text-[10px] text-muted-foreground">No provider or model override</span>
            </div>
            <Badge variant="outline" className={`text-[10px] ${runtimeProofStatusClasses(proof)}`}>
              {runtimeProofStatusLabel(proof)}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
              {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : mode === 'upscale' ? <Maximize2 className="mr-1.5 h-3 w-3" /> : <Send className="mr-1.5 h-3 w-3" />}
              {submitting ? (mode === 'upscale' ? 'Upscaling...' : 'Generating...') : (mode === 'upscale' ? 'Upscale image' : 'Generate')}
            </Button>
            {!backendReady && <span className="text-[10px] text-muted-foreground">Disabled until this capability passes runtime proof.</span>}
          </div>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-cyan-300" /> Result</h3>

        {!jobResult && (
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">{mode === 'upscale' ? 'Choose an image artifact to create a governed higher-resolution copy' : 'Submit a prompt to generate an image'}</p>
            </div>
          </div>
        )}

        {jobResult && jobResult.status === 'completed' && (
          <div className="space-y-3">
            {previewUrl ? (
              <img src={previewUrl} alt={mode === 'upscale' ? 'Upscaled image' : 'Generated image'} className="max-h-96 w-full rounded-lg border border-white/[0.06] object-contain" />
            ) : previewError ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs text-amber-200">{previewError}</div>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading preview...</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {jobResult.provider && <span>Executor: <span className="text-violet-300">{jobResult.provider}</span></span>}
              {jobResult.model && <span>Route proof: <span className="font-mono text-[10px]">{jobResult.model}</span></span>}
              {output.width && output.height && <span>{output.width}×{output.height}</span>}
              {output.scaleFactor && <span>{output.scaleFactor}× Lanczos</span>}
              {jobResult.artifactId && (
                <><a href={`/api/admin/artifacts/${jobResult.artifactId}/file?download=1`} className="text-cyan-300 hover:underline flex items-center gap-1"><Download className="h-3 w-3" /> Download</a><Link href="/dashboard/artifacts" className="text-cyan-300 hover:underline">Artifacts</Link></>
              )}
            </div>
          </div>
        )}

        {jobResult && jobResult.status === 'failed' && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-4">
            <p className="text-xs font-semibold text-rose-200">Job failed</p>
            {jobResult.error && <p className="mt-1 text-[10px] text-rose-300">{jobResult.error}</p>}
          </div>
        )}

        {jobResult && jobResult.status !== 'completed' && jobResult.status !== 'failed' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
            <p className="text-xs text-amber-200">Job {jobResult.status || 'pending'}</p>
          </div>
        )}
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-2 text-sm font-semibold">Release scope</h3>
        <p className="text-xs text-muted-foreground">Image generation and governed 2×/4× Lanczos upscaling are release candidates. Image editing and image-to-image variations remain proof-gated until an approved provider account exposes a contract-compatible model.</p>
      </Card>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">External apps request capabilities only. Internal FFmpeg transforms preserve Artifact lineage and never claim live-provider proof.</p>
      </div>
    </PageTransition>
  )
}
