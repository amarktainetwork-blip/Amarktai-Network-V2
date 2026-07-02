'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { EmptyState, SkeletonList } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Boxes, CheckCircle2, AlertTriangle, XCircle, Zap, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const CAPABILITY_MAP = [
  { id: 'text.chat', label: 'Chat / Text', category: 'Language', provider: 'Groq', inputs: 'Prompt', outputs: 'Text' },
  { id: 'text.reasoning', label: 'Reasoning', category: 'Language', provider: 'Groq', inputs: 'Prompt', outputs: 'Text' },
  { id: 'text.code', label: 'Code Generation', category: 'Language', provider: 'Groq', inputs: 'Prompt', outputs: 'Code' },
  { id: 'image.generate', label: 'Image Generation', category: 'Vision', provider: 'Together AI', inputs: 'Prompt, Reference', outputs: 'Image' },
  { id: 'image.edit', label: 'Image Edit', category: 'Vision', provider: 'Together AI', inputs: 'Image, Prompt', outputs: 'Image' },
  { id: 'video.generate', label: 'Video Generation', category: 'Motion', provider: 'GenX', inputs: 'Prompt, First Frame', outputs: 'Video' },
  { id: 'video.longform', label: 'Long-form Video', category: 'Motion', provider: 'GenX', inputs: 'Script, Scenes', outputs: 'Video' },
  { id: 'music.generate', label: 'Music / Song', category: 'Audio', provider: 'GenX', inputs: 'Prompt, Lyrics', outputs: 'Audio' },
  { id: 'voice.tts', label: 'Text-to-Speech', category: 'Audio', provider: 'Groq', inputs: 'Text, Voice', outputs: 'Audio' },
  { id: 'voice.stt', label: 'Speech-to-Text', category: 'Audio', provider: 'Groq', inputs: 'Audio', outputs: 'Text' },
  { id: 'avatar.generate', label: 'Avatar', category: 'Vision', provider: 'GenX', inputs: 'Face Image, Audio', outputs: 'Video' },
  { id: 'brand.scrape', label: 'Brand Scrape', category: 'Intelligence', provider: 'Internal', inputs: 'URL', outputs: 'Brand Pack' },
  { id: 'rag.ingest', label: 'RAG Ingest', category: 'Knowledge', provider: 'Together AI', inputs: 'Documents', outputs: 'Vector Store' },
  { id: 'rag.search', label: 'RAG Search', category: 'Knowledge', provider: 'Together AI', inputs: 'Query', outputs: 'Cited Results' },
]

export default function CapabilitiesPage() {
  const providers = useStudioStore((s) => s.providers) || []
  const fetchProviders = useStudioStore((s) => s.fetchProviders)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchProviders().then(() => setLoading(false)) }, [])

  const getStatus = (cap) => {
    const provider = providers.find((p) => p.id === cap.provider.toLowerCase().replace(' ', ''))
    if (!provider) return { status: 'blocked', label: 'No Provider', color: 'border-rose-500/30 text-rose-400' }
    if (provider.status === 'active') return { status: 'active', label: 'Active', color: 'border-emerald-500/30 text-emerald-400' }
    if (provider.status === 'experimental') return { status: 'experimental', label: 'Experimental', color: 'border-amber-500/30 text-amber-400' }
    return { status: 'needs-config', label: 'Needs Config', color: 'border-amber-500/30 text-amber-400' }
  }

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="Capabilities" subtitle="Complete catalogue of all AI capabilities." /><SkeletonList count={6} /></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Capabilities" subtitle="Complete catalogue of all AI capabilities." />

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
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_MAP.map((cap) => {
                const s = getStatus(cap)
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
