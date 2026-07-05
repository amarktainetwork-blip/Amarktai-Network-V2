'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Bot, ChevronRight, KeyRound, Lock, Plug, Plus, Settings, ShieldCheck } from 'lucide-react'

const GROUPS = ['Language', 'Image', 'Video', 'Audio/Music', 'Voice', 'Avatar', 'Scrape/Brand', 'RAG/Knowledge', 'Gated/Uncensored']

const APP_TEMPLATES = [
  { name: 'Marketing App', desc: 'Campaign content, social reels, brand management', status: 'Ready to configure' },
  { name: 'Horse Management App', desc: 'Operations, scheduling, asset tracking', status: 'Ready to configure' },
  { name: 'Crypto App', desc: 'Research, analysis, content generation', status: 'Ready to configure' },
  { name: 'Adult Creator App', desc: 'Content creation, gated lane access', status: 'Requires backend connection' },
  { name: 'CRM App', desc: 'Customer communications, automation', status: 'Ready to configure' },
  { name: 'Customer Service App', desc: 'Chat, knowledge base, agent support', status: 'Ready to configure' },
  { name: 'Music App', desc: 'Song generation, voice, audio production', status: 'Ready to configure' },
  { name: 'Education App', desc: 'Content, research, tutoring agents', status: 'Ready to configure' },
  { name: 'Legal App', desc: 'Document analysis, research, compliance', status: 'Ready to configure' },
]

export default function AppGatewayPage() {
  const [step, setStep] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({
    appName: '',
    appSlug: '',
    environment: 'dev',
    webhookUrl: '',
    agentName: '',
    directives: '',
    allowedGroups: ['Language'],
    brandNotes: '',
    budget: '',
    rateLimit: '',
  })

  const set = (key, value) => setDraft((previous) => ({
    ...previous,
    [key]: value,
    ...(key === 'appName' && !previous.appSlug ? { appSlug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } : {}),
  }))

  const toggleGroup = (group) => {
    set('allowedGroups', draft.allowedGroups.includes(group) ? draft.allowedGroups.filter((item) => item !== group) : [...draft.allowedGroups, group])
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Apps" subtitle="Create and manage connected applications with agents, brand packs, and capability permissions.">
        <Button onClick={() => setShowCreate(!showCreate)} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
          <Plus className="mr-1 h-3 w-3" /> Create App
        </Button>
      </PageHeader>

      {/* App Templates */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">App Templates</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {APP_TEMPLATES.map((app) => (
            <Card key={app.name} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10"><Plug className="h-4 w-4 text-cyan-300" /></div>
                <div>
                  <div className="text-sm font-semibold">{app.name}</div>
                  <Badge variant="outline" className="border-white/10 text-[9px]">{app.status}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{app.desc}</p>
              <Button disabled variant="outline" size="sm" className="mt-3 w-full border-white/10 text-[10px]">
                <Lock className="mr-1 h-3 w-3" /> Connect after backend
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Create App Wizard (shown on demand) */}
      {showCreate && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-5 flex flex-wrap gap-2">
            {['App Identity', 'Agent Provisioning', 'Brand Vault', 'Capabilities'].map((label, index) => (
              <button key={label} onClick={() => setStep(index + 1)} className={`rounded-full border px-3 py-1.5 text-[10px] ${step === index + 1 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-muted-foreground'}`}>
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step === 1 && <div className="grid gap-4 md:grid-cols-2">
            <Field label="App name"><Input value={draft.appName} onChange={(event) => set('appName', event.target.value)} className="bg-black/20" /></Field>
            <Field label="App slug"><Input value={draft.appSlug} onChange={(event) => set('appSlug', event.target.value)} className="bg-black/20 font-mono" /></Field>
            <Field label="Environment"><Select value={draft.environment} onValueChange={(value) => set('environment', value)}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dev">dev</SelectItem><SelectItem value="staging">staging</SelectItem><SelectItem value="prod">prod</SelectItem></SelectContent></Select></Field>
            <Field label="Webhook URL (optional)"><Input value={draft.webhookUrl} onChange={(event) => set('webhookUrl', event.target.value)} placeholder="https://app.example.com/webhook" className="bg-black/20" /></Field>
          </div>}

          {step === 2 && <div className="space-y-4">
            <Field label="Agent name"><Input value={draft.agentName} onChange={(event) => set('agentName', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Core directives"><Textarea value={draft.directives} onChange={(event) => set('directives', event.target.value)} className="min-h-[120px] bg-black/20" /></Field>
            <div className="grid gap-2 sm:grid-cols-3">
              {GROUPS.map((group) => <label key={group} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs"><Checkbox checked={draft.allowedGroups.includes(group)} onCheckedChange={() => toggleGroup(group)} /> {group}</label>)}
            </div>
          </div>}

          {step === 3 && <div className="space-y-4">
            <Field label="Brand notes"><Textarea value={draft.brandNotes} onChange={(event) => set('brandNotes', event.target.value)} className="min-h-[100px] bg-black/20" /></Field>
          </div>}

          {step === 4 && <div className="grid gap-4 md:grid-cols-2">
            <Field label="Budget"><Input value={draft.budget} onChange={(event) => set('budget', event.target.value)} placeholder="Set after backend" className="bg-black/20" /></Field>
            <Field label="Rate limits"><Input value={draft.rateLimit} onChange={(event) => set('rateLimit', event.target.value)} placeholder="Set after backend" className="bg-black/20" /></Field>
          </div>}

          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <Button variant="outline" className="border-white/10 text-xs" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button>
            <div className="flex gap-2">
              <Button variant="outline" className="border-white/10 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs" onClick={() => setStep(Math.min(4, step + 1))}>
                {step < 4 ? <><ChevronRight className="mr-1 h-3 w-3" /> Next</> : 'Create App'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Developer details - collapsed */}
      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Developer details</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">App contract fields</div>
                <div className="font-mono text-[10px]">appName, appSlug, environment, webhookUrl, agentName, directives, allowedGroups, brandNotes, budget, rateLimit</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">API key status</div>
                <div>Scoped keys will be created by backend after connection.</div>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Webhook secret</div>
                <div>HMAC signing will be configured after backend connection.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
