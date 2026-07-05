'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { DropZone } from '@/components/amarkt/StudioComponents'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Bot, Clock, Database, Lock, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react'

const TABS = ['directives', 'capabilities/tools', 'memory', 'brand vault', 'automations', 'activity/cost', 'controlled learning']

export default function AgentsPage() {
  const [tab, setTab] = useState('directives')
  const [crossApp, setCrossApp] = useState(false)

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Agents & Learning" subtitle="Agent profile contracts, controlled learning controls, and backend-pending execution state." />

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500/10"><Bot className="h-5 w-5 text-cyan-300" /></div>
            <div>
              <h3 className="font-semibold">Agent grid shell</h3>
              <p className="text-xs text-muted-foreground">No agent runs or learning logs are created locally.</p>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center">
            <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <div className="text-sm font-semibold">No backend agents loaded</div>
            <p className="mt-1 text-xs text-muted-foreground">Agents will appear after /api/v1/apps and /api/v1/agents are wired.</p>
          </div>
          <Button disabled variant="outline" className="mt-4 w-full border-white/10 text-xs"><Lock className="mr-1.5 h-3.5 w-3.5" /> Execution backend pending</Button>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full border px-3 py-1.5 text-[10px] ${tab === item ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-muted-foreground'}`}>{item}</button>)}
          </div>

          {tab === 'directives' && <div className="space-y-4"><Field label="Agent name"><Input className="bg-black/20" placeholder="Draft agent name" /></Field><Field label="Core directives"><Textarea className="min-h-[160px] bg-black/20" placeholder="Draft system rules and rollback notes." /></Field></div>}
          {tab === 'capabilities/tools' && <div className="grid gap-2 sm:grid-cols-2">{['Language', 'Image', 'Video', 'Voice', 'RAG/Knowledge', 'Scrape/Brand'].map((item) => <div key={item} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">{item}<Badge variant="outline" className="ml-2 border-cyan-500/30 text-cyan-300 text-[9px]">contract_ready</Badge></div>)}</div>}
          {tab === 'memory' && <div className="space-y-3"><DropZone label="Knowledge upload UI" kind="documents" compact /><p className="text-xs text-muted-foreground">Memory ingestion is backend_pending until vector routes are wired.</p></div>}
          {tab === 'brand vault' && <div className="space-y-3"><DropZone label="Brand asset upload UI" kind="brand assets" compact /><div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs"><span>Cross-app access</span><Switch checked={crossApp} onCheckedChange={setCrossApp} /></div></div>}
          {tab === 'automations' && <PendingPanel icon={Clock} title="Automations" text="Schedules, approvals, and webhook delivery remain backend_pending." />}
          {tab === 'activity/cost' && <PendingPanel icon={Database} title="Activity and cost" text="Real activity and cost rows will appear after job/proof routes are wired." />}
          {tab === 'controlled learning' && <PendingPanel icon={ShieldCheck} title="Controlled learning" text="Rollback, version notes, and approvals are draft-only until backend persistence exists." />}

          <div className="mt-5 flex justify-end border-t border-white/[0.06] pt-4">
            <Button disabled className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"><Lock className="mr-1 h-3 w-3" /> Save requires backend</Button>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}

function PendingPanel({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-amber-300" /> {title}</div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  )
}
