'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CAPABILITY_ROUTING_MAP, APPROVED_PROVIDERS, ROUTING_TRUTH, BRAIN_ROUTER_V1, MODEL_CATALOGUE_SUMMARY } from '@/lib/capability-routing-map'
import {
  MessageSquare, Image as ImageIcon, Video, Music, Mic, Search, Palette, Plug, Activity, ShieldAlert,
  Zap, AlertTriangle, CheckCircle2, Clock, Lock,
} from 'lucide-react'

const STATUS_CONFIG = {
  live: { label: 'Live', icon: CheckCircle2, className: 'border-emerald-500/30 text-emerald-300' },
  partial: { label: 'Partial', icon: Zap, className: 'border-cyan-500/30 text-cyan-300' },
  pending: { label: 'Pending', icon: Clock, className: 'border-amber-500/30 text-amber-400' },
  blocked: { label: 'On Hold', icon: Lock, className: 'border-rose-500/30 text-rose-300' },
}

const SECTIONS = [
  {
    title: 'Chat & Reasoning',
    icon: MessageSquare,
    capabilityIds: ['chat'],
    description: 'Conversational text generation, reasoning, and structured output.',
  },
  {
    title: 'Image Creation',
    icon: ImageIcon,
    capabilityIds: ['image_generation', 'image_edit'],
    description: 'Generate images from prompts, edit, upscale, and create variations.',
  },
  {
    title: 'Video Creation',
    icon: Video,
    capabilityIds: ['video_generation', 'image_to_video', 'long_form_video'],
    description: 'Short-form video, image-to-video animation, and long-form multi-scene production.',
  },
  {
    title: 'Music & Audio',
    icon: Music,
    capabilityIds: ['music_generation'],
    description: 'Create songs, instrumentals, stems, remixes, and variations.',
  },
  {
    title: 'Voice',
    icon: Mic,
    capabilityIds: ['tts', 'stt'],
    description: 'Text-to-speech and speech-to-text transcription.',
  },
  {
    title: 'Research & RAG',
    icon: Search,
    capabilityIds: ['research', 'embeddings'],
    description: 'Web research, document research, citations, and retrieval-augmented generation.',
  },
  {
    title: 'Brand & Marketing',
    icon: Palette,
    capabilityIds: ['brand_scrape', 'campaign_generation'],
    description: 'Platform capabilities consumed by external Marketing App via app API key. Platform handles provider routing, artifacts, and budgets.',
  },
  {
    title: 'Apps & Automation',
    icon: Plug,
    capabilityIds: [],
    description: 'App gateway, webhooks, and automation workflows.',
  },
  {
    title: 'Operations & Governance',
    icon: Activity,
    capabilityIds: [],
    description: 'Job monitoring, provider spend, user metrics, and system health.',
  },
  {
    title: 'Adult / Restricted',
    icon: ShieldAlert,
    capabilityIds: ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video'],
    description: 'Governed adult capabilities. On hold until policy proof exists.',
  },
]

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = config.icon
  return (
    <Badge variant="outline" className={`${config.className} text-[9px]`}>
      <Icon className="mr-1 h-2.5 w-2.5" /> {config.label}
    </Badge>
  )
}

