'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProviderSettingsPanel } from '@/components/dashboard/provider-settings-panel'
import { OPEN_SOURCE_TOOLS } from '@/lib/dashboard-contract'
import { HardDrive, Server, ShieldCheck, SlidersHorizontal, Webhook } from 'lucide-react'

export default function SettingsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure provider keys, runtime policy, storage, workers, webhooks, and security." />

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
          <ProviderSettingsPanel />
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
            <p className="text-xs text-muted-foreground">Storage configuration will be available after the backend settings route is wired.</p>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-emerald-300" /> Workers & Tools</h3>
            <p className="mb-4 text-xs text-muted-foreground">Worker and tool configuration will be available after the backend settings route is wired.</p>
            <h4 className="text-xs font-semibold mb-2">Open-Source Tools</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPEN_SOURCE_TOOLS.map((tool) => (
                <div key={tool.id} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                  <span>{tool.name}</span>
                  <Badge variant="outline" className="border-white/10 text-[9px]">Available</Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Webhook className="h-4 w-4 text-violet-300" /> Webhooks</h3>
            <p className="text-xs text-muted-foreground">Webhook configuration will be available after the backend settings route is wired.</p>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Security</h3>
            <p className="text-xs text-muted-foreground">Security settings will be available after the backend settings route is wired.</p>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
