'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Music2, ShieldCheck, Sparkles, Loader2, AlertTriangle, CheckCircle2, Download } from 'lucide-react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const CONFIRMATION = 'CONFIRM_PREMIUM_GENX_SPEND'
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function money(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)} credits` : 'Unknown'
}

export default function FullSongStudioPage() {
  const [status, setStatus] = useState(null)
  const [title, setTitle] = useState('Build Anything')
  const [prompt, setPrompt] = useState('An unforgettable original anthem for AmarktAI Network about turning one idea into an entire intelligent business, with a massive emotional chorus and cinematic final lift.')
  const [genre, setGenre] = useState('cinematic contemporary pop')
  const [mood, setMood] = useState('bold, inspiring, futuristic and emotionally uplifting')
  const [language, setLanguage] = useState('English')
  const [vocalStyle, setVocalStyle] = useState('powerful modern lead vocal with polished stacked harmonies and an arena-sized final chorus')
  const [durationSeconds, setDurationSeconds] = useState(180)
  const [lyricsMode, setLyricsMode] = useState('generated')
  const [lyrics, setLyrics] = useState('')
  const [instrumentalVersion, setInstrumentalVersion] = useState(true)
  const [adCutSeconds, setAdCutSeconds] = useState(30)
  const [masteringProfile, setMasteringProfile] = useState('streaming')
  const [maxCredits, setMaxCredits] = useState(500)
  const [reserveCredits, setReserveCredits] = useState(50)
  const [plan, setPlan] = useState(null)
  const [packageId, setPackageId] = useState(null)
  const [jobs, setJobs] = useState([])
  const [accepted, setAccepted] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const requestBody = useMemo(() => ({
    title: title.trim() || undefined,
    prompt: prompt.trim(),
    genre: genre.trim(),
    mood: mood.trim(),
    language: language.trim(),
    vocalStyle: vocalStyle.trim(),
    durationSeconds,
    lyricsMode,
    lyrics: lyricsMode === 'provided' ? lyrics.trim() : undefined,
    instrumentalVersion,
    adCutSeconds,
    masteringProfile,
    maxCredits,
    reserveCredits,
  }), [title, prompt, genre, mood, language, vocalStyle, durationSeconds, lyricsMode, lyrics, instrumentalVersion, adCutSeconds, masteringProfile, maxCredits, reserveCredits])

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/song/status', { headers: authHeaders() })
      const data = await response.json()
      setStatus(data.status ?? null)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  useEffect(() => {
    if (!jobs.length || jobs.every((job) => TERMINAL.has(job.status))) return
    const interval = window.setInterval(async () => {
      const updated = await Promise.all(jobs.map(async (job) => {
        if (TERMINAL.has(job.status)) return job
        try {
          const response = await fetch(`/api/admin/jobs/${job.id}`, { headers: authHeaders() })
          const data = await response.json()
          return {
            ...job,
            status: data.status ?? job.status,
            provider: data.provider ?? job.provider,
            model: data.model ?? job.model,
            artifactId: data.artifactId ?? job.artifactId,
            error: data.error ?? null,
          }
        } catch {
          return job
        }
      }))
      setJobs(updated)
    }, 3500)
    return () => window.clearInterval(interval)
  }, [jobs])

  const planSong = async () => {
    if (!requestBody.prompt || planning) return
    setPlanning(true)
    setError('')
    setPlan(null)
    setAccepted(false)
    try {
      const response = await fetch('/api/admin/song/plan', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(requestBody),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Full-song planning failed')
      setPlan(data.plan)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Full-song planning failed')
    } finally {
      setPlanning(false)
    }
  }

  const generateSong = async () => {
    if (!plan || !accepted || generating) return
    setGenerating(true)
    setError('')
    setJobs([])
    try {
      const response = await fetch('/api/admin/song/generate', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ ...requestBody, confirmation: CONFIRMATION }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Full-song package could not be started')
      setPackageId(data.packageId)
      setPlan(data.plan)
      setJobs((data.jobs ?? []).map((job) => ({ ...job, provider: null, model: null, artifactId: null, error: null })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Full-song package could not be started')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Full Song Studio"
        subtitle="Create an original premium song package with GenX Lyria 3 Pro. Runtime selection, account pricing and credit protection are enforced server-side."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">Song brief</h2>
          </div>
          <div className="space-y-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the story, hook and emotional outcome"
              className="min-h-32 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Genre" />
              <Input value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Mood" />
              <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language" />
              <Input value={vocalStyle} onChange={(event) => setVocalStyle(event.target.value)} placeholder="Vocal direction" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Duration seconds</span>
                <Input type="number" min="60" max="300" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) || 180)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Advert cut seconds</span>
                <Input type="number" min="15" max="60" value={adCutSeconds} onChange={(event) => setAdCutSeconds(Number(event.target.value) || 30)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Mastering</span>
                <select value={masteringProfile} onChange={(event) => setMasteringProfile(event.target.value)} className="h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 text-sm">
                  <option value="streaming">Streaming</option>
                  <option value="broadcast">Broadcast</option>
                  <option value="cinematic">Cinematic</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Lyrics</span>
                <select value={lyricsMode} onChange={(event) => setLyricsMode(event.target.value)} className="h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 text-sm">
                  <option value="generated">Generate original lyrics</option>
                  <option value="provided">Use my original lyrics</option>
                </select>
              </label>
              <div className="flex items-end justify-between rounded-md border border-white/[0.08] bg-black/20 px-3 py-2">
                <span className="text-xs">Create matching instrumental master</span>
                <Switch checked={instrumentalVersion} onCheckedChange={setInstrumentalVersion} />
              </div>
            </div>
            {lyricsMode === 'provided' && (
              <textarea
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
                placeholder="Paste only lyrics that you own or are authorised to use"
                className="min-h-44 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Maximum GenX credits</span>
                <Input type="number" min="1" value={maxCredits} onChange={(event) => setMaxCredits(Number(event.target.value) || 1)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Credits to keep in reserve</span>
                <Input type="number" min="0" value={reserveCredits} onChange={(event) => setReserveCredits(Number(event.target.value) || 0)} />
              </label>
            </div>
            <Button onClick={planSong} disabled={planning || !prompt.trim()} className="w-full">
              {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Check premium route and spend
            </Button>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Music2 className="h-4 w-4 text-violet-300" />
            <h2 className="text-sm font-semibold">Production truth</h2>
          </div>
          <div className="space-y-3 text-xs">
            <Truth label="Executable" value={status?.executableNow === true} />
            <Truth label="Live proven" value={status?.liveProven === true} />
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
              <div className="text-muted-foreground">Premium family</div>
              <div className="mt-1 font-medium">{status?.premiumModelFamily || 'Lyria 3 Pro'}</div>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-muted-foreground">
              No provider or model control is exposed. The backend selects and records the exact account-accessible route.
            </div>
          </div>
        </Card>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {plan && (
        <Card className="border-cyan-500/20 bg-cyan-500/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Premium package preflight</div>
              <div className="mt-1 text-xs text-muted-foreground">{plan.variants?.length || 0} masters · {plan.durationSeconds}s · {plan.masteringProfile}</div>
            </div>
            <Badge variant="outline" className={plan.spend?.allowed ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}>
              {plan.spend?.allowed ? 'Spend approved' : 'Blocked'}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Selected route" value={`${plan.selectedProvider} / ${plan.selectedModel}`} />
            <Metric label="Estimated total" value={money(plan.spend?.estimatedCredits)} />
            <Metric label="Available after reserve" value={money(plan.spend?.availableAfterReserve)} />
          </div>
          {plan.spend?.blockers?.length > 0 && <p className="mt-3 text-xs text-red-300">{plan.spend.blockers.join(', ')}</p>}
          <label className="mt-4 flex items-start gap-3 rounded-md border border-white/[0.08] bg-black/20 p-3">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
            <span className="text-xs text-muted-foreground">I approve the displayed maximum-credit ceiling. The server will reject the package if pricing, balance, route or reserve conditions change.</span>
          </label>
          <Button onClick={generateSong} disabled={!plan.spend?.allowed || !accepted || generating} className="mt-4 w-full">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate premium song package
          </Button>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Song package</h2>
              <p className="mt-1 text-xs text-muted-foreground">{packageId}</p>
            </div>
            <Badge variant="outline">{jobs.filter((job) => job.status === 'completed').length}/{jobs.length} complete</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{job.variant === 'vocal_master' ? 'Vocal master' : 'Instrumental master'}</div>
                  <Badge variant="outline">{job.status}</Badge>
                </div>
                {job.provider && <div className="mt-2 text-[11px] text-muted-foreground">Executed by {job.provider} / {job.model}</div>}
                {job.status === 'processing' || job.status === 'queued' ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-cyan-300" /> : null}
                {job.error && <p className="mt-3 text-xs text-red-300">{job.error}</p>}
                {job.artifactId && (
                  <div className="mt-4 space-y-3">
                    <audio controls preload="metadata" className="w-full" src={`/api/admin/artifacts/${job.artifactId}/file`} />
                    <a href={`/api/admin/artifacts/${job.artifactId}/file?download=1`} className="inline-flex items-center gap-2 text-xs text-cyan-300 hover:text-cyan-200">
                      <Download className="h-3.5 w-3.5" /> Download master
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageTransition>
  )
}

function Truth({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 p-3">
      <span className="text-muted-foreground">{label}</span>
      {value ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xs font-medium">{value}</div>
    </div>
  )
}
