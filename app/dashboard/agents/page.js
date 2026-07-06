'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Bot, Lock, Settings } from 'lucide-react'

export default function AgentsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Agents & Learning" subtitle="Create and manage AI agents with tools, memory, and controlled learning." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
        <Bot className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No agents created yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Agents will appear here after the Agents backend is connected.
        </p>
        <Button disabled variant="outline" className="mt-6 border-white/10 text-xs">
          <Lock className="mr-1.5 h-3 w-3" /> Create agent — backend required
        </Button>
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="builder" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Agent builder preview</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Directives</div>
                <div>Agent name, core directives, system rules.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Capabilities</div>
                <div>Language, Image, Video, Voice, RAG, Scrape, Code.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Memory & Brand</div>
                <div>Knowledge upload, brand vault, cross-app access.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Automations</div>
                <div>Schedules, approvals, webhook delivery.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
