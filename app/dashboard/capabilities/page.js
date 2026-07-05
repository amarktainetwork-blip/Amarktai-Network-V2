'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CAPABILITY_CONTRACTS, PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP } from '@/lib/capability-map'
import { Boxes, Route } from 'lucide-react'

const CATALOG = [
  ['Language', 'text.chat', 'chat', ['groq']],
  ['Language', 'text.reasoning', 'reasoning', ['mimo']],
  ['Language', 'text.code', 'code', ['mimo']],
  ['Image', 'image.generate', 'image_generation', ['together']],
  ['Image', 'image.edit', 'image_edit', ['together']],
  ['Video', 'video.generate', 'video_generation', ['genx']],
  ['Video', 'video.longform', null, ['genx']],
  ['Audio/Music', 'music.generate', 'music_generation', ['genx']],
  ['Voice', 'voice.tts', 'tts', ['groq']],
  ['Voice', 'voice.stt', 'stt', ['groq']],
  ['Avatar', 'avatar.generate', 'avatar_generation', ['genx']],
  ['Scrape/Brand', 'scrape.crawl', 'brand_scrape', ['local tools']],
  ['RAG/Knowledge', 'rag.ingest', 'rag_ingest', ['together']],
  ['RAG/Knowledge', 'rag.query', 'rag_search', ['together']],
  ['App/System', 'structured_output', 'structured_output', ['groq', 'mimo']],
  ['Gated/Uncensored', 'uncensored.text', null, ['deepinfra']],
]

const providersById = Object.fromEntries(PROVIDER_CONTRACTS.map((provider) => [provider.id, provider]))

export default function CapabilitiesPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Capability Catalogue" subtitle="Dashboard modes, backend canonical keys, blockers, and next actions for frontend contract workflows." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CATALOG.map(([category, dashboardMode, backendKey, providerIds]) => {
          const map = DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardMode]
          const missing = map?.missing || backendKey === null
          const providers = providerIds.map((id) => providersById[id]?.name || id).join(', ')
          return (
            <Card key={`${category}-${dashboardMode}`} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="mb-2 border-white/10 text-[10px]">{category}</Badge>
                  <h3 className="text-sm font-semibold">{dashboardMode}</h3>
                </div>
                <Boxes className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Backend key</span><span className="font-mono">{backendKey || map?.expectedBackendKey || map?.plannedBackendKey || 'planned'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Providers</span><span className="text-right">{providers}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Required env</span><span className="text-right">{providerIds.map((id) => providersById[id]?.envKey).filter(Boolean).join(', ') || 'local tool'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Frontend controls</span><span>ui_ready</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Backend route</span><span>{missing ? 'capability_missing' : 'route_pending'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Live proof</span><span>live_proof_required</span></div>
              </div>
              <div className="mt-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] text-muted-foreground">
                <Route className="mr-1 inline h-3 w-3" /> Next action: wire /api/v1 route, provider keys, attempts, artifacts, and proof capture.
              </div>
              {missing && <Badge variant="outline" className="mt-3 border-amber-500/30 text-amber-400 text-[10px]">missing/planned backend key</Badge>}
            </Card>
          )
        })}
      </div>
    </PageTransition>
  )
}
