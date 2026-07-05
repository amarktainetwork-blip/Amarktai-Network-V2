'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { EmptyState, SkeletonList } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Boxes, CheckCircle2, AlertTriangle, XCircle, Zap, ArrowRight, Key, Server } from 'lucide-react'
import Link from 'next/link'

const CAPABILITY_MAP = [
  { id: 'text.chat', label: 'Chat / Text', category: 'Language', provider: 'Groq', providerId: 'groq', inputs: 'Prompt', outputs: 'Text', requiresKey: 'GROQ_API_KEY' },
  { id: 'text.reasoning', label: 'Reasoning', category: 'Language', provider: 'MiMo', providerId: 'mimo', inputs: 'Prompt', outputs: 'Text', requiresKey: 'MIMO_API_KEY' },
  { id: 'text.code', label: 'Code Generation', category: 'Language', provider: 'MiMo', providerId: 'mimo', inputs: 'Prompt', outputs: 'Code', requiresKey: 'MIMO_API_KEY' },
  { id: 'image.generate', label: 'Image Generation', category: 'Vision', provider: 'Together AI', providerId: 'together', inputs: 'Prompt, Reference', outputs: 'Image', requiresKey: 'TOGETHER_API_KEY' },
  { id: 'image.edit', label: 'Image Edit', category: 'Vision', provider: 'Together AI', providerId: 'together', inputs: 'Image, Prompt', outputs: 'Image', requiresKey: 'TOGETHER_API_KEY' },
  { id: 'video.generate', label: 'Video Generation', category: 'Motion', provider: 'GenX', providerId: 'genx', inputs: 'Prompt, First Frame', outputs: 'Video', requiresKey: 'GENX_API_KEY' },
  { id: 'video.longform', label: 'Long-form Video', category: 'Motion', provider: 'GenX', providerId: 'genx', inputs: 'Script, Scenes', outputs: 'Video', requiresKey: 'GENX_API_KEY' },
  { id: 'music.generate', label: 'Music / Song', category: 'Audio', provider: 'GenX', providerId: 'genx', inputs: 'Prompt, Lyrics', outputs: 'Audio', requiresKey: 'GENX_API_KEY' },
  { id: 'voice.tts', label: 'Text-to-Speech', category: 'Audio', provider: 'Groq', providerId: 'groq', inputs: 'Text, Voice', outputs: 'Audio', requiresKey: 'GROQ_API_KEY' },
  { id: 'voice.stt', label: 'Speech-to-Text', category: 'Audio', provider: 'Groq', providerId: 'groq', inputs: 'Audio', outputs: 'Text', requiresKey: 'GROQ_API_KEY' },
  { id: 'avatar.generate', label: 'Avatar', category: 'Vision', provider: 'GenX', providerId: 'genx', inputs: 'Face Image, Audio', outputs: 'Video', requiresKey: 'GENX_API_KEY' },
  { id: 'brand.scrape', label: 'Brand Scrape', category: 'Intelligence', provider: 'Local Tools', providerId: 'local_tools', inputs: 'URL', outputs: 'Brand Pack', requiresKey: null },
  { id: 'rag.ingest', label: 'RAG Ingest', category: 'Knowledge', provider: 'Together AI', providerId: 'together', inputs: 'Documents', outputs: 'Vector Store', requiresKey: 'TOGETHER_API_KEY' },
  { id: 'rag.search', label: 'RAG Search', category: 'Knowledge', provider: 'DeepInfra', providerId: 'deepinfra', inputs: 'Query', outputs: 'Cited Results', requiresKey: 'DEEPINFRA_API_KEY' },
]

export default function CapabilitiesPage() {
  const providers = useStudioStore((s) => s.providers) || []
  const fetchProviders = useStudioStore((s) => s.fetchProviders)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchProviders().then(() => setLoading(false)) }, [])

  const getStatus = (cap) => {
    if (cap.providerId === 'local_tools') return { status: 'active', label: 'Tool', color: 'border-cyan-500/30 text-cyan-400' }
    const provider = providers.find((p) => p.id === cap.providerId)
    if (!provider) return { status: 'blocked', label: 'No Provider', color: 'border-rose-500/30 text-rose-400' }
    if (provider.status === 'active') return { status: 'active', label: 'Active', color: 'border-emerald-500/30 text-emerald-400' }
    if (provider.status === 'experimental') return { status: 'experimental', label: 'Experimental', color: 'border-amber-500/30 text-amber-400' }
    return { status: 'needs-config', label: 'Needs Config', color: 'border-amber-500/30 text-amber-400' }
  }

  const getBlocker = (cap) => {
    if (cap.providerId === 'local_tools') return { blocked: false, reason: null, icon: null }
    const provider = providers.find((p) => p.id === cap.providerId)
    if (!provider) return { blocked: true, reason: `Missing provider: ${cap.provider}`, icon: Server }
    if (cap.requiresKey && provider && provider.status !== 'active') return { blocked: true, reason: `Missing API key: ${cap.requiresKey}`, icon: Key }
    return { blocked: false, reason: null, icon: null }
  }

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Capabilities" subtitle="Complete catalogue of all AI capabilities." /><SkeletonList count={6} /></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Capabilities" subtitle="Complete catalogue of all AI capabilities with status and blockers." />

      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Capability</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Inputs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Outputs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Blocker</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_MAP.map((cap) => {
                const s = getStatus(cap)
                const b = getBlocker(cap)
                return (
                  <tr key={cap.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3">
                      <div className="font-medium">{cap.label}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{cap.id}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline" className="border-white/10 text-[10px]">{cap.category}</Badge></td>
                    <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] ${s.color}`}>{s.label}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{cap.provider}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{cap.inputs}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{cap.outputs}</td>
                    <td className="px-4 py-3">
                      {b.blocked ? (
                        <div className="flex items-center gap-1.5 text-[10px] text-rose-400">
                          <b.icon className="h-3 w-3 shrink-0" />
                          <span>{b.reason}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PageTransition>
  )
}
