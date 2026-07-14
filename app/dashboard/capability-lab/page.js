'use client'
import { useEffect, useMemo, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare, Image as ImageIcon, Video, Music, Mic, Search, Palette, Plug, Activity, ShieldAlert,
  Zap, AlertTriangle, CheckCircle2, Clock, Lock, Database,
} from 'lucide-react'

const STATUS_CONFIG = {
  LIVE_PROVEN: { label: 'Live proven', icon: CheckCircle2, className: 'border-emerald-500/30 text-emerald-300' },
  EXECUTABLE_NOT_LIVE_PROVEN: { label: 'Executable', icon: Zap, className: 'border-cyan-500/30 text-cyan-300' },
  IMPLEMENTED_NOT_CONFIGURED: { label: 'Needs config', icon: Clock, className: 'border-cyan-500/30 text-cyan-300' },
  PARTIAL: { label: 'Partial', icon: Zap, className: 'border-cyan-500/30 text-cyan-300' },
  CATALOGUE_ONLY: { label: 'Catalogue', icon: Clock, className: 'border-amber-500/30 text-amber-400' },
  POLICY_RESTRICTED: { label: 'On hold', icon: Lock, className: 'border-rose-500/30 text-rose-300' },
  BLOCKED: { label: 'Blocked', icon: Lock, className: 'border-rose-500/30 text-rose-300' },
  MISSING: { label: 'Missing', icon: AlertTriangle, className: 'border-rose-500/30 text-rose-300' },
}

const FAMILY_ICONS = {
  Language: MessageSquare,
  Image: ImageIcon,
  Video,
  Audio: Music,
  Avatar: Mic,
  Knowledge: Search,
  Intelligence: Search,
  Multimodal: Activity,
  Document: Database,
  Marketing: Palette,
  'Adult Governed': ShieldAlert,
}

const FAMILY_ORDER = [
  'Language',
  'Image',
  'Video',
  'Audio',
  'Avatar',
  'Knowledge',
  'Intelligence',
  'Multimodal',
  'Document',
  'Marketing',
  'Adult Governed',
]

function StatusBadge({ classification }) {
  const config = STATUS_CONFIG[classification] || STATUS_CONFIG.MISSING
  const Icon = config.icon
  return (
    <Badge variant="outline" className={`${config.className} text-[9px]`}>
      <Icon className="mr-1 h-2.5 w-2.5" /> {config.label}
    </Badge>
  )
}

function CapabilityRow({ cap }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium">{cap.label || cap.capability}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">{cap.description || cap.capability}</p>
        </div>
        <StatusBadge classification={cap.classification} />
      </div>
      <div className="mt-3 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-muted-foreground/60">Providers: </span>
          <span>{cap.eligibleProviders?.length > 0 ? cap.eligibleProviders.join(', ') : 'None'}</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Models: </span>
          <span>{cap.discoveredModelCount ?? 0}</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Output: </span>
          <span>{cap.outputType || 'unknown'}</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Artifact: </span>
          <span className={cap.artifactRequired ? 'text-cyan-300' : 'text-muted-foreground/40'}>
            {cap.artifactRequired ? 'required' : 'not required'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Executable now: </span>
          <span className={cap.executableNow ? 'text-emerald-300' : 'text-muted-foreground/40'}>
            {cap.executableNow ? 'yes' : 'no'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Live proof: </span>
          <span className={cap.liveProven ? 'text-emerald-300' : 'text-muted-foreground/40'}>
            {cap.liveProven ? 'yes' : 'no'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Studio mode: </span>
          <span>{cap.studioMode || cap.capability}</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Dashboard type: </span>
          <span>{cap.dashboardType || cap.capability}</span>
        </div>
      </div>
      {cap.blockedReasons?.length > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Blockers: {cap.blockedReasons.join(', ')}
        </p>
      )}
    </div>
  )
}

function CountCard({ label, value, tone = 'text-violet-300' }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
      <span className="text-muted-foreground/60">{label}: </span>
      <span className={tone}>{value ?? 0}</span>
    </div>
  )
}

