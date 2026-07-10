'use client'
import { useEffect, useState, useCallback } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Music, AlertTriangle, Zap, Clock, CheckCircle, XCircle, Loader2, Upload } from 'lucide-react'

const STATUS_COLORS = {
  queued: 'border-blue-500/30 text-blue-300',
  processing: 'border-yellow-500/30 text-yellow-300',
  completed: 'border-emerald-500/30 text-emerald-300',
  failed: 'border-red-500/30 text-red-300',
}

function statusLabel(value) {
  return value ? 'Ready' : 'Blocked'
}

function statusClass(value) {
  return value ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'
}

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [instrumental, setInstrumental] = useState(true)
  const [genre, setGenre] = useState('')
  const [mood, setMood] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(30)
  const [tempo, setTempo] = useState('')
  const [musicStatus, setMusicStatus] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [jobError, setJobError] = useState(null)
  const [artifactUrl, setArtifactUrl] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [referenceArtifact, setReferenceArtifact] = useState(null)
  const [referenceError, setReferenceError] = useState(null)
  const [uploadingReference, setUploadingReference] = useState(false)
  const [rightsBasis, setRightsBasis] = useState('own')
  const [rightsAccepted, setRightsAccepted] = useState(false)

  const canExecute = musicStatus?.executableNow === true

  const fetchStatus = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    fetch('/api/admin/music/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setMusicStatus(data?.status ?? null))
      .catch(() => setMusicStatus(null))
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Poll job status when a job is active
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    const interval = setInterval(() => {
      fetch(`/api/admin/jobs/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data) => {
          setJobStatus(data.status)
          if (data.status === 'completed' && data.artifactId) {
            setArtifactUrl(`/api/admin/artifacts/${data.artifactId}/file`)
          }
          if (data.status === 'failed') {
            setJobError(data.error || 'Execution failed')
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [jobId, jobStatus])

  const handleGenerate = async () => {
    if (!prompt.trim() || submitting) return
    setSubmitting(true)
    setJobError(null)
    setArtifactUrl(null)

    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    try {
      const response = await fetch('/api/admin/music/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          instrumentalOnly: instrumental,
          genre: genre.trim() || undefined,
          mood: mood.trim() || undefined,
          tempo: tempo.trim() || undefined,
          durationSeconds,
          referenceAudioArtifactId: referenceArtifact?.artifactId || undefined,
        }),
      })
      const data = await response.json()
      if (response.status === 202 && data.jobId) {
        setJobId(data.jobId)
        setJobStatus(data.status)
      } else if (response.status === 409) {
        setJobError(data.message || 'Execution blocked')
      } else {
        setJobError(data.message || data.error || 'Request failed')
      }
    } catch (err) {
      setJobError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReferenceUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || uploadingReference) return
    setReferenceError(null)

    if (!rightsAccepted) {
      setReferenceError('Declare reference-track rights before upload.')
      event.target.value = ''
      return
    }

    setUploadingReference(true)
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const response = await fetch('/api/admin/music/reference-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'audio/mpeg',
          dataBase64,
          rights: {
            accepted: rightsAccepted,
            basis: rightsBasis,
            statement: `Admin declared ${rightsBasis} rights for ${file.name}`,
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Reference upload failed')
      setReferenceArtifact(data)
    } catch (err) {
      setReferenceError(err.message || 'Reference upload failed')
      setReferenceArtifact(null)
    } finally {
      setUploadingReference(false)
      event.target.value = ''
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Music Studio"
        subtitle={canExecute
          ? 'Generate instrumental music with GenX Lyria. Provider/model selection is handled by the runtime.'
          : 'Plan music generation requests. Execution is blocked until all implementation and configuration gates are met.'}
      />

      {!canExecute && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Execution Blocked
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {musicStatus?.blockedReason || 'Implementation gates not yet met.'}
          </p>
        </div>
      )}

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-cyan-300" /> Backend Truth</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Provider Client</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.providerClientExists)}`}>{statusLabel(musicStatus?.providerClientExists)}</Badge>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Worker Executor</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.workerExecutorExists)}`}>{statusLabel(musicStatus?.workerExecutorExists)}</Badge>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Queue Path</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.queuePathImplemented)}`}>{statusLabel(musicStatus?.queuePathImplemented)}</Badge>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Configured</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.configured)}`}>{statusLabel(musicStatus?.configured)}</Badge>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Executable Now</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.executableNow)}`}>{statusLabel(musicStatus?.executableNow)}</Badge>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Live Proven</div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(musicStatus?.liveProven)}`}>{musicStatus?.liveProven ? 'Yes' : 'No'}</Badge>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Instrumental</div>
            <div className="mt-1 text-xs text-emerald-300">{musicStatus?.instrumentalReady ? 'Ready' : 'Blocked'}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Vocals', musicStatus?.vocalsReady],
            ['Lyrics', musicStatus?.lyricsReady],
            ['Reference Analysis', musicStatus?.referenceAudioAnalysisReady],
            ['Direct Conditioning', musicStatus?.referenceAudioConditioningReady],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              <Badge variant="outline" className={`mt-2 text-[10px] ${statusClass(value)}`}>{value ? 'Ready' : 'Unavailable'}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music className="h-4 w-4 text-cyan-300" /> Create</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Song Prompt</label>
            <Input
              disabled={!canExecute}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the instrumental music you want to create..."
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input disabled={!canExecute} value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre" className="bg-white/[0.04] text-sm" />
            <Input disabled={!canExecute} value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Mood" className="bg-white/[0.04] text-sm" />
            <Input disabled={!canExecute} value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="Tempo" className="bg-white/[0.04] text-sm" />
            <Input disabled={!canExecute} type="number" min="15" max="300" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value) || 30)} className="bg-white/[0.04] text-sm" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs">Instrumental Only</span>
              <Switch disabled={!canExecute} checked={instrumental} onCheckedChange={setInstrumental} />
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <Upload className="h-3.5 w-3.5 text-cyan-300" /> Reference Track
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={rightsBasis}
                onChange={(e) => setRightsBasis(e.target.value)}
                className="rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-xs"
              >
                <option value="own">I own it</option>
                <option value="permission">I have permission</option>
                <option value="license">I have a licence</option>
                <option value="public_domain">Public domain</option>
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={rightsAccepted} onChange={(e) => setRightsAccepted(e.target.checked)} />
                Rights declared
              </label>
            </div>
            <div className="mt-3">
              <Input disabled={!canExecute || uploadingReference} type="file" accept="audio/*" onChange={handleReferenceUpload} className="bg-white/[0.04] text-xs" />
            </div>
            {referenceError && <p className="mt-2 text-[10px] text-red-300">{referenceError}</p>}
            {referenceArtifact && (
              <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-[10px] text-muted-foreground">
                <div className="font-semibold text-emerald-300">Reference analysed</div>
                <div>Artifact: {referenceArtifact.artifactId}</div>
                <div>Direct conditioning: {referenceArtifact.referenceAudioConditioningReady ? 'Ready' : 'Unavailable'}</div>
                <div>Profile: {referenceArtifact.profile?.energy || 'unknown'} energy, {referenceArtifact.profile?.loudness || 'unknown'} loudness</div>
              </div>
            )}
          </div>

          <Button
            disabled={!canExecute || !prompt.trim() || submitting}
            onClick={handleGenerate}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
            Generate Music
          </Button>
        </div>
      </Card>

      {(jobId || jobError || artifactUrl) && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-cyan-300" /> Job Status</h3>
          {jobId && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Job:</span>
              <code className="text-[10px] text-cyan-300">{jobId}</code>
              {jobStatus && (
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[jobStatus] || ''}`}>
                  {jobStatus}
                </Badge>
              )}
            </div>
          )}
          {jobError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-200">
                <XCircle className="h-3.5 w-3.5" /> Error
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{jobError}</p>
            </div>
          )}
          {jobStatus === 'completed' && !artifactUrl && (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle className="h-3.5 w-3.5" /> Completed — loading artifact...
            </div>
          )}
        </Card>
      )}

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music className="h-4 w-4 text-cyan-300" /> Player / Output</h3>
        <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
          {artifactUrl ? (
            <div className="w-full space-y-3">
              <audio controls src={artifactUrl} className="w-full" />
              <div className="flex justify-center">
                <a href={artifactUrl} download className="text-xs text-cyan-300 hover:underline">Download Audio</a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {canExecute
                ? 'Generate music to see output here.'
                : 'Execution blocked. Real audio artifacts will appear only after all gates are met.'}
            </p>
          )}
        </div>
      </Card>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">
          Provider/model selection is handled by the platform runtime. No manual overrides are exposed in app-facing flows.
          External apps request music capabilities only — they never call providers directly.
        </p>
      </div>
    </PageTransition>
  )
}
