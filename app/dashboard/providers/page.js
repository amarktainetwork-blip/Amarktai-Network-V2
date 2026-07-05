'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { SkeletonCard } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cpu, Lock, Settings } from 'lucide-react'
import Link from 'next/link'

const statusMeta = {
  configured: { label: 'Configured', dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  gated_backend_pending: { label: 'Gated Backend Pending', dot: 'bg-amber-400', text: 'text-amber-400', border: 'border-amber-500/30' },
  backend_pending: { label: 'Backend Pending', dot: 'bg-cyan-400', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

export default function ProvidersPage() {
  const providers = useStudioStore((s) => s.providers) || []
  const models = useStudioStore((s) => s.models) || []
  const fetchProviders = useStudioStore((s) => s.fetchProviders)
  const fetchModels = useStudioStore((s) => s.fetchModels)
  const [loading, setLoading] = useState(true)

  useEffect(() => { Promise.all([fetchProviders(), fetchModels()]).then(() => setLoading(false)) }, [])

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Providers & Models" subtitle="AI provider configuration and model catalog." /><div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}</div></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Providers & Models" subtitle="Final provider contracts. Live tests are disabled until backend health endpoints exist." />

      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((p) => {
          const meta = statusMeta[p.status] || statusMeta.backend_pending
          return (
            <Card key={p.id} className="border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                    <Cpu className={`h-5 w-5 ${meta.text}`} />
                  </div>
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.capabilities.length} contract capabilities</div>
                  </div>
                </div>
                <div className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Models</div>
                  <div className="text-sm font-semibold">{p.modelCount}</div>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Proof</div>
                  <div className="text-xs">Not live proven</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {p.capabilities.map((c) => <Badge key={c} variant="outline" className="border-white/10 text-[10px]">{c}</Badge>)}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled title="Backend integration pending" className="flex-1 border-white/10 text-xs opacity-70">
                  <Lock className="mr-1 h-3 w-3" /> Backend Pending
                </Button>
                <Link href="/dashboard/settings"><Button variant="outline" size="sm" className="border-white/10 text-xs"><Settings className="mr-1 h-3 w-3" /> Configure</Button></Link>
              </div>
              <Badge variant="outline" className={`mt-4 text-[10px] ${meta.border} ${meta.text}`}>{meta.label}</Badge>
            </Card>
          )
        })}
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Model Catalog Contracts</h3>
          <Badge variant="outline" className="border-white/10 text-xs">{models.length} contract rows</Badge>
        </div>
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Capability</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-white/[0.04]">
                  <td className="px-4 py-3 font-mono text-xs">{m.name}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="border-white/10 text-[10px]">{m.provider}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.capability}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[10px]">{m.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageTransition>
  )
}
