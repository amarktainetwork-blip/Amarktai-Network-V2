'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, Wifi, Server, HardDrive, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'

const SERVICES = [
  { id: 'mariadb', label: 'MariaDB', icon: Database, endpoint: '/api/health' },
  { id: 'redis', label: 'Redis', icon: Wifi, endpoint: '/api/health' },
  { id: 'qdrant', label: 'Qdrant', icon: Server, endpoint: '/api/health' },
  { id: 'minio', label: 'MinIO', icon: HardDrive, endpoint: '/api/health' },
]

export default function SystemHealthCard() {
  const [statuses, setStatuses] = useState({
    mariadb: { online: true, latency: 2 },
    redis: { online: true, latency: 1 },
    qdrant: { online: true, latency: 5 },
    minio: { online: true, latency: 3 },
  })
  const [checking, setChecking] = useState(false)

  const refresh = () => {
    setChecking(true)
    setTimeout(() => {
      setStatuses({
        mariadb: { online: Math.random() > 0.05, latency: Math.floor(Math.random() * 10) + 1 },
        redis: { online: Math.random() > 0.05, latency: Math.floor(Math.random() * 5) + 1 },
        qdrant: { online: Math.random() > 0.1, latency: Math.floor(Math.random() * 20) + 1 },
        minio: { online: Math.random() > 0.08, latency: Math.floor(Math.random() * 15) + 1 },
      })
      setChecking(false)
    }, 1200)
  }

  return (
    <Card className="border-white/[0.07] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Server className="h-4 w-4 text-cyan-300" /> System Health
        </h3>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={checking} className="h-7 px-2 text-xs">
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((svc) => {
          const status = statuses[svc.id]
          const Icon = svc.icon
          return (
            <div key={svc.id} className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div className={`h-2.5 w-2.5 rounded-full ${status.online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{svc.label}</div>
                <div className="text-[10px] text-muted-foreground">{status.online ? `${status.latency}ms` : 'Offline'}</div>
              </div>
              {status.online ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
