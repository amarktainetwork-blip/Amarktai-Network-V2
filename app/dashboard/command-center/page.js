'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RuntimeProofSummary, getAdminToken } from '@/components/dashboard/runtime-proof-summary'
import { PROVIDER_CONTRACTS, OPEN_SOURCE_TOOLS } from '@/lib/dashboard-contract'
import {
  normalizeProviderStatuses,
  getHealthStatusLabel,
  getHealthStatusClasses,
} from '@/lib/provider-settings-contract'
import { Activity, AlertTriangle, ArrowRight, Boxes, Cpu, Database, FileClock, Server, ShieldCheck, Sparkles, Zap } from 'lucide-react'

const STATUS_GRID = [
  ['Dashboard UI status', 'ui_ready', Zap],
  ['API contract status', 'contract_ready', ShieldCheck],
  ['Runtime proof source', 'backend-runtime-proof-status', AlertTriangle],
  ['Studio connection', 'wired', Server],
]

const INFRA = ['MariaDB', 'Redis', 'Qdrant', 'Worker/BullMQ', 'Storage', 'Fastify API']

const PENDING = [
  ['Studio job submission', 'Wired through admin route. Studio can submit proven capabilities.'],
  ['Artifact listing UI', 'Wired. Artifacts page shows real backend artifacts with preview/download.'],
  ['Unproven capabilities', 'Only backend-proven runtime capabilities are dashboard-ready.'],
  ['Model catalog sync', 'Model discovery works for all providers. Catalog refresh available.'],
]

export default function CommandCenterPage() {
  const [providers, setProviders] = useState([])

  useEffect(() => {
    const token = getAdminToken()
    if (!token) {
      setProviders(normalizeProviderStatuses([]))
      return
    }

    fetch('/api/admin/providers', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.providers ?? []
        if (Array.isArray(list)) {
          setProviders(normalizeProviderStatuses(list))
        }
      })
      .catch(() => {
        setProviders(
          normalizeProviderStatuses(
            PROVIDER_CONTRACTS.map((p) => ({
              providerKey: p.id,
              displayName: p.name,
              healthStatus: 'unconfigured',
            }))
          )
        )
      })
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Command Center" subtitle="Frontend control room for contracts, backend-pending routes, and next integration work.">
        <Link href="/dashboard/studio">
          <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">Open Studio <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_GRID.map(([label, status, Icon]) => (
          <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-cyan-300" />
            </div>
            <Badge variant="outline" className="mt-3 border-cyan-500/30 text-cyan-300 text-[10px]">{status}</Badge>
          </Card>
        ))}
      </div>

      <RuntimeProofSummary compact />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-cyan-300" /> Infrastructure Contracts</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {INFRA.map((item) => (
              <div key={item} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-xs font-medium">{item}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">backend_pending</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-violet-300" /> Provider Status</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {providers.map((provider) => (
              <div key={provider.providerKey} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{provider.displayName}</span>
                  <Badge variant="outline" className={getHealthStatusClasses(provider.healthStatus)}>
                    {getHealthStatusLabel(provider.healthStatus)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4 text-amber-300" /> Backend-Pending Queue and Proof</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {PENDING.map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="text-xs font-semibold text-amber-200">{title}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4 text-cyan-300" /> Integration Status</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <span>Provider management</span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">Settings only</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <span>Studio job submission</span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">Wired</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <span>Artifact listing UI</span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">Wired</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <span>Artifact preview/download</span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">Wired</Badge>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" /> Open-Source Tool Contracts</h3>
        <div className="flex flex-wrap gap-2">
          {OPEN_SOURCE_TOOLS.map((tool) => <Badge key={tool.id} variant="outline" className="border-white/10 text-[10px]">{tool.name}</Badge>)}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-300" /> Marketing-First Platform Roadmap</h3>
        <div className="space-y-4 text-xs text-muted-foreground">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
            <div className="font-semibold text-emerald-200 mb-2">Proven Capabilities (10)</div>
            <div className="flex flex-wrap gap-1">
              {['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation'].map((cap) => (
                <Badge key={cap} variant="outline" className="border-emerald-500/30 text-emerald-300 text-[9px]">{cap}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
            <div className="font-semibold text-amber-200 mb-2">Marketing App MVP Dependencies (Not Yet Built)</div>
            <div className="flex flex-wrap gap-1">
              {['brand_scrape', 'brand_vault', 'campaign_planner', 'content_calendar', 'social_adapters', 'long_form_video', 'tts', 'subtitles', 'thumbnails', 'ffmpeg_stitching', 'approval_workflow', 'scheduling'].map((cap) => (
                <Badge key={cap} variant="outline" className="border-amber-500/30 text-amber-300 text-[9px]">{cap}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-4">
            <div className="font-semibold text-violet-200 mb-2">Other App Dependencies (Not Yet Built)</div>
            <div className="flex flex-wrap gap-1">
              {['document_upload', 'ocr', 'music_generation', 'user_memory_import', 'consent_controls'].map((cap) => (
                <Badge key={cap} variant="outline" className="border-violet-500/30 text-violet-300 text-[9px]">{cap}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
            <div className="font-semibold text-muted-foreground mb-2">On Hold</div>
            <div className="flex flex-wrap gap-1">
              {['adult_generation', 'voice_cloning', 'deepfake_detection'].map((cap) => (
                <Badge key={cap} variant="outline" className="border-white/10 text-[9px]">{cap}</Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </PageTransition>
  )
}
