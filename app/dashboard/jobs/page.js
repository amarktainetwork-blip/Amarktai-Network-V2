'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Activity, Boxes, Clock, ExternalLink, Lock, RotateCcw, Settings, XCircle } from 'lucide-react'

const STATUS_COLORS = {
  queued: 'border-amber-500/30 text-amber-300',
  processing: 'border-cyan-500/30 text-cyan-300',
  completed: 'border-emerald-500/30 text-emerald-300',
  failed: 'border-rose-500/30 text-rose-300',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    fetch('/api/admin/jobs?limit=50', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setJobs(data?.jobs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Work Library" subtitle="Real backend jobs, runtime provider/model, and artifact linkage." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" /> Jobs</h3>
            <p className="mt-1 text-xs text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? 's' : ''} total</p>
          </div>
          <Link href="/dashboard/studio">
            <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">Open Studio</Button>
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="py-8 text-center">
            <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No jobs yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Submit a capability from Studio to see jobs here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Artifact</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-white/[0.04]">
                    <td className="px-3 py-2 font-mono text-[10px]">{job.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{job.capability}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_COLORS[job.status] ?? 'border-white/10 text-[9px]'}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{job.provider || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{job.model || '—'}</td>
                    <td className="px-3 py-2">
                      {job.artifactId ? (
                        <Link href={`/dashboard/artifacts`} className="text-cyan-300 hover:underline">
                          {job.artifactId.slice(0, 8)}...
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-rose-300 max-w-[200px] truncate">{job.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Admin diagnostics</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Job API</div>
                <div>Admin job listing at /api/admin/jobs with status/capability/provider filters.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Artifact API</div>
                <div>Artifact file route exists at /api/v1/artifacts/:id/file.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
