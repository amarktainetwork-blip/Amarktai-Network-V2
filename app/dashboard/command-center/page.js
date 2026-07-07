'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PROVIDER_CONTRACTS, OPEN_SOURCE_TOOLS } from '@/lib/dashboard-contract'
import {
  normalizeProviderStatuses,
  getHealthStatusLabel,
  getHealthStatusClasses,
} from '@/lib/provider-settings-contract'
import { Activity, AlertTriangle, ArrowRight, Boxes, Cpu, Database, FileClock, Lock, Server, ShieldCheck, Zap } from 'lucide-react'

const STATUS_GRID = [
  ['Dashboard UI status', 'ui_ready', Zap],
  ['API contract status', 'contract_ready', ShieldCheck],
  ['Provider proof status', 'live_proof_required', AlertTriangle],
  ['Backend integration status', 'backend_pending', Server],
]

const INFRA = ['MariaDB', 'Redis', 'Qdrant', 'Worker/BullMQ', 'Storage', 'Fastify API']

const PENDING = [
  ['jobs pending backend', 'No job rows are created until /api/v1/jobs is wired.'],
  ['artifacts pending backend', 'No artifact rows are created until signed storage is wired.'],
  ['provider health pending backend', 'Provider checks need real health routes.'],
  ['model catalog pending backend', 'Model sync is disabled until backend routes exist.'],
]

export default function CommandCenterPage() {
  const [providers, setProviders] = useState([])

  useEffect(() => {
    fetch('/api/admin/providers')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProviders(normalizeProviderStatuses(data))
        }
      })
      .catch(() => {
        setProviders(
          normalizeProviderStatuses(
            PROVIDER_CONTRACTS.map((p) => ({
              providerKey: p.id,
              displayName: p.name,
              healthStatus: 'unconfigured',
            }))
          )
        )
      })
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Command Center" subtitle="Frontend control room for contracts, backend-pending routes, and next integration work.">
        <Link href="/dashboard/studio">
          <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">Open Studio <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_GRID.map(([label, status, Icon]) => (
          <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-cyan-300" />
            </div>
            <Badge variant="outline" className="mt-3 border-cyan-500/30 text-cyan-300 text-[10px]">{status}</Badge>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-cyan-300" /> Infrastructure Contracts</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {INFRA.map((item) => (
              <div key={item} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-xs font-medium">{item}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">backend_pending</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-violet-300" /> Provider Status</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {providers.map((provider) => (
              <div key={provider.providerKey} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{provider.displayName}</span>
                  <Badge variant="outline" className={getHealthStatusClasses(provider.healthStatus)}>
                    {getHealthStatusLabel(provider.healthStatus)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4 text-amber-300" /> Backend-Pending Queue and Proof</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {PENDING.map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="text-xs font-semibold text-amber-200">{title}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4 text-cyan-300" /> Next Backend Routes</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            {['/api/v1/jobs', '/api/v1/artifacts', '/api/v1/providers/health', '/api/v1/models/sync', '/api/v1/apps'].map((route) => (
              <div key={route} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <code>{route}</code>
                <span>not_live_proven_yet</span>
              </div>
            ))}
          </div>
          <Button disabled variant="outline" className="mt-4 w-full border-white/10 text-xs"><Lock className="mr-1.5 h-3.5 w-3.5" /> Backend integration pending</Button>
        </Card>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" /> Open-Source Tool Contracts</h3>
        <div className="flex flex-wrap gap-2">
          {OPEN_SOURCE_TOOLS.map((tool) => <Badge key={tool.id} variant="outline" className="border-white/10 text-[10px]">{tool.name}</Badge>)}
        </div>
      </Card>
    </PageTransition>
  )
}