export default function CapabilityLabPage() {
  const [truth, setTruth] = useState(null)
  const [modelDiscovery, setModelDiscovery] = useState(null)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    fetch('/api/admin/truth', { headers })
      .then((response) => response.json())
      .then((data) => setTruth(data?.truth ?? null))
      .catch(() => setTruth(null))
    fetch('/api/admin/models/discovery/status', { headers })
      .then((response) => response.json())
      .then((data) => setModelDiscovery(data))
      .catch(() => setModelDiscovery(null))
  }, [])

  const capabilities = truth?.capabilities ?? []
  const providers = truth?.providers ?? []
  const counts = truth?.countsByClassification ?? {}
  const runtimeProviders = truth?.providerPolicy?.runtimeExecutionProviders ?? []
  const codingOnlyProviders = truth?.providerPolicy?.codingOnlyProviders ?? []

  const groupedCapabilities = useMemo(() => {
    const groups = new Map()
    for (const capability of capabilities) {
      const family = capability.family || 'Unsorted'
      const group = groups.get(family) ?? []
      group.push(capability)
      groups.set(family, group)
    }

    return [...groups.entries()].sort(([a], [b]) => {
      const aIndex = FAMILY_ORDER.indexOf(a)
      const bIndex = FAMILY_ORDER.indexOf(b)
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
      return a.localeCompare(b)
    })
  }, [capabilities])

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Capability Lab"
        subtitle="Canonical platform capability map. Apps request capabilities; backend truth decides provider/model routing, proof status, and blockers."
      />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Platform Architecture</h3>
        <div className="space-y-2 text-[10px] text-muted-foreground">
          <p>AmarktAI Network V2 is the central capability platform. All AI capabilities, provider/model routing, execution workers, artifacts, app API key contracts, budgets, memory/RAG, and proof/status truth live here.</p>
          <p>External apps request capabilities only. They never call providers directly, never store provider keys, and never choose provider/model directly.</p>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Canonical Runtime Truth</h3>
        <div className="grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(STATUS_CONFIG).map(([classification, config]) => (
            <CountCard key={classification} label={config.label} value={counts[classification] ?? 0} tone={config.className.split(' ').at(-1)} />
          ))}
        </div>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
          <CountCard label="Runtime providers" value={runtimeProviders.join(', ') || 'pending'} />
          <CountCard label="Coding-only providers" value={codingOnlyProviders.join(', ') || 'none'} tone="text-cyan-300" />
          <CountCard label="Qwen backend runtime" value={truth?.providerPolicy?.qwenRuntimeEligible ? 'allowed' : 'not allowed'} tone="text-rose-300" />
        </div>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-5">
          {providers.map((provider) => (
            <div key={provider.provider} className="rounded-md border border-white/[0.06] bg-black/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-violet-300">{provider.provider}</span>
                <span className={provider.configured ? 'text-emerald-300' : 'text-muted-foreground/50'}>
                  {provider.codingOnly ? 'coding only' : provider.configured ? 'configured' : 'not configured'}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground/60">{provider.healthStatus || 'unconfigured'}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Provider Model Discovery</h3>
        <p className="mb-3 text-[10px] text-muted-foreground">
          Provider has model is not the same as AmarktAI can execute capability. Execution still requires endpoint shape, provider client, worker executor, policy approval, and proof.
        </p>
        <div className="grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-5">
          <CountCard label="Docs-known" value={modelDiscovery?.generatedLayer?.totalDocsFallbackModels ?? 'pending'} />
          <CountCard label="Executable" value={modelDiscovery?.catalogue?.executable ?? 'pending'} tone="text-emerald-300" />
          <CountCard label="Catalogue-only" value={modelDiscovery?.catalogue?.catalogueOnly ?? 'pending'} tone="text-amber-300" />
          <CountCard label="Blocked/restricted" value={modelDiscovery?.catalogue?.blocked ?? 'pending'} tone="text-rose-300" />
          <CountCard label="Live-discovered" value={modelDiscovery?.generatedLayer?.totalLiveDiscoveredModels ?? 'pending'} tone="text-cyan-300" />
        </div>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
          <CountCard label="Full universe known" value={modelDiscovery?.generatedLayer?.fullProviderModelUniverseKnown ? 'yes' : 'no'} tone={modelDiscovery?.generatedLayer?.fullProviderModelUniverseKnown ? 'text-emerald-300' : 'text-amber-300'} />
          <CountCard label="Policy restricted" value={modelDiscovery?.generatedLayer?.policyRestrictedModels ?? 'pending'} tone="text-rose-300" />
          <CountCard label="GenX music known" value={modelDiscovery?.generatedLayer?.genxMusicCapabilityKnown ? 'yes' : 'pending'} tone="text-cyan-300" />
          <CountCard label="GenX music executable" value={modelDiscovery?.generatedLayer?.genxMusicExecutionReady ? 'yes' : 'no'} tone={modelDiscovery?.generatedLayer?.genxMusicExecutionReady ? 'text-emerald-300' : 'text-amber-300'} />
          <CountCard label="MiMo capability known" value={modelDiscovery?.generatedLayer?.mimoCapabilityKnown ? 'yes' : 'pending'} />
          <CountCard label="MiMo backend allowed" value="no" tone="text-rose-300" />
        </div>
        <p className="mt-3 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2 text-[10px] text-muted-foreground">
          GenX music capability is known from official docs/catalogue. Execution remains governed by backend runtime truth and live artifact proof.
        </p>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Brain Router</h3>
        <div className="space-y-3 text-[10px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-300">
              <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Active in worker
            </Badge>
            <span className="text-muted-foreground/60">Module: packages/core/src/orchestra.ts</span>
          </div>
          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
            <span className="font-semibold text-cyan-300">Worker integration: </span>
            <span className="text-muted-foreground">
              Orchestra selects the exact provider, model, and executor registration. App-facing provider/model overrides remain blocked.
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CountCard label="Capabilities" value={capabilities.length} />
            <CountCard label="Live proven" value={counts.LIVE_PROVEN ?? 0} tone="text-emerald-300" />
            <CountCard label="Executable, not proven" value={counts.EXECUTABLE_NOT_LIVE_PROVEN ?? 0} tone="text-cyan-300" />
            <CountCard label="Policy restricted" value={counts.POLICY_RESTRICTED ?? 0} tone="text-rose-300" />
          </div>
        </div>
      </Card>

      {groupedCapabilities.map(([family, items]) => {
        const Icon = FAMILY_ICONS[family] || Plug

        return (
          <Card key={family} className="border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold">{family}</h3>
            </div>
            <div className="space-y-2">
              {items.map((cap) => (
                <CapabilityRow key={cap.capability} cap={cap} />
              ))}
            </div>
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
          This page reflects backend runtime truth. Nothing is marked live unless real proof exists. Provider/model override is not exposed in app-facing flows. Adult generation remains on hold.
        </p>
      </div>
    </PageTransition>
  )
}
