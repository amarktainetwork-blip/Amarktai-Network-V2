'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { EmptyState, SkeletonCard } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cpu, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, Settings, Zap, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ProvidersPage() {
  const providers = useStudioStore((s) => s.providers) || []
  const models = useStudioStore((s) => s.models) || []
  const fetchProviders = useStudioStore((s) => s.fetchProviders)
  const fetchModels = useStudioStore((s) => s.fetchModels)
  const testProvider = useStudioStore((s) => s.testProvider)
  const syncModels = useStudioStore((s) => s.syncModels)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState({})
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { Promise.all([fetchProviders(), fetchModels()]).then(() => setLoading(false)) }, [])

  const handleTest = async (id) => {
    setTesting((p) => ({ ...p, [id]: true }))
    const ok = await testProvider(id)
    setTesting((p) => ({ ...p, [id]: false }))
    toast[ok ? 'success' : 'error'](ok ? 'Connection verified' : 'Connection failed', { description: `${id}: ${ok ? 'API reachable' : 'Invalid key or network error'}` })
  }

  const handleSync = async () => {
    setSyncing(true)
    await syncModels()
    setSyncing(false)
    toast.success('Models synced', { description: 'All provider model catalogs updated.' })
  }

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Providers & Models" subtitle="AI provider configuration and model catalog." /><div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Providers & Models" subtitle="AI provider configuration and model catalog.">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="border-white/10 text-xs">
          {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Sync Models
        </Button>
      </PageHeader>

      {/* Provider Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((p) => (
          <Card key={p.id} className="border-white/[0.07] bg-white/[0.02] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${p.status === 'active' ? 'bg-emerald-500/10' : p.status === 'experimental' ? 'bg-amber-500/10' : 'bg-rose-500/10'}`}>
                  <Cpu className={`h-5 w-5 ${p.status === 'active' ? 'text-emerald-400' : p.status === 'experimental' ? 'text-amber-400' : 'text-rose-400'}`} />
                </div>
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.capabilities.length} capabilities</div>
                </div>
              </div>
              <div className={`h-2.5 w-2.5 rounded-full ${p.status === 'active' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : p.status === 'experimental' ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'}`} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-1">Models</div>
                <div className="text-sm font-semibold">{p.modelCount}</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-1">Last Synced</div>
                <div className="text-xs">{p.lastSynced ? new Date(p.lastSynced).toLocaleTimeString() : 'Never'}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-4">
              {p.capabilities.map((c) => <Badge key={c} variant="outline" className="border-white/10 text-[10px]">{c}</Badge>)}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleTest(p.id)} disabled={testing[p.id]} className="flex-1 border-white/10 text-xs">
                {testing[p.id] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                {testing[p.id] ? 'Testing…' : 'Test Connection'}
              </Button>
              <Link href="/dashboard/settings"><Button variant="outline" size="sm" className="border-white/10 text-xs"><Settings className="mr-1 h-3 w-3" /> Configure</Button></Link>
            </div>
          </Card>
        ))}
      </div>

      {/* Model Catalog */}
      <Card className="border-white/[0.07] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Model Catalog</h3>
          <Badge variant="outline" className="border-white/10 text-xs">{models.length} models</Badge>
        </div>
        {models.length === 0 ? (
          <EmptyState icon={Cpu} title="No Models Synced" description="Click 'Sync Models' to fetch the latest model catalog from providers." className="py-8" />
        ) : (
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
                  <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 font-mono text-xs">{m.name}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="border-white/10 text-[10px]">{m.provider}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.capability}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] ${m.status === 'available' ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageTransition>
  )
}
