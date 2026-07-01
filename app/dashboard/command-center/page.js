'use client'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Activity, Layers, Boxes, Play, Radio, AlertTriangle, Server, Database, Wifi } from 'lucide-react'
import { toast } from 'sonner'

function Ticker({ value }) {
  const [display, setDisplay] = useState(value || 0)
  useEffect(() => {
    const from = display
    const to = value || 0
    if (from === to) return
    const start = performance.now()
    const dur = 600
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="font-mono tabular-nums">{display}</span>
}

export default function CommandCenterPage() {
  const [stats, setStats] = useState(null)
  const [health, setHealth] = useState(null)
  const [events, setEvents] = useState([])

  const load = async () => {
    try {
      const [hRes, eRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json()).catch(() => null),
        fetch('/api/events').then((r) => r.json()).catch(() => ({ events: [] })),
      ])
      setHealth(hRes)
      setEvents(eRes?.events || [])
      setStats({
        jobs: { queued: 0, running: 0, completed: 0, failed: 0 },
        artifacts: 0,
        connections: 0,
      })
    } catch {}
  }

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [])

  const j = stats?.jobs || {}
  const checks = health?.checks || {}
  const alerts = []
  if (!checks.mariadb?.ok) alerts.push({ severity: 'critical', message: 'MariaDB connection failed' })
  if (!checks.redis?.ok) alerts.push({ severity: 'critical', message: 'Redis connection failed' })
  if (!checks.qdrant?.ok) alerts.push({ severity: 'warning', message: 'Qdrant unavailable — RAG features disabled' })

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Command Center" subtitle="Real-time system health and operational overview." />

      {/* System Status */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { name: 'MariaDB', icon: Database, ok: checks.mariadb?.ok, latency: checks.mariadb?.latencyMs },
          { name: 'Redis', icon: Wifi, ok: checks.redis?.ok, latency: checks.redis?.latencyMs },
          { name: 'Qdrant', icon: Server, ok: checks.qdrant?.ok, latency: checks.qdrant?.latencyMs },
        ].map((svc, i) => (
          <div key={svc.name} className="animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
            <Card className="relative overflow-hidden border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svc.icon className="h-4 w-4 text-cyan-300" />
                  <span className="font-semibold">{svc.name}</span>
                </div>
                <StatusPill status={svc.ok ? 'completed' : 'failed'}>{svc.ok ? 'Healthy' : 'Unreachable'}</StatusPill>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {svc.ok ? `Latency: ${svc.latency}ms` : 'Service unavailable'}
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Queue Depth */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Queued', value: j.queued, icon: Layers, c: 'text-slate-300' },
          { label: 'Running', value: j.running, icon: Activity, c: 'text-cyan-300' },
          { label: 'Completed', value: j.completed, icon: CheckCircle2, c: 'text-emerald-300' },
          { label: 'Artifacts', value: stats?.artifacts, icon: Boxes, c: 'text-violet-300' },
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
        {/* Action Required */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-300" /> Action Required
          </h3>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> All systems operational
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  a.severity === 'critical' ? 'border-red-500/20 bg-red-500/[0.06] text-red-300' : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300'
                }`}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />{a.message}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Event Wall */}
        <Card className="flex flex-col border-white/[0.07] bg-white/[0.02] p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-300" />
            <h3 className="font-semibold">Event Wall</h3>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />live
            </span>
          </div>
          <div className="mt-4 h-[280px] space-y-1.5 overflow-y-auto pr-1 font-mono text-xs hide-scrollbar">
            {events.length === 0 && <div className="text-muted-foreground">No events yet.</div>}
            {events.slice(0, 20).map((e, i) => (
              <div key={i} className="animate-fade-in flex gap-2 rounded border border-white/[0.04] bg-black/30 px-2.5 py-1.5">
                <span className="text-muted-foreground">{new Date(e.ts || Date.now()).toLocaleTimeString()}</span>
                <span className="text-foreground/80">{e.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
