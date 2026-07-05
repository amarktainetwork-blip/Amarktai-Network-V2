'use client'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'
import { Cpu, Gauge, KeyRound, Lock, Route, Settings } from 'lucide-react'

const COVERAGE = {
  genx: ['video.generate', 'video.longform planned', 'avatar.generate', 'music.generate'],
  groq: ['text.chat', 'voice.tts', 'voice.stt'],
  together: ['image.generate', 'image.edit', 'rag.ingest', 'rag.query'],
  mimo: ['text.reasoning', 'text.code'],
  deepinfra: ['uncensored.text gated only'],
}

export default function ProvidersPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Providers & Models" subtitle="Final provider contracts only. Tests and model sync stay disabled until backend provider routes exist.">
        <Link href="/dashboard/settings"><Button variant="outline" className="border-white/10 text-xs"><Settings className="mr-1.5 h-3.5 w-3.5" /> Settings</Button></Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {PROVIDER_CONTRACTS.map((provider) => (
          <Card key={provider.id} className="border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"><Cpu className="h-5 w-5 text-cyan-300" /></div>
                <div>
                  <h3 className="font-semibold">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground">{provider.role}</p>
                </div>
              </div>
              <Badge variant="outline" className={provider.gated ? 'border-amber-500/30 text-amber-400 text-[10px]' : 'border-cyan-500/30 text-cyan-300 text-[10px]'}>
                {provider.status}
              </Badge>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{provider.description}</p>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><div className="text-[10px] text-muted-foreground">Env var</div><div className="truncate text-xs font-mono">{provider.envKey}</div></div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><div className="text-[10px] text-muted-foreground">Proof</div><div className="text-xs">{provider.proofStatus}</div></div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><div className="text-[10px] text-muted-foreground">Key</div><div className="text-xs">missing_key</div></div>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {(COVERAGE[provider.id] || []).map((capability) => <Badge key={capability} variant="outline" className="border-white/10 text-[10px]">{capability}</Badge>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button disabled variant="outline" className="border-white/10 text-xs"><Lock className="mr-1 h-3 w-3" /> Test</Button>
              <Button disabled variant="outline" className="border-white/10 text-xs"><Route className="mr-1 h-3 w-3" /> Sync</Button>
              <Button disabled variant="outline" className="border-white/10 text-xs"><Gauge className="mr-1 h-3 w-3" /> Proof</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Model Catalog Contract</h3>
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-xs text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">Provider</th><th className="px-4 py-3 text-left">Catalog state</th><th className="px-4 py-3 text-left">Fallback order</th><th className="px-4 py-3 text-left">Cost / latency / quality</th></tr>
            </thead>
            <tbody>
              {PROVIDER_CONTRACTS.map((provider, index) => (
                <tr key={provider.id} className="border-t border-white/[0.04]">
                  <td className="px-4 py-3">{provider.name}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">backend_pending</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{provider.gated ? 'gated lane only' : `contract order ${index + 1}`}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">contract fields ready, live proof required</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageTransition>
  )
}
