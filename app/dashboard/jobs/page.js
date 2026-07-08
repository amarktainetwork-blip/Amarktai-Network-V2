'use client'

import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Activity, Boxes, Clock, Lock, RotateCcw, Settings, XCircle } from 'lucide-react'

const JOB_COLUMNS = ['Job', 'Capability', 'Queue', 'Runtime provider', 'Runtime model', 'Artifact', 'Safe error']
const TIMELINE = [
  { label: 'Queued', status: 'backend_exists', description: 'External app job route creates queued DB jobs and pushes BullMQ work.' },
  { label: 'Processing', status: 'backend_exists', description: 'Worker updates status and delegates to provider executor.' },
  { label: 'Completed', status: 'backend_exists', description: 'Proven chat/image/video paths store output and artifact metadata.' },
  { label: 'Failed', status: 'backend_exists', description: 'Worker records safe errors and BullMQ records failure.' },
  { label: 'Retry / cancel', status: 'dashboard_pending', description: 'Dashboard controls remain disabled until admin job action routes exist.' },
]

export default function JobsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Work Library" subtitle="Job status, runtime provider/model, queue state, and artifact linkage contracts for V2 jobs." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" /> Job list contract</h3>
            <p className="mt-1 text-xs text-muted-foreground">Admin job listing is not wired yet. External job polling remains available through /api/v1/jobs/:id.</p>
          </div>
          <Link href="/dashboard/studio">
            <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">Open Studio</Button>
          </Link>
        </div>

        <div className="overflow-hidden rounded-md border border-white/[0.06]">
          <div className="grid grid-cols-7 bg-white/[0.03] text-[10px] font-semibold uppercase text-muted-foreground">
            {JOB_COLUMNS.map((column) => <div key={column} className="px-3 py-2">{column}</div>)}
          </div>
          <div className="grid grid-cols-7 items-center border-t border-white/[0.06] text-xs text-muted-foreground">
            <div className="px-3 py-4">No admin listing endpoint</div>
            <div className="px-3 py-4">Proof-gated</div>
            <div className="px-3 py-4"><Badge variant="outline" className="border-cyan-500/30 text-[9px] text-cyan-300">BullMQ</Badge></div>
            <div className="px-3 py-4">Runtime selected</div>
            <div className="px-3 py-4">Runtime selected</div>
            <div className="px-3 py-4">Linked when artifactId exists</div>
            <div className="px-3 py-4">Redacted provider errors only</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-violet-300" /> Status timeline</h3>
          <div className="space-y-3">
            {TIMELINE.map((item) => (
              <div key={item.label} className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{item.label}</span>
                  <Badge variant="outline" className={item.status === 'backend_exists' ? 'border-emerald-500/30 text-[9px] text-emerald-300' : 'border-amber-500/30 text-[9px] text-amber-300'}>
                    {item.status}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4 text-cyan-300" /> Job actions</h3>
          <div className="space-y-3">
            <Button disabled variant="outline" className="w-full justify-start border-white/10 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              Retry job
            </Button>
            <Button disabled variant="outline" className="w-full justify-start border-white/10 text-xs">
              <XCircle className="h-3.5 w-3.5" />
              Cancel job
            </Button>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-100/80">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Actions stay disabled until V2 has admin job action routes with ownership, retry, and cancellation semantics.
            </div>
          </div>
        </Card>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Admin diagnostics</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Job route</div>
                <div>API job route exists (/api/v1/jobs). Studio UI job submission is still proof-gated.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Artifact route</div>
                <div>Artifact file route exists. Admin artifact listing/preview UI remains disabled until a list endpoint exists.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
