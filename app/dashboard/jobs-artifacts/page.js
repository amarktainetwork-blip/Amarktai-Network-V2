'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Trash2, Download, FileText, Music2, ImageIcon, Video } from 'lucide-react'

function ArtifactPreview({ art }) {
  const [md, setMd] = useState('')
  useEffect(() => {
    if (art.kind === 'markdown') fetch(art.retrievalPath).then((r) => r.text()).then(setMd).catch(() => {})
  }, [art])
  if (art.kind === 'image' || art.kind === 'video') {
    return (
      <div className="relative overflow-hidden rounded-lg border border-white/10">
        <img src={art.retrievalPath} alt="artifact" className="w-full" />
        {art.kind === 'video' && (<div className="absolute inset-0 flex items-center justify-center"><div className="rounded-full bg-black/50 p-3 backdrop-blur"><Video className="h-6 w-6 text-white" /></div></div>)}
      </div>
    )
  }
  if (art.kind === 'audio') {
    return <div className="rounded-lg border border-white/10 bg-black/30 p-4"><audio controls src={art.retrievalPath} className="w-full" /></div>
  }
  return <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-foreground/80 hide-scrollbar">{md || 'Loading…'}</pre>
}

const ICONS = { markdown: FileText, audio: Music2, image: ImageIcon, video: Video }

export default function JobsArtifacts() {
  const [jobs, setJobs] = useState([])
  const [artifacts, setArtifacts] = useState([])
  const load = async () => {
    const [j, a] = await Promise.all([
      fetch('/api/jobs').then((r) => r.json()),
      fetch('/api/artifacts').then((r) => r.json()),
    ])
    setJobs(j.jobs || [])
    setArtifacts(a.artifacts || [])
  }
  useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i) }, [])
  const remove = async (id) => { await fetch(`/api/jobs/${id}`, { method: 'DELETE' }); load() }

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Jobs & Artifacts" subtitle="Live background task queue on the left, generated media gallery on the right." />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Jobs */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Task Queue</h3><span className="text-xs text-muted-foreground">{jobs.length} tasks</span></div>
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1 hide-scrollbar">
            <AnimatePresence initial={false}>
              {jobs.length === 0 && <div className="text-sm text-muted-foreground">No jobs yet. Launch one from the Studio.</div>}
              {jobs.map((jb) => (
                <motion.div key={jb.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-white/[0.06] bg-black/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-xs text-cyan-200">{jb.type}</code>
                    <div className="flex items-center gap-2"><StatusPill status={jb.status} /><button onClick={() => remove(jb.id)} className="text-muted-foreground hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div>
                  </div>
                  <Progress value={jb.progress || 0} className="mt-3 h-1.5" />
                  <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>{jb.progress || 0}%</span><span>{new Date(jb.createdAt).toLocaleTimeString()}</span></div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>

        {/* Artifacts */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Media Gallery</h3><span className="text-xs text-muted-foreground">{artifacts.length} artifacts</span></div>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 hide-scrollbar">
            {artifacts.length === 0 && <div className="text-sm text-muted-foreground">Completed jobs will deliver artifacts here.</div>}
            {artifacts.map((art) => {
              const Icon = ICONS[art.kind] || FileText
              return (
                <motion.div key={art.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-violet-300" /><code className="font-mono text-xs text-foreground/80">{art.capability}</code></div>
                    <a href={art.retrievalPath} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-7 border-white/10 text-xs"><Download className="mr-1 h-3 w-3" />{art.format.toUpperCase()}</Button></a>
                  </div>
                  <ArtifactPreview art={art} />
                </motion.div>
              )
            })}
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
