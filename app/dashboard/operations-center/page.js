'use client'

import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, AlertTriangle, Database, HardDrive, Server, Zap } from 'lucide-react'

const OPS_METRICS = [
  { label: 'API Service', icon: Server, status: 'not_wired', blocker: 'Health endpoint exists but live polling not implemented' },
  { label: 'Dashboard Service', icon: Zap, status: 'not_wired', blocker: 'Dashboard serves HTTP 200 but no uptime monitor wired' },
  { label: 'Worker Service', icon: Activity, status: 'not_wired', blocker: 'Worker health not polled from dashboard' },
  { label: 'MariaDB', icon: Database, status: 'not_wired', blocker: 'Prisma connection exists but no latency/health metric exposed' },
  { label: 'Redis', icon: Database, status: 'not_wired', blocker: 'Redis connection exists but no eviction/latency metric exposed' },
  { label: 'Qdrant', icon: Database, status: 'not_wired', blocker: 'Qdrant health endpoint exists but not polled from dashboard' },
  { label: 'Storage/Disk', icon: HardDrive, status: 'not_wired', blocker: 'No storage metric endpoint exists yet' },
  { label: 'Queue Health', icon: Activity, status: 'not_wired', blocker: 'BullMQ queue exists but no dashboard metric endpoint' },
  { label: 'Provider Health', icon: AlertTriangle, status: 'not_wired', blocker: 'Provider health test exists but not polled as live metric' },
]

export default function OperationsCenterPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Network Operations Center"
        subtitle="Central monitor for VPS health, services, queues, and providers. Honest state only — no fake metrics."
      />

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Not wired yet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Each metric below shows its exact blocker. None are faked. These will be wired in future PRs as backend endpoints are added.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OPS_METRICS.map(({ label, icon: Icon, status, blocker }) => (
          <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground/40" />
            </div>
            <Badge variant="outline" className="mt-2 border-amber-500/30 text-amber-400 text-[9px]">
              {status}
            </Badge>
            <p className="mt-2 text-[10px] text-muted-foreground/60">{blocker}</p>
          </Card>
        ))}
      </div>
    </PageTransition>
  )
}
