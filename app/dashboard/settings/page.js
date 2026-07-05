'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { PROVIDER_CONTRACTS, OPEN_SOURCE_TOOLS } from '@/lib/dashboard-contract'
import { HardDrive, KeyRound, Lock, Save, Server, ShieldCheck, SlidersHorizontal, Webhook } from 'lucide-react'
import { toast } from 'sonner'

const MODEL_DEFAULTS = ['text', 'image', 'video', 'voice', 'music', 'avatar', 'gated/uncensored']
const FALLBACKS = ['Language: Groq -> Mimo', 'Image: Together', 'Video: GenX', 'Voice: Groq', 'Music: GenX', 'Gated: DeepInfra only']

export default function SettingsPage() {
  const [draft, setDraft] = useState({
    local_storage_path: '/var/www/amarktai/storage',
    artifact_retention: '30',
    worker_concurrency: '5',
    retry_policy: 'backend route pending',
    timeout_policy: 'backend route pending',
    webhook_url: '',
    webhook_secret: '',
    cors: '*',
  })
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }))
  const save = () => toast.info('Local draft only', { description: 'Settings persistence requires backend /api/v1 settings routes.' })

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Settings" subtitle="Frontend configuration draft for provider keys, tools, storage, worker, webhooks, and security.">
        <Button onClick={save} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"><Save className="mr-1.5 h-3.5 w-3.5" /> Save local draft</Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Provider Keys</h3>
          <div className="space-y-3">
            {PROVIDER_CONTRACTS.map((provider) => (
              <div key={provider.id} className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Field label={`${provider.name} (${provider.envKey})`}><Input type="password" placeholder="missing_key" className="bg-black/20 font-mono" /></Field>
                <Button disabled variant="outline" className="self-end border-white/10 text-xs"><Lock className="mr-1 h-3 w-3" /> Test pending</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-violet-300" /> Model Defaults</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODEL_DEFAULTS.map((capability) => (
              <Field key={capability} label={capability}><Select defaultValue="backend_pending"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="backend_pending">backend_pending</SelectItem></SelectContent></Select></Field>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Fallback Order</h3>
          <div className="space-y-2">
            {FALLBACKS.map((item) => <div key={item} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-muted-foreground">{item}</div>)}
          </div>
          <Badge variant="outline" className="mt-3 border-amber-500/30 text-amber-400 text-[10px]">DeepInfra excluded from normal safe flows</Badge>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-emerald-300" /> Open-Source Tools</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPEN_SOURCE_TOOLS.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                <span>{tool.name}</span>
                <Switch checked={false} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><HardDrive className="h-4 w-4 text-cyan-300" /> Storage & Worker</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Local storage path"><Input value={draft.local_storage_path} onChange={(event) => set('local_storage_path', event.target.value)} className="bg-black/20 font-mono" /></Field>
            <Field label="Artifact retention"><Input value={draft.artifact_retention} onChange={(event) => set('artifact_retention', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Worker concurrency"><Input value={draft.worker_concurrency} onChange={(event) => set('worker_concurrency', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Retry policy"><Input value={draft.retry_policy} onChange={(event) => set('retry_policy', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Timeout policy"><Input value={draft.timeout_policy} onChange={(event) => set('timeout_policy', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Signed URL settings"><Input value="backend_pending" readOnly className="bg-black/20" /></Field>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Webhook className="h-4 w-4 text-violet-300" /> Webhooks & Security</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Webhook URL"><Input value={draft.webhook_url} onChange={(event) => set('webhook_url', event.target.value)} className="bg-black/20" /></Field>
            <Field label="Signing secret"><Input type="password" value={draft.webhook_secret} onChange={(event) => set('webhook_secret', event.target.value)} className="bg-black/20" /></Field>
            <Field label="CORS"><Input value={draft.cors} onChange={(event) => set('cors', event.target.value)} className="bg-black/20" /></Field>
            <Field label="RBAC"><Input value="backend_pending" readOnly className="bg-black/20" /></Field>
          </div>
          <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs text-muted-foreground">
            Environment checklist: provider keys missing, backend routes pending, provider proof pending.
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
