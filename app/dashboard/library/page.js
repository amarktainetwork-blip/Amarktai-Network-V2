'use client'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { getRuntimeCapabilityProof } from '@/lib/runtime-proof-status'
import { MessageSquare, Image as ImageIcon, Video, Music, FileText, FolderOpen, ExternalLink } from 'lucide-react'

export default function LibraryPage() {
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const imageProof = getRuntimeCapabilityProof(runtimeProofStatus, 'image_generation')
  const videoProof = getRuntimeCapabilityProof(runtimeProofStatus, 'video_generation')
  const imageReady = imageProof.readyForDashboardExecution === true
  const videoReady = videoProof.readyForDashboardExecution === true

  const librarySections = [
    { label: 'Images', icon: ImageIcon, status: imageReady ? 'ready' : 'blocked', href: '/dashboard/artifacts', description: 'Canonical generated image artifacts' },
    { label: 'Videos', icon: Video, status: videoReady ? 'ready' : 'blocked', href: '/dashboard/artifacts', description: 'Short, source-aware, and long-form video artifacts' },
    { label: 'Music & Voice', icon: Music, status: 'ready', href: '/dashboard/artifacts', description: 'Generated instrumental music and speech artifacts' },
    { label: 'All Artifacts', icon: FolderOpen, status: 'ready', href: '/dashboard/artifacts', description: 'Authenticated listing with preview, range playback, and download' },
    { label: 'Chats', icon: MessageSquare, status: 'browser', href: '/dashboard/chat', description: 'Multi-turn history stored in this authenticated browser' },
    { label: 'Research Reports', icon: FileText, status: 'excluded', href: '/dashboard/research', description: 'Research is outside this release candidate' },
  ]

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Library" subtitle="Unified library for all generated content, uploaded files, and artifacts." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {librarySections.map((section) => {
          const Icon = section.icon
          const statusLabel = section.status === 'ready' ? 'Ready' : section.status === 'browser' ? 'Browser local' : section.status === 'excluded' ? 'Excluded' : 'Blocked by runtime truth'
          const statusClass = section.status === 'ready' || section.status === 'browser' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-400'
          return (
            <Card key={section.label} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-cyan-300" />
                <Badge variant="outline" className={`${statusClass} text-[9px]`}>{statusLabel}</Badge>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{section.label}</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">{section.description}</p>
              {section.href && (
                <Link href={section.href} className="mt-3 inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:underline">
                  View <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Artifact API</h3>
        <p className="text-xs text-muted-foreground">
          Artifacts are served from <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px]">/api/admin/artifacts</code> with authorized preview and download at <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px]">/api/admin/artifacts/:id/file</code>.
        </p>
        <Link href="/dashboard/artifacts" className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">
          Go to Artifacts page <ExternalLink className="h-3 w-3" />
        </Link>
      </Card>
    </PageTransition>
  )
}
