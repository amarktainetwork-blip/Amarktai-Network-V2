'use client'

import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DESIGN_QUALITY_GATES } from '@/lib/design-quality-contract'
import { REPO_WORKBENCH_ACTIONS } from '@/lib/repo-workbench-contract'
import { GitPullRequest, Lock, ShieldCheck } from 'lucide-react'

export default function RepoWorkbenchPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Repo Workbench" subtitle="Donor workbench concepts ported as disabled V2 contracts until safe backend execution is wired." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><GitPullRequest className="h-4 w-4 text-cyan-300" /> Controlled repo workflow</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {REPO_WORKBENCH_ACTIONS.map((action) => (
            <div key={action.id} className="rounded-md border border-white/[0.06] bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{action.label}</span>
                <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">Not ready</Badge>
              </div>
              <p className="min-h-12 text-[11px] text-muted-foreground">{action.blocker}</p>
              <Button disabled variant="outline" size="sm" className="mt-3 border-white/10 text-xs">
                <Lock className="h-3.5 w-3.5" />
                Action disabled
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-violet-300" /> Design and QA gate concepts</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {DESIGN_QUALITY_GATES.map((gate) => (
            <div key={gate.id} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{gate.label}</span>
                <Badge variant="outline" className="border-white/10 text-[9px]">{gate.status}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{gate.blocker}</p>
            </div>
          ))}
        </div>
      </Card>
    </PageTransition>
  )
}
