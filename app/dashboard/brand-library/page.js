'use client'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { DropZone } from '@/components/amarkt/StudioComponents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Globe, Image, Lock, Palette, Plus, Type } from 'lucide-react'

const SECTIONS = [
  ['Logo section', Image],
  ['Color palette section', Palette],
  ['Fonts section', Type],
  ['Website snapshot section', Globe],
  ['Extracted copy/tone section', FileText],
  ['Products/pricing/testimonials section', FileText],
]

export default function BrandLibraryPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Brand Library" subtitle="BrandPack frontend structure. Scraping, rescraping, and assignment persistence remain backend pending.">
        <Link href="/dashboard/studio"><Button variant="outline" className="border-white/10 text-xs"><Plus className="mr-1.5 h-3.5 w-3.5" /> Open Studio</Button></Link>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-6 text-center">
          <Palette className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold">No BrandPacks loaded</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Real scraped brand data will appear after the scrape route, artifact storage, and BrandPack persistence are wired.</p>
          <div className="mt-5"><DropZone label="Import/upload brand assets UI" kind="brand assets" compact /></div>
          <Button disabled variant="outline" className="mt-5 border-white/10 text-xs"><Lock className="mr-1.5 h-3.5 w-3.5" /> Rescrape backend pending</Button>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Brand Details Panel</h3>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">ui_ready</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map(([label, Icon]) => (
              <div key={label} className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
                <Icon className="mb-2 h-4 w-4 text-cyan-300" />
                <div className="text-xs font-semibold">{label}</div>
                <p className="mt-1 text-[10px] text-muted-foreground">Awaiting real BrandPack artifact data.</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button disabled variant="outline" className="border-white/10 text-xs">Assign to app/agent</Button>
            <Button disabled variant="outline" className="border-white/10 text-xs">Use in Studio</Button>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
