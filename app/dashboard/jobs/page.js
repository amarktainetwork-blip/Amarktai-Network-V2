'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { EmptyState, SkeletonList } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Boxes, FileText, Image, Film, Music, Mic, Download, Trash2, RefreshCw, Eye, Sparkles, Filter } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const TYPE_ICONS = { image: Image, video: Film, audio: Mic, document: FileText }

export default function JobsPage() {
  const jobs = useStudioStore((s) => s.jobs) || []
  const artifacts = useStudioStore((s) => s.artifacts) || []
  const fetchJobs = useStudioStore((s) => s.fetchJobs)
  const fetchArtifacts = useStudioStore((s) => s.fetchArtifacts)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [capabilityFilter, setCapabilityFilter] = useState('all')
  const [tab, setTab] = useState('jobs')

  useEffect(() => { Promise.all([fetchJobs(), fetchArtifacts()]).then(() => setLoading(false)) }, [])

  const filteredJobs = jobs
    .filter((j) => statusFilter === 'all' || j.status === statusFilter)
    .filter((j) => capabilityFilter === 'all' || j.capability === capabilityFilter)

  const filteredArtifacts = artifacts
    .filter((a) => capabilityFilter === 'all' || a.capability === capabilityFilter)

  const capabilities = [...new Set(jobs.map((j) => j.capability))]

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Jobs & Artifacts" subtitle="Track all generation jobs and manage artifacts." /><SkeletonList count={5} /></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Jobs & Artifacts" subtitle="Track all generation jobs and manage artifacts.">
        <div className="flex gap-2">
          <Button variant={tab === 'jobs' ? 'default' : 'outline'} size="sm" onClick={() => setTab('jobs')} className={tab === 'jobs' ? '' : 'border-white/10'}>Jobs</Button>
          <Button variant={tab === 'artifacts' ? 'default' : 'outline'} size="sm" onClick={() => setTab('artifacts')} className={tab === 'artifacts' ? '' : 'border-white/10'}>Artifacts</Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 bg-black/20 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="queued">Queued</SelectItem><SelectItem value="processing">Processing</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent>
        </Select>
        <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
          <SelectTrigger className="w-40 bg-black/20 text-xs"><SelectValue placeholder="Capability" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Capabilities</SelectItem>{capabilities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Jobs Tab */}
      {tab === 'jobs' && (
        <>
          {filteredJobs.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No Jobs Yet"
              description="Run a capability from the Studio to generate your first job."
              action={<Link href="/dashboard/studio"><Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Sparkles className="mr-1.5 h-4 w-4" /> Open Studio</Button></Link>}
            />
          ) : (
            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Job ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Capability</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 font-mono text-xs">{job.id.slice(-12)}</td>
                      <td className="px-4 py-3">{job.capability}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${job.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' : job.status === 'failed' ? 'border-rose-500/30 text-rose-400' : job.status === 'processing' ? 'border-cyan-500/30 text-cyan-400' : 'border-slate-500/30 text-slate-400'}`}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-mono">{job.duration ? `${(job.duration / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="h-3.5 w-3.5" /></Button>
                          {job.status === 'failed' && <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><RefreshCw className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Artifacts Tab */}
      {tab === 'artifacts' && (
        <>
          {filteredArtifacts.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No Artifacts Yet"
              description="Run a capability from the Studio to generate your first artifact."
              action={<Link href="/dashboard/studio"><Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Sparkles className="mr-1.5 h-4 w-4" /> Open Studio</Button></Link>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredArtifacts.map((a) => {
                const Icon = TYPE_ICONS[a.type] || FileText
                return (
                  <Card key={a.id} className="border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/10 to-violet-500/10 shrink-0">
                        <Icon className="h-5 w-5 text-cyan-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.type} · {a.capability} · {a.size}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] border-white/10"><Download className="mr-1 h-3 w-3" /> Download</Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-white/10 text-rose-400 hover:text-rose-300"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </PageTransition>
  )
}
