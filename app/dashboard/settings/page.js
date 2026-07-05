'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PROVIDER_CONTRACTS, OPEN_SOURCE_TOOLS } from '@/lib/dashboard-contract'
import { HardDrive, KeyRound, Lock, Save, Server, ShieldCheck, SlidersHorizontal, Webhook } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [draft, setDraft] = useState({
    local_storage_path: '/var/www/amarktai/storage',
    artifact_retention: '30',
    worker_concurrency: '5',
    retry_policy: '',
    timeout_policy: '',
    webhook_url: '',
    webhook_secret: '',
    cors: '*',
  })
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }))
  const save = () => toast.info('Local draft only', { description: 'Settings persistence requires backend connection.' })

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure provider keys, runtime policy, storage, workers, webhooks, and security.">
        <Button onClick={save} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"><Save className="mr-1.5 h-3.5 w-3.5" /> Save local draft</Button>
      </PageHeader>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList className="bg-white/[0.03]">
          <TabsTrigger value="providers" className="text-xs">Provider Keys</TabsTrigger>
          <TabsTrigger value="policy" className="text-xs">Runtime Policy</TabsTrigger>
          <TabsTrigger value="storage" className="text-xs">Storage</TabsTrigger>
          <TabsTrigger value="workers" className="text-xs">Workers</TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs">Webhooks</TabsTrigger>
          <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Provider Keys</h3>
            <div className="space-y-3">
              {PROVIDER_CONTRACTS.map((provider) => (
                <div key={provider.id} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <Field label={`${provider.name} (${provider.envKey})`}><Input type="password" placeholder="Not configured" className="bg-black/20 font-mono" /></Field>
                  <Button disabled variant="outline" className="self-end border-white/10 text-xs"><Lock className="mr-1 h-3 w-3" /> Test</Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="policy">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-violet-300" /> Runtime Policy</h3>
            <div className="space-y-4">
              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
                <div className="text-sm font-semibold mb-2">Provider routing</div>
                <p className="text-xs text-muted-foreground">The backend runtime selects providers and models by capability, quality, speed, cost, policy, and availability.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                  <span>Routing mode</span>
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">Runtime selected</Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                  <span>Policy control</span>
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">Backend controlled</Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs">
                  <span>DeepInfra</span>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">Gated only, excluded from normal flows</Badge>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="storage">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><HardDrive className="h-4 w-4 text-cyan-300" /> Storage</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Local storage path"><Input value={draft.local_storage_path} onChange={(event) => set('local_storage_path', event.target.value)} className="bg-black/20 font-mono" /></Field>
              <Field label="Artifact retention (days)"><Input value={draft.artifact_retention} onChange={(event) => set('artifact_retention', event.target.value)} className="bg-black/20" /></Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-emerald-300" /> Workers & Tools</h3>
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <Field label="Worker concurrency"><Input value={draft.worker_concurrency} onChange={(event) => set('worker_concurrency', event.target.value)} className="bg-black/20" /></Field>
              <Field label="Retry policy"><Input value={draft.retry_policy} onChange={(event) => set('retry_policy', event.target.value)} placeholder="Configure after backend" className="bg-black/20" /></Field>
              <Field label="Timeout policy"><Input value={draft.timeout_policy} onChange={(event) => set('timeout_policy', event.target.value)} placeholder="Configure after backend" className="bg-black/20" /></Field>
            </div>
            <h4 className="text-xs font-semibold mb-2">Open-Source Tools</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPEN_SOURCE_TOOLS.map((tool) => (
                <div key={tool.id} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                  <span>{tool.name}</span>
                  <Switch checked={false} />
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Webhook className="h-4 w-4 text-violet-300" /> Webhooks</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Webhook URL"><Input value={draft.webhook_url} onChange={(event) => set('webhook_url', event.target.value)} placeholder="https://your-app.com/webhook" className="bg-black/20" /></Field>
              <Field label="Signing secret"><Input type="password" value={draft.webhook_secret} onChange={(event) => set('webhook_secret', event.target.value)} placeholder="Set after backend" className="bg-black/20" /></Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Security</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CORS origins"><Input value={draft.cors} onChange={(event) => set('cors', event.target.value)} className="bg-black/20" /></Field>
              <Field label="RBAC"><Input value="Configure after backend" readOnly className="bg-black/20" /></Field>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
