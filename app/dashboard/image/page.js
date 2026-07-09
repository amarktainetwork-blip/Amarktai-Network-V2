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
import { Image as ImageIcon, Send, Zap, ExternalLink, AlertTriangle, Download, Loader2, FlaskConical } from 'lucide-react'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function artifactErrorMessage(status) {
  if (status === 401) return 'Unauthorized'
  if (status === 404) return 'Artifact file not found'
  if (status === 409) return 'Artifact is not ready'
  if (status === 502) return 'Backend unavailable'
  return 'Artifact preview unavailable'
}

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobResult, setJobResult] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const pollRef = useRef(null)
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const proof = getRuntimeCapabilityProof(runtimeProofStatus, 'image_generation')
  const backendReady = proof.readyForDashboardExecution === true

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

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

  const handleSubmit = async () => {
    if (!prompt.trim() || !backendReady || submitting) return
    setSubmitting(true)
    setJobResult(null)
    setPreviewUrl('')
    setPreviewError('')
    try {
      const { submitJob, pollJob } = useStudioStore.getState()
      const result = await submitJob('image_generation', { prompt: prompt.trim() })
      if (!result.ok || !result.jobId) {
        setJobResult({ status: 'failed', error: result.error })
        return
      }
      let attempts = 0
      let job = null
      while (attempts < 60) {
        job = await pollJob(result.jobId)
        if (!job || job.status === 'completed' || job.status === 'failed') break
        await new Promise((r) => setTimeout(r, 2000))
        attempts++
      }
      setJobResult(job || { status: 'timeout', error: 'Job polling timed out' })
    } catch (err) {
      setJobResult({ status: 'failed', error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Image Studio" subtitle="Generate images through the image_generation worker flow. Auto mode selects the best provider and model." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Prompt</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
              placeholder="Describe the image you want to generate..."
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
                <Zap className="mr-1 h-2.5 w-2.5" /> Auto mode
              </Badge>
              <span className="text-[10px] text-muted-foreground">Runtime selects provider and model</span>
            </div>
            <Badge variant="outline" className={`text-[10px] ${runtimeProofStatusClasses(proof)}`}>
              {runtimeProofStatusLabel(proof)}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || !backendReady || submitting}
              className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"
            >
              {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Send className="mr-1.5 h-3 w-3" />}
              {submitting ? 'Generating...' : 'Generate'}
            </Button>
            {!backendReady && (
              <span className="text-[10px] text-muted-foreground">
                Disabled until backend proof passes.{' '}
                <Link href="/dashboard/studio" className="text-cyan-300 hover:underline">Open advanced Studio</Link>
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-cyan-300" /> Result</h3>

        {!jobResult && (
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Submit a prompt to generate an image</p>
            </div>
          </div>
        )}

        {jobResult && jobResult.status === 'completed' && (
          <div className="space-y-3">
            {previewUrl ? (
              <img src={previewUrl} alt="Generated image" className="max-h-96 w-full rounded-lg border border-white/[0.06] object-contain" />
            ) : previewError ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs text-amber-200">{previewError}</div>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading preview...</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {jobResult.provider && <span>Provider: <span className="text-violet-300">{jobResult.provider}</span></span>}
              {jobResult.model && <span>Model: <span className="font-mono text-[10px]">{jobResult.model}</span></span>}
              {jobResult.artifactId && (
                <Link href={`/dashboard/artifacts`} className="text-cyan-300 hover:underline flex items-center gap-1">
                  <Download className="h-3 w-3" /> Artifacts
                </Link>
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FlaskConical className="h-3 w-3" />
        <Link href="/dashboard/studio" className="text-cyan-300 hover:underline">Open advanced Studio</Link>
        <span>for full capability selection, options, and developer tools.</span>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">
          Provider/model selection is handled by the backend runtime. No manual overrides are exposed in app-facing flows.
        </p>
      </div>
    </PageTransition>
  )
}
