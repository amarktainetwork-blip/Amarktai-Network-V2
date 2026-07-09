'use client'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Music, AlertTriangle, Zap, Clock } from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'

const INSTRUMENTS = [
  'Drums', 'Bass', 'Electric Guitar', 'Acoustic Guitar', 'Piano', 'Strings',
]
const SONG_PARTS = ['Rap Verse', 'Chorus']
const EXPORT_FORMATS = ['MP3', 'WAV', 'FLAC']

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [selectedGenres, setSelectedGenres] = useState([])
  const [instrumental, setInstrumental] = useState(false)
  const [lyrics, setLyrics] = useState('')

  const toggleGenre = (g) => {
    if (selectedGenres.includes(g)) {
      setSelectedGenres(selectedGenres.filter((x) => x !== g))
    } else if (selectedGenres.length < 5) {
      setSelectedGenres([...selectedGenres, g])
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Music Studio" subtitle="Create music from prompts. All controls are design-ready but disabled until music_generation is wired." />

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Backend Pending
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Music generation backend is not yet wired. No audio is being generated. Controls are design-ready but disabled until music_generation is wired.
        </p>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music className="h-4 w-4 text-cyan-300" /> Create</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Song Prompt</label>
            <Input
              disabled
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the song you want to create..."
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs">Create Full Song</span>
              <Switch disabled checked={false} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">Instrumental</span>
              <Switch disabled checked={instrumental} onCheckedChange={setInstrumental} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Vocals</label>
            <Input disabled placeholder="Vocal style or singer reference" className="bg-white/[0.04] text-sm" />
          </div>

          {!instrumental && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">Lyrics</label>
              <Textarea
                disabled
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Enter lyrics or let the backend generate them..."
                className="min-h-[80px] bg-white/[0.04] text-sm"
              />
            </div>
          )}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Genre / Mood</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Genres (up to 5)</label>
            <div className="flex flex-wrap gap-2">
              {MUSIC_GENRES.map((g) => {
                const selected = selectedGenres.includes(g)
                return (
                  <button
                    key={g}
                    disabled
                    className={`rounded-md border px-3 py-1.5 text-xs transition cursor-not-allowed ${selected ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300/40' : 'border-white/[0.06] bg-black/20 text-muted-foreground/40'}`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Mood</label>
              <Input disabled placeholder="e.g. energetic, chill" className="bg-white/[0.04] text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">BPM</label>
              <Input disabled type="number" placeholder="120" className="bg-white/[0.04] text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Duration</label>
              <Input disabled placeholder="e.g. 3:30" className="bg-white/[0.04] text-sm" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Instruments</h3>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst}
              disabled
              className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
            >
              Add {inst}
            </button>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Song Parts</h3>
        <div className="flex flex-wrap gap-2">
          {SONG_PARTS.map((part) => (
            <button
              key={part}
              disabled
              className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
            >
              Add {part}
            </button>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Remix / Extend / Variation</h3>
        <div className="flex flex-wrap gap-2">
          {['Remix', 'Extend', 'Variation', 'Remove Vocals', 'Isolate Stems'].map((action) => (
            <button
              key={action}
              disabled
              className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
            >
              {action}
            </button>
          ))}
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-semibold">Reference & Export</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Reference Track Upload</label>
            <Input disabled placeholder="Pending" className="bg-white/[0.04] text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Export Formats</label>
            <div className="flex flex-wrap gap-2">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  disabled
                  className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed"
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music className="h-4 w-4 text-cyan-300" /> Player / Output</h3>
        <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
          <p className="text-xs text-muted-foreground">Generated audio will appear here</p>
        </div>
      </Card>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">
          Provider/model selection is handled by the platform runtime. No manual overrides are exposed in app-facing flows.
          External apps request music capabilities only — they never call providers directly.
        </p>
      </div>
    </PageTransition>
  )
}
