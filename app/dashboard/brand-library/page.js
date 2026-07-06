'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Lock, Palette, Settings } from 'lucide-react'

export default function BrandLibraryPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Brand Library" subtitle="Manage BrandPacks with logos, colors, fonts, and brand guidelines." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
        <Palette className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No BrandPacks yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          BrandPacks will appear after website scrape and upload storage are connected.
        </p>
        <Button disabled variant="outline" className="mt-6 border-white/10 text-xs">
          <Lock className="mr-1.5 h-3 w-3" /> Create BrandPack — backend required
        </Button>
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Developer details</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">BrandPack fields</div>
                <div>Logo, color palette, fonts, website snapshot, extracted copy/tone, products, pricing, testimonials.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Storage</div>
                <div>BrandPack artifacts will be stored after backend storage routes are wired.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
