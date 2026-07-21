'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { adminFetch } from '@/lib/admin-session'
import { Activity, Database, HardDrive, RefreshCw, Server, Wrench } from 'lucide-react'

const CHECK_META = {
  process: ['API process', Server],
  mariadb: ['MariaDB', Database],
  redis: ['Redis', Database],
  qdrant: ['Qdrant', Database],
  migrations: ['Migrations', Database],
  artifactStorage: ['Artifact storage', HardDrive],
  ffmpeg: ['FFmpeg', Wrench],
  worker: ['Worker heartbeat', Activity],
}

export default function OperationsPage() {
  const [health, setHealth] = useState(null)
  const [truth, setTruth] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [healthResponse, truthResponse] = await Promise.all([
        fetch('/api/system/health', { cache: 'no-store' }),
        adminFetch('/api/admin/truth', { cache: 'no-store' }),
      ])
      setHealth(await healthResponse.json())
      const truthPayload = await truthResponse.json()
      setTruth(truthPayload.truth ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const providers = truth?.providers ?? []
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="System Monitoring" subtitle="Readiness from live service checks and the canonical runtime truth.">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </PageHeader>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-semibold">Platform readiness</div><div className="text-xs text-muted-foreground">Process liveness is reported separately from dependency readiness.</div></div>
          <Badge variant="outline" className={health?.ready ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}>{health?.ready ? 'Ready' : health?.processAlive ? 'Degraded' : 'Unavailable'}</Badge>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(CHECK_META).map(([key, [label, Icon]]) => {
          const check = health?.checks?.[key]
          return <Card key={key} className="border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between"><span className="text-xs font-medium">{label}</span><Icon className="h-4 w-4 text-cyan-300" /></div>
            <Badge variant="outline" className={`mt-2 text-[9px] ${check?.ok ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>{check?.ok ? 'Healthy' : 'Unhealthy'}</Badge>
            {check?.latencyMs !== undefined && <div className="mt-2 text-[10px] text-muted-foreground">{check.latencyMs} ms</div>}
            {check?.error && <div className="mt-2 text-[10px] text-rose-200">{check.error}</div>}
          </Card>
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Approved providers" value={providers.length} />
        <Metric label="Runtime providers" value={providers.filter((provider) => provider.runtimeExecutionProvider).length} />
        <Metric label="Configured runtime" value={providers.filter((provider) => provider.runtimeExecutionProvider && provider.credentialConfigured).length} />
        <Metric label="Release candidates" value={truth?.releaseCandidateCapabilities?.length ?? 0} />
      </div>

      <div className="text-[10px] text-muted-foreground">Expected SHA: {health?.build?.gitSha ?? 'unknown'} · Worker SHA: {health?.checks?.worker?.gitSha ?? 'unknown'}</div>
    </PageTransition>
  )
}

function Metric({ label, value }) {
  return <Card className="border-white/[0.07] bg-white/[0.02] p-4"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></Card>
}
