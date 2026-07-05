'use client'
import { useMemo, useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { DropZone } from '@/components/amarkt/StudioComponents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Bot, ChevronRight, KeyRound, Lock, Plug, ShieldCheck, Upload } from 'lucide-react'

const GROUPS = ['Language', 'Image', 'Video', 'Audio/Music', 'Voice', 'Avatar', 'Scrape/Brand', 'RAG/Knowledge', 'Gated/Uncensored']

export default function AppGatewayPage() {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState({
    appName: '',
    appSlug: '',
    environment: 'dev',
    webhookUrl: '',
    agentName: '',
    directives: '',
    allowedGroups: ['Language'],
    brandNotes: '',
    budget: 'draft',
    rateLimit: 'draft',
  })

  const set = (key, value) => setDraft((previous) => ({
    ...previous,
    [key]: value,
    ...(key === 'appName' && !previous.appSlug ? { appSlug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } : {}),
  }))

  const payload = useMemo(() => ({ ...draft, apiKeyStatus: 'backend_pending', webhookSecretStatus: 'backend_pending' }), [draft])

  const toggleGroup = (group) => {
    set('allowedGroups', draft.allowedGroups.includes(group) ? draft.allowedGroups.filter((item) => item !== group) : [...draft.allowedGroups, group])
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="App Gateway" subtitle="Create workspace contracts for connected apps. API keys, HMAC secrets, and request execution remain backend pending." />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-5 flex flex-wrap gap-2">
            {['App Identity', 'Agent Provisioning', 'Brand Vault', 'API & Controls'].map((label, index) => (
              <button key={label} onClick={() => setStep(index + 1)} className={`rounded-full border px-3 py-1.5 text-[10px] ${step === index + 1 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-muted-foreground'}`}>
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step === 1 && <div className="grid gap-4 md:grid-cols-2">
            <Field label="App name"><Input value={draft.appName} onChange={(event) => set('appName', event.target.value)} className="bg-black/20" /></Field>
            <Field label="App slug"><Input value={draft.appSlug} onChange={(event) => set('appSlug', event.target.value)} className="bg-black/20 font-mono" /></Field>
            <Field label="Environment"><Select value={draft.environment} onValueChange={(value) => set('environment', value)}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dev">dev</SelectItem><SelectItem value="staging">staging</SelectItem><SelectItem value="prod">prod</SelectItem></SelectContent></Select></Field>
            <Field label="Webhook URL"><Input value={draft.webhookUrl} onChange={(event) => set('webhookUrl', event.target.value)} placeholder="https://app.example.com/webhook" className="bg-black/20" /></Field>
          </div>}

          {step === 2 && <div className="space-y-4">
            <Field label="Agent name"><Input value={draft.agentName} onChange={(event) => set('agentName', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Core directives"><Textarea value={draft.directives} onChange={(event) => set('directives', event.target.value)} className="min-h-[120px] bg-black/20" /></Field>
            <div className="grid gap-2 sm:grid-cols-3">
              {GROUPS.map((group) => <label key={group} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs"><Checkbox checked={draft.allowedGroups.includes(group)} onCheckedChange={() => toggleGroup(group)} /> {group}</label>)}
            </div>
          </div>}

          {step === 3 && <div className="grid gap-4 md:grid-cols-3">
            <DropZone label="Logo upload UI" kind="logo" compact />
            <DropZone label="Font upload UI" kind="font" compact />
            <DropZone label="Guideline upload UI" kind="brand guide" compact />
            <div className="md:col-span-3"><Field label="Brand notes"><Textarea value={draft.brandNotes} onChange={(event) => set('brandNotes', event.target.value)} className="min-h-[100px] bg-black/20" /></Field></div>
          </div>}

          {step === 4 && <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4"><KeyRound className="mb-2 h-4 w-4 text-amber-300" /><div className="text-sm font-semibold">API key section</div><p className="mt-1 text-xs text-muted-foreground">Disabled until backend creates scoped keys.</p></div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4"><ShieldCheck className="mb-2 h-4 w-4 text-amber-300" /><div className="text-sm font-semibold">HMAC webhook secret</div><p className="mt-1 text-xs text-muted-foreground">Disabled until backend persistence exists.</p></div>
            <Field label="Budgets"><Input value={draft.budget} onChange={(event) => set('budget', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Rate limits"><Input value={draft.rateLimit} onChange={(event) => set('rateLimit', event.target.value)} className="bg-black/20" /></Field>
          </div>}

          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <Button variant="outline" className="border-white/10 text-xs" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button>
            <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs" onClick={() => setStep(Math.min(4, step + 1))}>Next <ChevronRight className="ml-1 h-3 w-3" /></Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plug className="h-4 w-4 text-cyan-300" /> App Contract Drawer</h3>
            <pre className="max-h-72 overflow-auto rounded-md bg-black/30 p-3 text-[10px] text-muted-foreground">{JSON.stringify(payload, null, 2)}</pre>
          </Card>
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-violet-300" /> Workspace State</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>App list/grid: empty until backend integration.</div>
              <div>Capability permissions UI: draft controls ready.</div>
              <div>Webhook delivery: backend_pending.</div>
              <div>Request runner: disabled until backend.</div>
            </div>
            <Button disabled variant="outline" className="mt-4 w-full border-white/10 text-xs"><Lock className="mr-1.5 h-3.5 w-3.5" /> Backend integration pending</Button>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
