'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, AlertTriangle, Database, HardDrive, Server, Zap, TrendingUp, Users, Clock, DollarSign } from 'lucide-react'

const INFRA_METRICS = [
  { label: 'API Health', icon: Server, status: 'not_wired', blocker: 'Health endpoint exists but live polling not implemented' },
  { label: 'Dashboard Health', icon: Zap, status: 'not_wired', blocker: 'Dashboard serves HTTP 200 but no uptime monitor wired' },
  { label: 'Worker Status', icon: Activity, status: 'not_wired', blocker: 'Worker health not polled from dashboard' },
  { label: 'MariaDB', icon: Database, status: 'not_wired', blocker: 'Prisma connection exists but no latency/health metric exposed' },
  { label: 'Redis', icon: Database, status: 'not_wired', blocker: 'Redis connection exists but no eviction/latency metric exposed' },
  { label: 'Qdrant', icon: Database, status: 'not_wired', blocker: 'Qdrant health endpoint exists but not polled from dashboard' },
  { label: 'Queue Depth', icon: Activity, status: 'not_wired', blocker: 'BullMQ queue exists but no dashboard metric endpoint' },
  { label: 'Storage / Disk', icon: HardDrive, status: 'not_wired', blocker: 'No storage metric endpoint exists yet' },
]

const CAPACITY_METRICS = [
  { label: 'Active Users', icon: Users, status: 'metric_pending' },
  { label: 'Jobs Queued', icon: Clock, status: 'metric_pending' },
  { label: 'Jobs Running', icon: Activity, status: 'metric_pending' },
  { label: 'Average Wait Time', icon: Clock, status: 'metric_pending' },
  { label: 'P95 Wait Time', icon: Clock, status: 'metric_pending' },
  { label: 'Provider Spend', icon: DollarSign, status: 'metric_pending' },
  { label: 'App Spend', icon: DollarSign, status: 'metric_pending' },
  { label: 'Revenue', icon: TrendingUp, status: 'metric_pending' },
  { label: 'Margin', icon: TrendingUp, status: 'metric_pending' },
  { label: 'Upgrade Warning', icon: AlertTriangle, status: 'metric_pending' },
]

const RECENT_FAILURES = [
  { label: 'Recent Failures', status: 'not_wired', blocker: 'No failure tracking endpoint exposed to dashboard' },
]

export default function OperationsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Operations"
        subtitle="Admin monitoring and control area. Honest state only — no fake metrics."
      />

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Metrics not wired yet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Each metric below shows its exact status. None are faked. These will be wired in future PRs as backend endpoints are added.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Infrastructure</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INFRA_METRICS.map(({ label, icon: Icon, status, blocker }) => (
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
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Capacity & Usage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CAPACITY_METRICS.map(({ label, icon: Icon }) => (
            <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
                <span className="text-[10px] font-medium">{label}</span>
              </div>
              <Badge variant="outline" className="mt-2 border-amber-500/30 text-amber-400 text-[9px]">
                metric pending
              </Badge>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Failures</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RECENT_FAILURES.map(({ label, status, blocker }) => (
            <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{label}</span>
                <AlertTriangle className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <Badge variant="outline" className="mt-2 border-amber-500/30 text-amber-400 text-[9px]">
                {status}
              </Badge>
              <p className="mt-2 text-[10px] text-muted-foreground/60">{blocker}</p>
            </Card>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
