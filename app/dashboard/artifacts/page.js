'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Download, FileArchive, Lock, Settings } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const STATUS_COLORS = {
  completed: 'border-emerald-500/30 text-emerald-300',
  processing: 'border-cyan-500/30 text-cyan-300',
  failed: 'border-rose-500/30 text-rose-300',
}

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/artifacts?limit=50')
      .then((r) => r.json())
      .then((data) => setArtifacts(data?.artifacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Artifacts" subtitle="Generated media metadata, preview, and download controls." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><FileArchive className="h-4 w-4 text-cyan-300" /> Artifacts</h3>
            <p className="mt-1 text-xs text-muted-foreground">{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} total</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading artifacts...</div>
        ) : artifacts.length === 0 ? (
          <div className="py-8 text-center">
            <FileArchive className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No artifacts yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Generate content in Studio to see artifacts here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Artifact</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">MIME</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Download</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.04]">
                    <td className="px-3 py-2 font-mono text-[10px]">{a.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{a.type}</td>
                    <td className="px-3 py-2">{a.provider || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_COLORS[a.status] ?? 'border-white/10 text-[9px]'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{a.mimeType || '—'}</td>
                    <td className="px-3 py-2">{a.fileSizeBytes ? `${(a.fileSizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2">
                      {a.downloadable ? (
                        <a href={`/api/v1/artifacts/${a.id}/file`} target="_blank" rel="noopener">
                          <Button variant="outline" size="sm" className="border-white/10 text-xs">
                            <Download className="h-3 w-3" />
                          </Button>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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
                <div className="font-semibold mb-1">Artifact API</div>
                <div>Admin artifact listing at /api/admin/artifacts. Download at /api/v1/artifacts/:id/file.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
