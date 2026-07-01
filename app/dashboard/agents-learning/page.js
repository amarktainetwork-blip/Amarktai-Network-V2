'use client'
import { PageTransition, PageHeader, Reveal, StatusPill } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { ShieldCheck, TrendingUp, Activity, Lock } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts'

const TREND = Array.from({ length: 12 }, (_, i) => ({ t: `W${i + 1}`, jobs: 20 + Math.round(Math.sin(i / 2) * 12 + i * 4), success: 60 + Math.round(Math.cos(i / 3) * 15 + i * 2) }))
const PATTERNS = [
  { name: 'image.generate', v: 42 }, { name: 'text.chat', v: 88 }, { name: 'voice.tts', v: 31 }, { name: 'video.generate', v: 18 }, { name: 'rag.ingest', v: 24 },
]
const SEC_LOGS = [
  { app: 'Marketing App', tenant: 'tnt_a1', msg: 'Cross-tenant read denied — isolation enforced', level: 'blocked' },
  { app: 'Music App', tenant: 'tnt_b2', msg: 'Scope check passed for voice.tts', level: 'ok' },
  { app: 'Marketing App', tenant: 'tnt_a1', msg: 'Artifact access scoped to owning tenant', level: 'ok' },
  { app: 'Unknown', tenant: '—', msg: 'Invalid key rejected at gateway', level: 'blocked' },
]

export default function AgentsLearning() {
  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Agents & Learning" subtitle="Automated history trends, pattern metrics, and tenant isolation security logs." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-cyan-300" /> Automation history</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={TREND}>
              <defs><linearGradient id="c1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient><linearGradient id="c2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="t" stroke="#6b7280" fontSize={11} /><YAxis stroke="#6b7280" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0b0b12', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="jobs" stroke="#22d3ee" fill="url(#c1)" strokeWidth={2} />
              <Area type="monotone" dataKey="success" stroke="#a78bfa" fill="url(#c2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-violet-300" /> Capability pattern metrics</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={PATTERNS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={10} /><YAxis stroke="#6b7280" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0b0b12', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="v" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Tenant isolation security log</h3>
        <div className="space-y-2">
          {SEC_LOGS.map((l, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5 text-sm">
              <Lock className={`h-4 w-4 ${l.level === 'blocked' ? 'text-rose-300' : 'text-emerald-300'}`} />
              <span className="font-medium">{l.app}</span>
              <code className="font-mono text-xs text-muted-foreground">{l.tenant}</code>
              <span className="text-foreground/70">{l.msg}</span>
              <span className={`ml-auto text-xs ${l.level === 'blocked' ? 'text-rose-300' : 'text-emerald-300'}`}>{l.level}</span>
            </div>
          ))}
        </div>
      </Card>
    </PageTransition>
  )
}
