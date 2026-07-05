'use client'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { EmptyState, SkeletonList } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Boxes, FileText, Image, Film, Music, Mic, Download, ExternalLink, Sparkles } from 'lucide-react'
import Link from 'next/link'

const TYPE_ICONS = { image: Image, audio: Mic, music: Music, video: Film, document: FileText, transcript: FileText, code: FileText, report: FileText }

export default function ProofRunnerPage() {
  const [artifacts, setArtifacts] = useState(null)

  useEffect(() => {
    fetch('/api/simulation/artifacts').then((r) => r.json()).then((d) => setArtifacts(d?.artifacts || [])).catch(() => setArtifacts([]))
  }, [])

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Proof Runner" subtitle="Validation view for all system-generated artifacts. Proof of work." />

      {/* Loading */}
      {artifacts === null && <SkeletonList count={4} />}

      {/* Empty */}
      {artifacts !== null && artifacts.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="No Artifacts Yet"
          description="Run a capability from the Studio to generate your first artifact. Completed artifacts will appear here with full lineage tracking."
          action={
            <Link href="/dashboard/studio">
              <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
                <Sparkles className="mr-1.5 h-4 w-4" /> Open Studio
              </Button>
            </Link>
          }
        />
      )}

      {/* Artifact list */}
      {artifacts !== null && artifacts.length > 0 && (
        <div className="space-y-3">
          {artifacts.map((a) => {
            const Icon = TYPE_ICONS[a.type] || FileText
            return (
              <Card key={a.id} className="border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/10 to-violet-500/10">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{a.title || `${a.type} artifact`}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.type} · {a.provider} · {a.mimeType} · {(a.fileSizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <StatusPill status={a.status}>{a.status}</StatusPill>
                  {a.storageUrl && (
                    <a href={a.storageUrl} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground transition">
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageTransition>
  )
}
