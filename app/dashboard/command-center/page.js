'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { EmptyState, SkeletonCard } from '@/components/amarkt/EmptyState'
import SystemHealthCard from '@/components/amarkt/SystemHealthCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2, Activity, Layers, Boxes, AlertTriangle, Server, Database, Wifi,
  Cpu, Zap, Clock, ArrowRight, RefreshCw, Loader2
} from 'lucide-react'
import Link from 'next/link'

function Ticker({ value }) {
  const [display, setDisplay] = useState(value || 0)
  useEffect(() => {
    const from = display; const to = value || 0
    if (from === to) return
    const start = performance.now(); const dur = 600; let raf
    const tick = (now) => { const t = Math.min(1, (now - start) / dur); setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)))); if (t < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="font-mono tabular-nums">{display}</span>
}

export default function CommandCenterPage() {
  const jobs = useStudioStore((s) => s.jobs) || []
  const providers = useStudioStore((s) => s.providers) || []
  const fetchProviders = useStudioStore((s) => s.fetchProviders)
  const fetchJobs = useStudioStore((s) => s.fetchJobs)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    Promise.all([fetchProviders(), fetchJobs()]).then(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchProviders(), fetchJobs()])
    setRefreshing(false)
    toast.success('Dashboard refreshed')
  }

  const j = { queued: jobs.filter((j) => j.status === 'queued').length, processing: jobs.filter((j) => j.status === 'processing').length, completed: jobs.filter((j) => j.status === 'completed').length, failed: jobs.filter((j) => j.status === 'failed').length }
  const recentJobs = jobs.slice(0, 10)
  const blockers = providers.filter((p) => p.status === 'needs-config' || p.status === 'error')
  const capabilityCount = new Set(providers.flatMap((p) => p.capabilities)).size

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Command Center" subtitle="Real-time system health and operational overview." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Command Center" subtitle="Real-time system health and operational overview.">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="border-white/10 text-xs">
            {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Refresh
          </Button>
          <Button variant="outline" size="sm" disabled className="border-amber-500/30 text-amber-300 text-xs opacity-70">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Backend Pending
          </Button>
        </div>
      </PageHeader>

      {/* Provider Status */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p, i) => (
          <div key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
            <Card className="relative overflow-hidden border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-cyan-300" />
                  <span className="font-semibold text-sm">{p.name}</span>
                </div>
                <div className={`h-2.5 w-2.5 rounded-full ${p.status === 'configured' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : p.status === 'gated_backend_pending' ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.35)]'}`} />
              </div>
              <div className="text-xs text-muted-foreground mb-2">{p.capabilities.length} capabilities · {p.modelCount} models</div>
              <Badge variant="outline" className={`text-[10px] ${p.status === 'configured' ? 'border-emerald-500/30 text-emerald-400' : p.status === 'gated_backend_pending' ? 'border-amber-500/30 text-amber-400' : 'border-cyan-500/30 text-cyan-400'}`}>
                {p.status === 'configured' ? 'Configured' : p.status === 'gated_backend_pending' ? 'Gated Pending' : 'Backend Pending'}
              </Badge>
            </Card>
          </div>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Queued', value: j.queued, icon: Layers, c: 'text-slate-300' },
          { label: 'Processing', value: j.processing, icon: Activity, c: 'text-cyan-300' },
          { label: 'Completed', value: j.completed, icon: CheckCircle2, c: 'text-emerald-300' },
          { label: 'Capabilities', value: capabilityCount, icon: Zap, c: 'text-violet-300' },
        ].map((t, i) => (
          <div key={t.label} className="animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
            <Card className="border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-sm">{t.label}</span>
                <t.icon className={`h-4 w-4 ${t.c}`} />
              </div>
              <div className="mt-2 text-3xl font-bold"><Ticker value={t.value || 0} /></div>
            </Card>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Health */}
        <SystemHealthCard />

        {/* Top Blockers */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-300" /> Top Blockers</h3>
          {blockers.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> No blockers detected
            </div>
          ) : (
            <div className="space-y-2">
              {blockers.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{b.name}: {b.status === 'needs-config' ? 'API key not configured' : 'Connection error'}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Jobs */}
      <Card className="border-white/[0.07] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-cyan-300" /> Recent Jobs</h3>
          <Link href="/dashboard/jobs"><Button variant="ghost" size="sm" className="text-xs text-muted-foreground">View All <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
        </div>
        {recentJobs.length === 0 ? (
          <EmptyState icon={Boxes} title="No Jobs Yet" description="Run a capability from the Studio to see jobs here." className="py-8" />
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-4 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{job.capability}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${job.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' : job.status === 'failed' ? 'border-rose-500/30 text-rose-400' : job.status === 'processing' ? 'border-cyan-500/30 text-cyan-400' : 'border-slate-500/30 text-slate-400'}`}>
                  {job.status}
                </Badge>
                {job.duration && <span className="text-[10px] text-muted-foreground font-mono">{(job.duration / 1000).toFixed(1)}s</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageTransition>
  )
}
