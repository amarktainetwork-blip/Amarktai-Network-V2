'use client'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'
import { Cpu, Lock, Settings } from 'lucide-react'

export default function ProvidersPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Providers" subtitle="Runtime selects providers after backend routing is wired.">
        <Link href="/dashboard/settings"><Button variant="outline" className="border-white/10 text-xs"><Settings className="mr-1.5 h-3.5 w-3.5" /> Settings</Button></Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {PROVIDER_CONTRACTS.map((provider) => (
          <Card key={provider.id} className="border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"><Cpu className="h-5 w-5 text-cyan-300" /></div>
              <div>
                <h3 className="font-semibold">{provider.name}</h3>
                <p className="text-xs text-muted-foreground">{provider.role}</p>
              </div>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{provider.description}</p>
            <Badge variant="outline" className={provider.gated ? 'border-amber-500/30 text-amber-400 text-[10px]' : 'border-white/10 text-[10px]'}>
              {provider.gated ? 'Gated only' : 'Not connected'}
            </Badge>
          </Card>
        ))}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Developer details</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-xs text-muted-foreground">
              {PROVIDER_CONTRACTS.map((provider) => (
                <div key={provider.id} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="font-semibold">{provider.name}</div>
                  <div className="font-mono text-[10px]">env: {provider.envKey}</div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
