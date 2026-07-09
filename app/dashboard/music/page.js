'use client'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Music, AlertTriangle, Zap } from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [genre, setGenre] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [lyrics, setLyrics] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Music Studio" subtitle="Create music from prompts. Backend music generation endpoint is pending." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Song prompt</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the song you want to create..."
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Style / Genre</label>
            <div className="flex flex-wrap gap-2">
              {MUSIC_GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${genre === g ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs">Instrumental</span>
            <Switch checked={instrumental} onCheckedChange={setInstrumental} />
          </div>

          {!instrumental && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">Lyrics</label>
              <Textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Enter lyrics or let the backend generate them..."
                className="min-h-[80px] bg-white/[0.04] text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
              <Zap className="mr-1 h-2.5 w-2.5" /> Auto mode
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold">Remix / Variations / Extend</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Remix and variation controls pending backend support</p>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music className="h-4 w-4 text-cyan-300" /> Player / Output</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Generated audio will appear here</p>
          </div>
        </Card>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Backend Pending
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Music generation backend is not yet wired. No audio is being generated. This UI is a placeholder for when the music_generation capability is connected.
        </p>
      </div>
    </PageTransition>
  )
}
