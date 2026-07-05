'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Boxes, Film, FileText, Image as ImageIcon, Mic, Music, Search, Settings, User, Video } from 'lucide-react'

const TABS = [
  { key: 'all', label: 'All', icon: Boxes },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'videos', label: 'Videos', icon: Video },
  { key: 'music', label: 'Music', icon: Music },
  { key: 'voice', label: 'Voice', icon: Mic },
  { key: 'avatars', label: 'Avatars', icon: User },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'drafts', label: 'Drafts', icon: FileText },
]

export default function JobsPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Work Library" subtitle="Creations, drafts, and generated assets will appear here after Studio execution is connected." />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] ${tab === t.key ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-muted-foreground'}`}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <Card className="border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creations..."
            className="h-9 flex-1 bg-black/20 text-xs"
          />
        </div>
      </Card>

      {/* Empty state */}
      <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
        <Boxes className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No creations yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Create something in Studio and your work will appear here.
        </p>
        <Link href="/dashboard/studio">
          <Button className="mt-6 bg-gradient-to-r from-cyan-400 to-violet-500 text-black">Open Studio</Button>
        </Link>
      </Card>

      {/* Developer details - collapsed */}
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
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Proof and cost</div>
                <div>Cost/duration tracking and proof capture will appear after backend execution routes are wired.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
