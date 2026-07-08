'use client'

import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MEDIA_TRUTH_CONTRACTS } from '@/lib/media-truth-contract'
import { Download, FileArchive, Lock } from 'lucide-react'

const ARTIFACT_COLUMNS = ['Artifact', 'Job', 'Capability', 'Provider', 'Model', 'Status', 'Download']

export default function ArtifactsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Artifacts" subtitle="Generated media metadata, preview, and download controls will use authenticated V2 artifact routes." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><FileArchive className="h-4 w-4 text-cyan-300" /> Artifact library contract</h3>
        <div className="overflow-hidden rounded-md border border-white/[0.06]">
          <div className="grid grid-cols-7 bg-white/[0.03] text-[10px] font-semibold uppercase text-muted-foreground">
            {ARTIFACT_COLUMNS.map((column) => <div key={column} className="px-3 py-2">{column}</div>)}
          </div>
          <div className="grid grid-cols-7 items-center border-t border-white/[0.06] text-xs text-muted-foreground">
            <div className="px-3 py-4">No artifact listing endpoint</div>
            <div className="px-3 py-4">Pending</div>
            <div className="px-3 py-4">Backend controlled</div>
            <div className="px-3 py-4">Runtime selected</div>
            <div className="px-3 py-4">Runtime selected</div>
            <div className="px-3 py-4"><Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">Listing pending</Badge></div>
            <div className="px-3 py-4">
              <Button disabled variant="outline" size="sm" className="border-white/10 text-xs">
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Direct file serving already exists at /api/v1/artifacts/:id/file with app API-key ownership checks. This dashboard listing remains disabled until an admin artifact-list API exists.
        </p>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4 text-amber-300" /> Media proof truth</h3>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {MEDIA_TRUTH_CONTRACTS.map((item) => (
            <div key={item.capability} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{item.capability}</span>
                <Badge variant="outline" className="border-white/10 text-[9px]">{item.mediaType}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{item.proofRequired}</p>
              <p className="mt-1 text-[10px] text-amber-200/80">Fallback media cannot count as provider proof.</p>
            </div>
          ))}
        </div>
      </Card>
    </PageTransition>
  )
}
