'use client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, Wifi, Server, HardDrive, Clock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const SERVICES = [
  { id: 'mariadb', label: 'MariaDB', icon: Database, endpoint: '/api/v1/health' },
  { id: 'redis', label: 'Redis', icon: Wifi, endpoint: '/api/v1/health' },
  { id: 'qdrant', label: 'Qdrant', icon: Server, endpoint: '/api/v1/health' },
  { id: 'minio', label: 'MinIO/local storage', icon: HardDrive, endpoint: '/api/v1/health' },
]

export default function SystemHealthCard() {
  const refresh = () => {
    toast.info('Backend integration pending', {
      description: 'Wire this card to /api/v1/health before displaying live readiness.',
    })
  }

  return (
    <Card className="border-white/[0.07] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Server className="h-4 w-4 text-cyan-300" /> System Health
        </h3>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-7 px-2 text-xs" title="Backend integration pending">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((svc) => {
          const Icon = svc.icon
          return (
            <div key={svc.id} className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.35)]" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{svc.label}</div>
                <div className="text-[10px] text-muted-foreground">Backend pending</div>
              </div>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <Clock className="h-3.5 w-3.5 text-amber-400" />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