function CapabilityRow({ capability }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{capability.label}</span>
        <StatusBadge status={capability.executionStatus} />
      </div>
      <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground/60">Dashboard: </span>
          {capability.dashboardSurface ? (
            <Link href={capability.dashboardSurface} className="text-cyan-300 hover:underline">
              {capability.dashboardSurface}
            </Link>
          ) : (
            <span className="text-muted-foreground/40">Not exposed</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground/60">Wired provider: </span>
          <span className={capability.wiredProvider ? 'text-violet-300' : 'text-muted-foreground/40'}>
            {capability.wiredProvider || 'None'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Available providers: </span>
          <span>{capability.availableProviders.length > 0 ? capability.availableProviders.join(', ') : 'None'}</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Routing modes: </span>
          <span>{capability.plannedRoutingModes.length > 0 ? capability.plannedRoutingModes.join(', ') : 'N/A'}</span>
        </div>
      </div>
      {capability.notes && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">{capability.notes}</p>
      )}
    </div>
  )
}

export default function CapabilityLabPage() {
  const [modelDiscovery, setModelDiscovery] = useState(null)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    fetch('/api/admin/models/discovery/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => response.json())
      .then((data) => setModelDiscovery(data))
      .catch(() => setModelDiscovery(null))
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Capability Lab"
        subtitle="Platform capability map. What the central platform can do, grouped by user workflow. External apps consume these capabilities via app API keys — they never call providers directly."
      />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Platform Architecture</h3>
        <div className="space-y-2 text-[10px] text-muted-foreground">
          <p>AmarktAI Network V2 is the central capability platform. All AI capabilities, provider/model routing, execution workers, artifacts, app API key contracts, budgets, memory/RAG, and proof/status truth live here.</p>
          <p>External apps (Marketing, CRM, Education, Legal, etc.) request capabilities only. They never call providers directly, never store provider keys, and never choose provider/model directly.</p>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Routing Truth</h3>
        <div className="grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Image generation: </span>
            <span className="text-violet-300">{ROUTING_TRUTH.image_generation_wired_to} only</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Video generation: </span>
            <span className="text-violet-300">{ROUTING_TRUTH.video_generation_wired_to} only</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Chat/text: </span>
            <span className="text-violet-300">{ROUTING_TRUTH.text_chat_wired_to}</span>
            <span className="text-muted-foreground/60"> + fallback </span>
            <span className="text-violet-300">{ROUTING_TRUTH.text_chat_fallback}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Music generation: </span>
            <span className="text-amber-400">{ROUTING_TRUTH.music_generation}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Long-form video: </span>
            <span className="text-amber-400">{ROUTING_TRUTH.long_form_video}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Research: </span>
            <span className="text-amber-400">{ROUTING_TRUTH.research}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Voice: </span>
            <span className="text-amber-400">{ROUTING_TRUTH.voice}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Provider/model override (app-facing): </span>
            <span className="text-rose-300">{ROUTING_TRUTH.app_facing_provider_override ? 'allowed' : 'blocked'}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">MiMo policy: </span>
            <span className="text-violet-300">{ROUTING_TRUTH.mimo_policy}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">Approved providers:</span>
          {APPROVED_PROVIDERS.map((p) => (
            <Badge key={p} variant="outline" className="border-white/10 text-[9px]">{p}</Badge>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Provider Model Discovery</h3>
        <p className="mb-3 text-[10px] text-muted-foreground">
          Provider has model is not the same as AmarktAI can execute capability. Execution still requires endpoint shape, provider client, worker executor, policy approval, and proof.
          Missing client/executor blockers are shown separately from catalogue-only models.
        </p>
        <div className="grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Docs-known: </span>
            <span className="text-violet-300">{modelDiscovery?.generatedLayer?.totalDocsFallbackModels ?? 'pending'}</span>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
            <span className="text-muted-foreground/60">Executable: </span>
            <span className="text-emerald-300">{modelDiscovery?.catalogue?.executable ?? MODEL_CATALOGUE_SUMMARY.executable.length}</span>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2">
            <span className="text-muted-foreground/60">Catalogue-only: </span>
            <span className="text-amber-300">{modelDiscovery?.catalogue?.catalogueOnly ?? MODEL_CATALOGUE_SUMMARY.planned.length}</span>
          </div>
          <div className="rounded-md border border-rose-500/20 bg-rose-500/[0.04] p-2">
            <span className="text-muted-foreground/60">Blocked/restricted: </span>
            <span className="text-rose-300">{modelDiscovery?.catalogue?.blocked ?? MODEL_CATALOGUE_SUMMARY.blocked.length}</span>
          </div>
          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
            <span className="text-muted-foreground/60">Live-discovered: </span>
            <span className="text-cyan-300">{modelDiscovery?.generatedLayer?.totalLiveDiscoveredModels ?? 'pending'}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Full universe known: </span>
            <span className={modelDiscovery?.generatedLayer?.fullProviderModelUniverseKnown ? 'text-emerald-300' : 'text-amber-300'}>
              {modelDiscovery?.generatedLayer?.fullProviderModelUniverseKnown ? 'yes' : 'no'}
            </span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">Policy restricted: </span>
            <span className="text-rose-300">{modelDiscovery?.generatedLayer?.policyRestrictedModels ?? 'pending'}</span>
          </div>
          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
            <span className="text-muted-foreground/60">GenX music known: </span>
            <span className={modelDiscovery?.generatedLayer?.genxMusicCapabilityKnown ? 'text-cyan-300' : 'text-muted-foreground/40'}>
              {modelDiscovery?.generatedLayer?.genxMusicCapabilityKnown ? 'yes' : 'pending'}
            </span>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2">
            <span className="text-muted-foreground/60">GenX music executable: </span>
            <span className={modelDiscovery?.generatedLayer?.genxMusicExecutionReady ? 'text-emerald-300' : 'text-amber-300'}>
              {modelDiscovery?.generatedLayer?.genxMusicExecutionReady ? 'yes' : 'no'}
            </span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">MiMo capability known: </span>
            <span className="text-violet-300">{modelDiscovery?.generatedLayer?.mimoCapabilityKnown ? 'yes' : 'pending'}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
            <span className="text-muted-foreground/60">MiMo backend allowed: </span>
            <span className="text-rose-300">no</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-2 sm:col-span-2">
            <span className="text-muted-foreground/60">MiMo reason: </span>
            <span className="text-violet-300">coding-agent-only policy</span>
          </div>
        </div>
        <p className="mt-3 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2 text-[10px] text-muted-foreground">
          GenX music capability is known from official docs/catalogue. Execution is blocked until GenX music request/response/artifact client + worker executor are wired.
        </p>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-5">
          {APPROVED_PROVIDERS.map((provider) => (
            <div key={provider} className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <span className="text-muted-foreground/60">{provider}: </span>
              <span className="text-violet-300">{modelDiscovery?.generatedLayer?.countsByProvider?.[provider] ?? 'pending'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Brain Router v1</h3>
        <div className="space-y-3 text-[10px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-300">
              <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Active — Integrated in Worker
            </Badge>
            <span className="text-muted-foreground/60">Module: {BRAIN_ROUTER_V1.module}</span>
          </div>
          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
            <span className="text-cyan-300 font-semibold">Worker integration: </span>
            <span className="text-muted-foreground">
              Worker calls routeBrain() before every execution. Provider/model are selected internally — apps cannot override.
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <span className="text-muted-foreground/60">Catalogue models: </span>
              <span className="text-violet-300">{BRAIN_ROUTER_V1.modelCatalogueTotal}</span>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <span className="text-muted-foreground/60">Executable: </span>
              <span className="text-emerald-300">{BRAIN_ROUTER_V1.executableModels}</span>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <span className="text-muted-foreground/60">Planned: </span>
              <span className="text-amber-400">{BRAIN_ROUTER_V1.plannedModels}</span>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <span className="text-muted-foreground/60">Blocked: </span>
              <span className="text-rose-300">{BRAIN_ROUTER_V1.blockedModels}</span>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground/60">Routing modes: </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {BRAIN_ROUTER_V1.routingModes.map((mode) => (
                <Badge key={mode} variant="outline" className="border-cyan-500/20 text-[9px] text-cyan-300">{mode}</Badge>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground/60">
              Apps may request routingMode as a preference. Provider/model override remains blocked.
            </p>
          </div>
          <div>
            <span className="text-muted-foreground/60">Executable paths today:</span>
            <div className="mt-1 space-y-1">
              {Object.entries(BRAIN_ROUTER_V1.executablePaths).map(([cap, path]) => (
                <div key={cap} className="rounded-md border border-white/[0.06] bg-black/20 p-1.5">
                  <span className="text-muted-foreground/60">{cap}: </span>
                  <span className={path === 'pending' ? 'text-amber-400' : 'text-violet-300'}>{path}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground/60">Model catalogue breakdown:</span>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
                <div className="mb-1 text-[9px] font-semibold text-emerald-300">Executable ({MODEL_CATALOGUE_SUMMARY.executable.length})</div>
                {MODEL_CATALOGUE_SUMMARY.executable.map((m) => (
                  <div key={`${m.provider}-${m.modelId}`} className="text-[9px] text-muted-foreground">
                    <span className="text-violet-300">{m.provider}</span> / {m.modelId}
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2">
                <div className="mb-1 text-[9px] font-semibold text-amber-300">Planned ({MODEL_CATALOGUE_SUMMARY.planned.length})</div>
                {MODEL_CATALOGUE_SUMMARY.planned.map((m) => (
                  <div key={`${m.provider}-${m.modelId}`} className="text-[9px] text-muted-foreground">
                    <span className="text-violet-300">{m.provider}</span> / {m.modelId}
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-rose-500/20 bg-rose-500/[0.04] p-2">
                <div className="mb-1 text-[9px] font-semibold text-rose-300">Blocked ({MODEL_CATALOGUE_SUMMARY.blocked.length})</div>
                {MODEL_CATALOGUE_SUMMARY.blocked.map((m) => (
                  <div key={`${m.provider}-${m.modelId}`} className="text-[9px] text-muted-foreground">
                    <span className="text-violet-300">{m.provider}</span> / {m.modelId} — {m.reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {SECTIONS.map((section) => {
        const Icon = section.icon
        const capabilities = section.capabilityIds
          .map((id) => CAPABILITY_ROUTING_MAP.find((c) => c.id === id))
          .filter(Boolean)

        return (
          <Card key={section.title} className="border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold">{section.title}</h3>
            </div>
            <p className="mb-3 text-[10px] text-muted-foreground">{section.description}</p>
            {capabilities.length > 0 ? (
              <div className="space-y-2">
                {capabilities.map((cap) => (
                  <CapabilityRow key={cap.id} capability={cap} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <p className="text-[10px] text-muted-foreground">Workflow surface exists but no capability routing entries yet.</p>
              </div>
            )}
          </Card>
        )
      })}

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
          <Zap className="h-3.5 w-3.5" /> Pre-deploy proof pack
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Run <code className="rounded bg-black/30 px-1 py-0.5 text-[9px] text-cyan-300">npm run proof:router-app-contract</code> to verify app contract, Brain Router, and executable paths before deploy.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> No fake ready states
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          This page reflects the actual wiring state of the platform. Nothing is marked live unless a real backend endpoint exists.
          Provider/model override is not exposed in app-facing flows. Adult generation remains on hold.
        </p>
      </div>
    </PageTransition>
  )
}
