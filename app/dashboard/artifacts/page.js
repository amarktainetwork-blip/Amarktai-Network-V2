'use client'

import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary } from '@/components/dashboard/runtime-proof-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Download, FileArchive, Image as ImageIcon, Settings } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const STATUS_COLORS = {
  completed: 'border-emerald-500/30 text-emerald-300',
  processing: 'border-cyan-500/30 text-cyan-300',
  failed: 'border-rose-500/30 text-rose-300',
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function artifactErrorMessage(status, fallback = 'Artifact file request failed') {
  if (status === 401) return 'Unauthorized'
  if (status === 404) return 'Artifact file not found'
  if (status === 409) return 'Artifact is not ready'
  if (status === 502) return 'Backend unavailable'
  return fallback
}

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewUrls, setPreviewUrls] = useState({})
  const [previewErrors, setPreviewErrors] = useState({})
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    fetch('/api/admin/artifacts?limit=50', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setArtifacts(data?.artifacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    const objectUrls = []
    const nextPreviewUrls = {}
    const nextPreviewErrors = {}
    const imageArtifacts = artifacts.filter((artifact) =>
      artifact.status === 'completed' &&
      artifact.previewable &&
      IMAGE_MIME_TYPES.has(artifact.mimeType)
    )

    if (imageArtifacts.length === 0) {
      setPreviewUrls({})
      setPreviewErrors({})
      return undefined
    }

    let cancelled = false
    async function loadPreviews() {
      await Promise.all(imageArtifacts.map(async (artifact) => {
        try {
          const response = await fetch(`/api/admin/artifacts/${artifact.id}/file`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (!response.ok) {
            nextPreviewErrors[artifact.id] = artifactErrorMessage(response.status)
            return
          }
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          nextPreviewUrls[artifact.id] = url
        } catch {
          nextPreviewErrors[artifact.id] = 'Backend unavailable'
        }
      }))

      if (!cancelled) {
        setPreviewUrls(nextPreviewUrls)
        setPreviewErrors(nextPreviewErrors)
      }
    }

    loadPreviews()
    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [artifacts])

  const downloadArtifact = async (artifact) => {
    setDownloadError('')
    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    try {
      const response = await fetch(`/api/admin/artifacts/${artifact.id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        let message = artifactErrorMessage(response.status)
        try {
          const data = await response.json()
          message = data?.message || message
        } catch {}
        setDownloadError(message)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${artifact.title || artifact.id}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDownloadError('Backend unavailable')
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Artifacts" subtitle="Generated media metadata, preview, and download controls." />

      <RuntimeProofSummary compact />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><FileArchive className="h-4 w-4 text-cyan-300" /> Artifacts</h3>
            <p className="mt-1 text-xs text-muted-foreground">{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} total</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading artifacts...</div>
        ) : artifacts.length === 0 ? (
          <div className="py-8 text-center">
            <FileArchive className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No artifacts yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Generate content in Studio to see artifacts here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Artifact</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">MIME</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Download</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.04]">
                    <td className="px-3 py-2">
                      {IMAGE_MIME_TYPES.has(a.mimeType) && a.status === 'completed' ? (
                        previewUrls[a.id] ? (
                          <img src={previewUrls[a.id]} alt={a.title || 'Artifact preview'} className="h-14 w-14 rounded-md border border-white/[0.06] object-cover" />
                        ) : previewErrors[a.id] ? (
                          <span className="text-[10px] text-rose-300">{previewErrors[a.id]}</span>
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{a.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{a.type}</td>
                    <td className="px-3 py-2">{a.provider || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_COLORS[a.status] ?? 'border-white/10 text-[9px]'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{a.mimeType || '—'}</td>
                    <td className="px-3 py-2">{a.fileSizeBytes ? `${(a.fileSizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2">
                      {a.downloadable ? (
                        <Button type="button" onClick={() => downloadArtifact(a)} variant="outline" size="sm" className="border-white/10 text-xs">
                          <Download className="h-3 w-3" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {downloadError && <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/[0.04] px-3 py-2 text-xs text-rose-200">{downloadError}</div>}
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Admin diagnostics</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                <div className="font-semibold mb-1">Artifact API</div>
                <div>Admin artifact listing at /api/admin/artifacts. Authorized file preview/download uses /api/admin/artifacts/:id/file.</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
