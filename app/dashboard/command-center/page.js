'use client'
import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageTransition, PageHeader, StatusPill, Reveal } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, Activity, Layers, Boxes, Plug, Play, Radio } from 'lucide-react'
import { toast } from 'sonner'

function Ticker({ value }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    const to = value || 0
    const start = performance.now()
    const dur = 600
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    prev.current = to
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="font-mono tabular-nums">{display}</span>
}

const LEVEL_COLOR = { info: 'text-cyan-300', success: 'text-emerald-300', error: 'text-rose-300', warn: 'text-amber-300' }

export default function CommandCenter() {
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [s, e] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/events').then((r) => r.json()),
      ])
      setStats(s)
      setEvents(e.events || [])
    } catch (_) {}
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 2500)
    return () => clearInterval(i)
  }, [])

  const runDemo = async () => {
    setBusy(true)
    const types = ['text.chat', 'image.generate', 'voice.tts']
    const type = types[Math.floor(Math.random() * types.length)]
    await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: 'Demo task', payload: { prompt: 'Command center demo run' } }) })
    toast.success('Demo job enqueued', { description: `${type} · watch the event wall` })
    setTimeout(load, 400)
    setBusy(false)
  }

  const j = stats?.jobs || {}
  const providers = stats?.providers || []
  const readiness = stats?.readiness || []
  const doneCount = readiness.filter((r) => r.done).length

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Command Center" subtitle="Executive operational summary of the AmarktAI Network control plane.">
        <Button onClick={runDemo} disabled={busy} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Play className="mr-1.5 h-4 w-4" /> Run demo job
        </Button>
      </PageHeader>

      {/* Connectivity grid */}
      <Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {providers.filter((p) => p.tier === 'core').map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card className="relative overflow-hidden border-white/[0.07] bg-white/[0.02] p-5">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-cyan-300" /><span className="font-semibold">{p.name}</span></div>
                  <StatusPill status="mock">Mock Mode</StatusPill>
                </div>
                <div className="mt-4 flex items-end gap-1">
                  {[...Array(16)].map((_, k) => (
                    <motion.span key={k} className="w-1.5 rounded-sm bg-gradient-to-t from-cyan-500/30 to-cyan-300"
                      animate={{ height: [6, 8 + ((k * 7) % 22), 6] }} transition={{ duration: 1.6, repeat: Infinity, delay: k * 0.06 }} />
                  ))}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Connectivity nominal · simulated stream</div>
              </Card>
            </motion.div>
          ))}
        </div>
      </Reveal>

      {/* Tickers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Queued', value: j.queued, icon: Layers, c: 'text-slate-300' },
          { label: 'Running', value: j.running, icon: Activity, c: 'text-cyan-300' },
          { label: 'Completed', value: j.completed, icon: CheckCircle2, c: 'text-emerald-300' },
          { label: 'Artifacts', value: stats?.artifacts, icon: Boxes, c: 'text-violet-300' },
        ].map((t, i) => (
          <motion.div key={t.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-sm">{t.label}</span>
                <t.icon className={`h-4 w-4 ${t.c}`} />
              </div>
              <div className="mt-2 text-3xl font-bold"><Ticker value={t.value || 0} /></div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Launch readiness */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Launch Readiness</h3>
            <span className="text-xs text-muted-foreground">{doneCount}/{readiness.length} ready</span>
          </div>
          <Progress value={(doneCount / (readiness.length || 1)) * 100} className="mt-3 h-1.5" />
          <div className="mt-4 space-y-2">
            {readiness.map((r) => (
              <div key={r.key} className="flex items-center gap-3 rounded-md border border-white/[0.05] bg-white/[0.015] px-3 py-2">
                {r.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={r.done ? 'text-sm' : 'text-sm text-muted-foreground'}>{r.label}</span>
                {!r.done && <span className="ml-auto text-xs text-amber-300/80">missing</span>}
              </div>
            ))}
          </div>
        </Card>

        {/* Event wall */}
        <Card className="flex flex-col border-white/[0.07] bg-white/[0.02] p-6">
          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold">Streaming Event Wall</h3><span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />live</span></div>
          <div className="mt-4 h-[320px] space-y-1.5 overflow-y-auto pr-1 font-mono text-xs hide-scrollbar">
            <AnimatePresence initial={false}>
              {events.length === 0 && <div className="text-muted-foreground">No events yet — run a demo job.</div>}
              {events.map((e) => (
                <motion.div key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 rounded border border-white/[0.04] bg-black/30 px-2.5 py-1.5">
                  <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className={LEVEL_COLOR[e.level] || 'text-foreground'}>[{e.level}]</span>
                  <span className="text-foreground/80">{e.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
