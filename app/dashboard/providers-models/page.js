'use client'
import { useState } from 'react'
import { PROVIDERS } from '@/lib/appdata'
import { PageTransition, PageHeader, StatusPill, Reveal } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Cpu, RefreshCw, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'

export default function ProvidersModels() {
  const [providers] = useState(PROVIDERS)
  const [syncing, setSyncing] = useState(false)
  const sync = () => { setSyncing(true); toast.loading('Synchronizing catalog…', { id: 's' }); setTimeout(() => { setSyncing(false); toast.success('Catalog synchronized', { id: 's' }) }, 1400) }

  const core = providers.filter((p) => p.tier === 'core')
  const exp = providers.filter((p) => p.tier === 'experimental')

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Providers & Models" subtitle="Core deployment pathways and isolated experimental workbenches.">
        <Button onClick={sync} disabled={syncing} variant="outline" className="border-white/15"><RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> Sync catalog</Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        {core.map((p, i) => (
          <div key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
            <Card className="relative h-full overflow-hidden border-white/[0.07] bg-white/[0.02] p-6">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Cpu className="h-5 w-5 text-cyan-300" /><span className="text-lg font-semibold">{p.name}</span></div>
                <StatusPill status="mock">Mock Active</StatusPill>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              <div className="mt-4 space-y-2">
                {p.models.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                    <code className="font-mono text-xs text-foreground/80">{m.id}</code>
                    <div className="flex items-center gap-2"><Badge variant="outline" className="border-white/10 text-[10px] uppercase">{m.kind}</Badge><span className="text-[11px] text-muted-foreground">{m.ctx}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>

      <Reveal>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-6">
          <div className="mb-4 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-amber-300" /><h3 className="font-semibold text-amber-200">Experimental Workbench</h3><span className="ml-2 text-xs text-amber-300/70">sandboxed · isolated from core routing</span></div>
          <div className="grid gap-4 md:grid-cols-2">
            {exp.map((p) => (
              <Card key={p.id} className="border-amber-500/20 bg-black/20 p-5">
                <div className="flex items-center justify-between"><span className="text-lg font-semibold">{p.name}</span><StatusPill status="experimental" /></div>
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-4 space-y-2">{p.models.map((m) => (<div key={m.id} className="flex items-center justify-between rounded-md border border-amber-500/15 bg-black/30 px-3 py-2"><code className="font-mono text-xs text-amber-100/80">{m.id}</code><Badge variant="outline" className="border-amber-500/20 text-[10px]">{m.kind}</Badge></div>))}</div>
              </Card>
            ))}
          </div>
        </div>
      </Reveal>
    </PageTransition>
  )
}
