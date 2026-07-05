'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Boxes, Eye, Filter, Lock, Search } from 'lucide-react'

export default function JobsPage() {
  const [tab, setTab] = useState('jobs')
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Jobs & Artifacts" subtitle="Real jobs and artifacts will appear after backend integration.">
        <div className="flex gap-2">
          <Button variant={tab === 'jobs' ? 'default' : 'outline'} size="sm" onClick={() => setTab('jobs')} className={tab === 'jobs' ? 'text-xs' : 'border-white/10 text-xs'}>Jobs</Button>
          <Button variant={tab === 'artifacts' ? 'default' : 'outline'} size="sm" onClick={() => setTab('artifacts')} className={tab === 'artifacts' ? 'text-xs' : 'border-white/10 text-xs'}>Artifacts</Button>
        </div>
      </PageHeader>

      <Card className="border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by job id, provider, capability..." className="h-9 w-72 bg-black/20 text-xs" />
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select defaultValue="all"><SelectTrigger className="h-9 w-36 bg-black/20 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="backend_pending">backend_pending</SelectItem></SelectContent></Select>
          <Select defaultValue="all"><SelectTrigger className="h-9 w-44 bg-black/20 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All capabilities</SelectItem></SelectContent></Select>
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">pagination ui_ready</Badge>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <Boxes className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold">{tab === 'jobs' ? 'No backend jobs loaded' : 'No backend artifacts loaded'}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Real jobs and artifacts will appear after backend integration.</p>
          <Link href="/dashboard/studio"><Button className="mt-6 bg-gradient-to-r from-cyan-400 to-violet-500 text-black">Open Studio</Button></Link>
        </Card>

        <div className="space-y-4">
          {['Job timeline panel', 'Provider attempts panel', 'Artifact preview modal shell', 'Signed URL status', 'Webhook delivery status', 'Cost/duration fields', 'Proof status'].map((item) => (
            <Card key={item} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{item}</span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">backend_pending</Badge>
              </div>
            </Card>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button disabled variant="outline" className="border-white/10 text-xs"><Lock className="mr-1.5 h-3.5 w-3.5" /> Retry</Button>
            <Button disabled variant="outline" className="border-white/10 text-xs"><Eye className="mr-1.5 h-3.5 w-3.5" /> Preview</Button>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
