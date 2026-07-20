'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Film, Loader2, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const CONFIRMATION = 'CONFIRM_PREMIUM_GENX_SPEND'
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function headers(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function credits(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)} credits` : 'Unknown'
}

export default function PremiumAdvertPage() {
  const [status, setStatus] = useState(null)
  const [campaignTitle, setCampaignTitle] = useState('Build Anything. Operate Everything.')
  const [prompt, setPrompt] = useState('Show how AmarktAI Network transforms one idea into an entire intelligent business through one orchestrated capability platform, with premium cinematic technology storytelling and an unforgettable brand close.')
  const [objective, setObjective] = useState('Make founders and operators immediately understand that AmarktAI replaces disconnected AI tools with one intelligent capability platform.')
  const [audience, setAudience] = useState('Founders, agencies, creators and operators building AI-powered products and businesses.')
  const [callToAction, setCallToAction] = useState('Build anything. Operate everything.')
  const [candidateCount, setCandidateCount] = useState(3)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [maxCredits, setMaxCredits] = useState(2000)
  const [reserveCredits, setReserveCredits] = useState(100)
  const [plan, setPlan] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const [execution, setExecution] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [finalising, setFinalising] = useState(false)
  const [error, setError] = useState('')

  const requestBody = useMemo(() => ({
    brandName: 'AmarktAI Network',
    campaignTitle: campaignTitle.trim(),
    prompt: prompt.trim(),
    objective: objective.trim(),
    audience: audience.trim(),
    callToAction: callToAction.trim(),
    targetDurationSeconds: 30,
    candidateCount,
    aspectRatio,
    style: 'cinematic premium global technology commercial with graphite, electric cyan and restrained violet art direction',
    tone: 'bold, intelligent, ambitious and emotionally uplifting',
    voiceStyle: 'confident premium commercial narration with controlled energy and an inspiring final resolve',
    musicBrief: 'Original cinematic electronic anthem with a restrained opening, escalating pulse, powerful orchestration reveal and memorable final resolve. Instrumental only, premium cinematic master.',
    maxCredits,
    reserveCredits,
  }), [campaignTitle, prompt, objective, audience, callToAction, candidateCount, aspectRatio, maxCredits, reserveCredits])

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/premium-advert/status', { headers: headers() })
      const data = await response.json()
      setStatus(data.status ?? null)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const pollExecution = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/admin/premium-advert/executions/${encodeURIComponent(id)}`, { headers: headers() })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Execution status failed')
      setExecution(data.execution)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Execution status failed')
    }
  }, [])

  useEffect(() => {
    if (!execution?.executionId || TERMINAL.has(execution.status) || execution.readyToFinalize) return
    const timer = window.setInterval(() => { void pollExecution(execution.executionId) }, 5000)
    return () => window.clearInterval(timer)
  }, [execution?.executionId, execution?.status, execution?.readyToFinalize, pollExecution])

  const createPlan = async () => {
    if (!prompt.trim() || planning) return
    setPlanning(true)
    setError('')
    setPlan(null)
    setExecution(null)
    setAccepted(false)
    try {
      const response = await fetch('/api/admin/premium-advert/plan', {
        method: 'POST', headers: headers(true), body: JSON.stringify(requestBody),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Premium advert planning failed')
      setPlan(data.plan)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Premium advert planning failed')
    } finally {
      setPlanning(false)
    }
  }

  const startGeneration = async () => {
    if (!plan || !accepted || generating) return
    setGenerating(true)
    setError('')
    try {
      const response = await fetch('/api/admin/premium-advert/generate', {
        method: 'POST', headers: headers(true), body: JSON.stringify({ ...requestBody, confirmation: CONFIRMATION }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Premium advert execution failed to start')
      await pollExecution(data.executionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Premium advert execution failed to start')
    } finally {
      setGenerating(false)
    }
  }

  const finalise = async () => {
    if (!execution?.executionId || !execution.readyToFinalize || finalising) return
    setFinalising(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/premium-advert/executions/${encodeURIComponent(execution.executionId)}/finalize`, {
        method: 'POST', headers: headers(),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Premium advert final assembly failed')
      setExecution(data.execution)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Premium advert final assembly failed')
    } finally {
      setFinalising(false)
    }
  }

  const groupedCandidates = useMemo(() => {
    const grouped = new Map()
    for (const candidate of execution?.candidates ?? []) {
      const scene = candidate.sceneNumber || 0
      grouped.set(scene, [...(grouped.get(scene) ?? []), candidate])
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0])
  }, [execution?.candidates])

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Premium AmarktAI Advert"
        subtitle="A paid GenX flagship benchmark: six shots, multiple candidates per shot, server-side winner selection, premium narration and Lyria music, then validated final assembly."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2"><Film className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-semibold">Campaign brief</h2></div>
          <div className="space-y-4">
            <Input value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} placeholder="Campaign title" />
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-28 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-cyan-400/50" placeholder="Describe the advert" />
            <textarea value={objective} onChange={(event) => setObjective(event.target.value)} className="min-h-20 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-cyan-400/50" placeholder="Objective" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Audience" />
              <Input value={callToAction} onChange={(event) => setCallToAction(event.target.value)} placeholder="Call to action" />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="space-y-1 text-xs text-muted-foreground"><span>Candidates per scene</span><select value={candidateCount} onChange={(event) => setCandidateCount(Number(event.target.value))} className="h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 text-sm"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
              <label className="space-y-1 text-xs text-muted-foreground"><span>Master ratio</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} className="h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 text-sm"><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label>
              <label className="space-y-1 text-xs text-muted-foreground"><span>Maximum credits</span><Input type="number" min="1" value={maxCredits} onChange={(event) => setMaxCredits(Number(event.target.value) || 1)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground"><span>Reserve credits</span><Input type="number" min="0" value={reserveCredits} onChange={(event) => setReserveCredits(Number(event.target.value) || 0)} /></label>
            </div>
            <Button onClick={createPlan} disabled={planning || !prompt.trim()} className="w-full">{planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Check flagship routes and exact spend</Button>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 text-sm font-semibold">Production readiness</div>
          <div className="space-y-2">
            {(status?.requiredCapabilities ?? []).map((item) => (
              <div key={item.capability} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs">
                <span>{item.capability.replaceAll('_', ' ')}</span>
                {item.executableNow ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
              </div>
            ))}
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs text-muted-foreground">Provider and model selection remain server-side. The workspace shows execution evidence only after the runtime has selected the route.</div>
          </div>
        </Card>
      </div>

      {error && <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {plan && (
        <Card className="border-cyan-500/20 bg-cyan-500/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Immutable premium plan</h2><p className="mt-1 text-xs text-muted-foreground">6 scenes · {plan.candidatesPerScene} candidates each · {plan.candidateCount} paid video candidates total</p></div><Badge variant="outline" className={plan.spend?.allowed ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}>{plan.spend?.allowed ? 'Spend approved' : 'Blocked'}</Badge></div>
          <div className="mt-4 grid gap-3 md:grid-cols-4"><Metric label="Video route" value={plan.routes?.video?.model} /><Metric label="Narration" value={plan.routes?.narration?.model} /><Metric label="Music" value={plan.routes?.music?.model} /><Metric label="Estimated total" value={credits(plan.spend?.estimatedCredits)} /></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{plan.scenes?.map((scene) => <div key={scene.sceneNumber} className="rounded-md border border-white/[0.06] bg-black/20 p-3"><div className="text-xs font-semibold">{scene.sceneNumber}. {scene.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{scene.durationSeconds}s · {scene.objective}</div></div>)}</div>
          {plan.spend?.blockers?.length > 0 && <p className="mt-3 text-xs text-red-300">{plan.spend.blockers.join(', ')}</p>}
          <label className="mt-4 flex items-start gap-3 rounded-md border border-white/[0.08] bg-black/20 p-3"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" /><span className="text-xs text-muted-foreground">I approve the displayed ceiling. Generation will recheck model access, exact pricing, balance and reserve before any paid jobs start.</span></label>
          <Button onClick={startGeneration} disabled={!plan.spend?.allowed || !accepted || generating} className="mt-4 w-full">{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate all premium candidates</Button>
        </Card>
      )}

      {execution && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Premium execution</h2><p className="mt-1 text-xs text-muted-foreground">{execution.executionId}</p></div><Badge variant="outline">{execution.workflowPhase || execution.status}</Badge></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{groupedCandidates.map(([sceneNumber, candidates]) => <div key={sceneNumber} className="rounded-lg border border-white/[0.07] bg-black/20 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium">Scene {sceneNumber}</span><span className="text-[11px] text-muted-foreground">{candidates.filter((item) => item.status === 'completed').length}/{candidates.length} complete</span></div><div className="space-y-2">{candidates.map((candidate) => <div key={candidate.jobId} className="flex items-center justify-between gap-3 rounded border border-white/[0.05] px-3 py-2 text-xs"><div><div>Candidate {candidate.candidateIndex}</div>{candidate.model && <div className="mt-0.5 text-[10px] text-muted-foreground">{candidate.provider} / {candidate.model}</div>}</div><Badge variant="outline">{candidate.status}</Badge></div>)}</div></div>)}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><ComponentState label="Narration" value={execution.narration} /><ComponentState label="Original Lyria music" value={execution.music} /></div>
          {execution.readyToFinalize && !execution.finalArtifactId && <Button onClick={finalise} disabled={finalising} className="mt-4 w-full">{finalising ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}Score candidates and assemble winners</Button>}
          {execution.finalArtifactId && <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Premium advert saved to dashboard artifacts</div><video controls preload="metadata" className="w-full rounded-lg bg-black" src={`/api/admin/artifacts/${execution.finalArtifactId}/file`} /><a href={`/api/admin/artifacts/${execution.finalArtifactId}/file?download=1`} className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-300 hover:text-cyan-200"><Download className="h-3.5 w-3.5" />Download final MP4</a></div>}
        </Card>
      )}
    </PageTransition>
  )
}

function Metric({ label, value }) {
  return <div className="rounded-md border border-white/[0.06] bg-black/20 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 break-words text-xs font-medium">{value || 'Unavailable'}</div></div>
}

function ComponentState({ label, value }) {
  return <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 p-3"><div><div className="text-xs font-medium">{label}</div>{value?.model && <div className="mt-1 text-[10px] text-muted-foreground">{value.provider} / {value.model}</div>}</div><Badge variant="outline">{value?.status || 'waiting'}</Badge></div>
}
