'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Card } from '@/components/ui/card'
import { ShieldCheck, Terminal } from 'lucide-react'

export default function ProofRunnerPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Proof Runner" subtitle="Canonical proof status and the operator commands that produce fixture or deployed evidence." />
      <RuntimeProofSummary />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-cyan-300" />Local release fixture</h3>
          <code className="mt-3 block rounded bg-black/30 p-3 text-xs">npm run proof:release-candidate</code>
          <p className="mt-3 text-xs text-muted-foreground">Starts disposable services, uses test-only provider adapters, exercises FFmpeg and artifacts, runs browser E2E, and never records live provider proof.</p>
        </Card>
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" />Deployed live proof</h3>
          <code className="mt-3 block overflow-x-auto rounded bg-black/30 p-3 text-xs">npm run proof:production-release-candidate -- --base-url https://&lt;host&gt; --strict</code>
          <p className="mt-3 text-xs text-muted-foreground">Runs only after separately authorised deployment with real credentials. Fixture results and static checks do not satisfy this boundary.</p>
        </Card>
      </div>
    </PageTransition>
  )
}
