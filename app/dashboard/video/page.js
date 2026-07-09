'use client'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Video, Zap, AlertTriangle, Clock, Film } from 'lucide-react'

export default function VideoStudioPage() {
  const [mode, setMode] = useState('short')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Video Studio" subtitle="Create short-form and long-form video content. Short video is wired through the existing worker flow." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('short')}
                className={`rounded-md border px-4 py-2 text-xs transition ${mode === 'short' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
              >
                <Film className="mr-1.5 inline h-3 w-3" /> Short Video
              </button>
              <button
                onClick={() => setMode('long')}
                className={`rounded-md border px-4 py-2 text-xs transition ${mode === 'long' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
              >
                <Clock className="mr-1.5 inline h-3 w-3" /> Long-Form Video
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Scene / Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video scene or idea..."
              className="min-h-[80px] bg-white/[0.04] text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Duration target</label>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={mode === 'short' ? 'e.g. 5s, 10s' : 'e.g. 30s, 60s, 5min'}
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Auto mode
            </Badge>
            <span className="text-[10px] text-muted-foreground">Runtime selects provider and model</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold">Storyboard / Scene Outline</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Scene outline will appear here</p>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold">Render Status</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Render progress will appear here</p>
          </div>
        </Card>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Video className="h-4 w-4 text-cyan-300" /> Artifacts</h3>
        <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
          <p className="text-xs text-muted-foreground">Generated video artifacts will appear here</p>
        </div>
      </Card>

      {mode === 'long' && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Backend Pending
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Long-form video generation (storyboard, stitching, multi-scene) is not yet wired to a backend endpoint. Short video via GenX proven flow is available through Studio.
          </p>
        </div>
      )}

      {mode === 'short' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <Video className="h-3.5 w-3.5" /> Live
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Short video generation is wired through the proven GenX video_generation backend flow. Submit via Studio for live execution.
          </p>
        </div>
      )}
    </PageTransition>
  )
}
