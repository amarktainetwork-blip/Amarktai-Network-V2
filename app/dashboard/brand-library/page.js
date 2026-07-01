'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Palette, Globe, Type, Image, Plus } from 'lucide-react'
import Link from 'next/link'

export default function BrandLibraryPage() {
  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Brand Library" subtitle="Central repository for scraped BrandPacks — logos, colors, typography, and company intelligence.">
        <Link href="/dashboard/studio">
          <Button variant="outline" className="border-white/15 bg-white/[0.02]">
            <Plus className="mr-1.5 h-4 w-4" /> New Scrape
          </Button>
        </Link>
      </PageHeader>

      <Card className="border-white/[0.07] bg-white/[0.02] p-12 text-center">
        <Palette className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No BrandPacks Yet</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Use the Scrape/Brand capability in the Studio to extract brand intelligence from corporate websites. BrandPacks will appear here automatically.
        </p>
        <div className="mt-8 grid max-w-lg mx-auto gap-4 sm:grid-cols-3">
          {[
            { icon: Image, label: 'Logo & Visual', desc: 'Colors, imagery, visual identity' },
            { icon: Type, label: 'Typography', desc: 'Font families, sizes, weights' },
            { icon: Globe, label: 'Content', desc: 'Taglines, copy, messaging' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4 text-center">
              <item.icon className="mx-auto mb-2 h-5 w-5 text-cyan-300" />
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
        <Link href="/dashboard/studio">
          <Button className="mt-8 bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
            <Plus className="mr-1.5 h-4 w-4" /> Start Scraping
          </Button>
        </Link>
      </Card>
    </PageTransition>
  )
}
