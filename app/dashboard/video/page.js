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
import { Video, Zap, AlertTriangle, Clock, Film, Loader2, FlaskConical, Download, Send } from 'lucide-react'

export default function VideoStudioPage() {
  const [mode, setMode] = useState('short')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobResult, setJobResult] = useState(null)
  const pollRef = useRef(null)
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const shortProof = getRuntimeCapabilityProof(runtimeProofStatus, 'video_generation')
  const shortReady = shortProof.readyForDashboardExecution === true

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

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

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Video Studio" subtitle="Create short-form video content. Short video uses the proven video_generation worker flow." />

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
                <span className="text-[10px] text-muted-foreground">Runtime selects provider and model</span>
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
                    Disabled until backend proof passes.{' '}
                    <Link href="/dashboard/studio" className="text-cyan-300 hover:underline">Open advanced Studio</Link>
                  </span>
                )}
              </div>
            </>
          )}

          {mode === 'long' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" /> Backend Pending
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Long-form video generation (storyboard, stitching, multi-scene) is not yet wired to a backend endpoint. Use short video via the proven GenX flow, or open advanced Studio.
              </p>
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FlaskConical className="h-3 w-3" />
        <Link href="/dashboard/studio" className="text-cyan-300 hover:underline">Open advanced Studio</Link>
        <span>for full capability selection, options, and developer tools.</span>
      </div>
    </PageTransition>
  )
}
