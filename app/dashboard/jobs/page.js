'use client'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Boxes, Settings } from 'lucide-react'

export default function JobsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Work Library" subtitle="Creations, drafts, and generated assets will appear here after Studio execution is connected." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
        <Boxes className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No creations yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Create something in Studio once backend execution is connected.
        </p>
        <Link href="/dashboard/studio">
          <Button className="mt-6 bg-gradient-to-r from-cyan-400 to-violet-500 text-black">Open Studio</Button>
        </Link>
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Admin diagnostics</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Job records</div>
                <div>Job rows, timeline, provider attempts, and retry logic will appear after backend /api/v1/jobs is wired.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Artifact storage</div>
                <div>Artifact previews, signed URLs, and webhook delivery status will appear after backend storage routes are wired.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
