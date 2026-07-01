'use client'
import { useState } from 'react'
import { fetchJSON } from '@/lib/fetchJSON'
import { PageTransition, PageHeader, Field, DropZone } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Info, Sparkles, MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database } from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

function RunBar({ type, payload, disabled }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await fetchJSON('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: type, payload: payload() }) })
      toast.success('Job enqueued (Mock)', { description: `${type} · track it in Jobs & Artifacts` })
    } catch (e) { toast.error('Failed to enqueue') }
    setBusy(false)
  }
  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
      <span className="text-xs text-muted-foreground">Executes as a background job in mock mode.</span>
      <div className="transition-transform duration-200 hover:scale-105 active:scale-95">
        <Button onClick={run} disabled={disabled || busy} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Sparkles className="mr-1.5 h-4 w-4" /> Run (Mock)
        </Button>
      </div>
    </div>
  )
}

function Bench({ children }) {
  return <div className="animate-fade-up space-y-5">{children}</div>
}

export default function Studio() {
  // shared local state per bench
  const [prompt, setPrompt] = useState('')
  const [system, setSystem] = useState('')
  const [reasoning, setReasoning] = useState(false)
  const [temp, setTemp] = useState([0.7])
  const [aspect, setAspect] = useState('1:1')
  const [quality, setQuality] = useState('standard')
  const [dim, setDim] = useState([1024])
  const [fps, setFps] = useState('24')
  const [duration, setDuration] = useState([6])
  const [genres, setGenres] = useState({})
  const [tempo, setTempo] = useState([120])
  const [ttsText, setTtsText] = useState('')
  const [gesture, setGesture] = useState([50])
  const [url, setUrl] = useState('')
  const [depth, setDepth] = useState([2])
  const [chunk, setChunk] = useState([800])

  const TABS = [
    { v: 'chat', label: 'Chat/Text', icon: MessageSquare },
    { v: 'image', label: 'Image', icon: ImageIcon },
    { v: 'video', label: 'Video', icon: Video },
    { v: 'longvideo', label: 'Long-form', icon: Film },
    { v: 'music', label: 'Music', icon: Music },
    { v: 'voice', label: 'Voice', icon: Mic },
    { v: 'avatar', label: 'Avatar', icon: User },
    { v: 'scrape', label: 'Scrape/Brand', icon: Globe },
    { v: 'rag', label: 'RAG', icon: Database },
  ]

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Studio" subtitle="Unified testing environment — nine specialized capability workbenches." />
      <Tabs defaultValue="chat" className="w-full">
        <div className="overflow-x-auto hide-scrollbar">
          <TabsList className="flex w-max gap-1 bg-white/[0.03] p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="gap-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* 1. Chat */}
        <TabsContent value="chat" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="System guide"><Textarea value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful enterprise assistant…" className="min-h-[120px] bg-black/20" /></Field>
              <Field label="Mode"><Select defaultValue="balanced"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fast">Fast</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="deep">Deep reasoning</SelectItem></SelectContent></Select>
                <div className="mt-4 flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5"><span className="text-sm">Reasoning tokens</span><Switch checked={reasoning} onCheckedChange={setReasoning} /></div>
                <div className="mt-4"><Field label={`Temperature — ${temp[0].toFixed(2)}`}><Slider value={temp} onValueChange={setTemp} min={0} max={2} step={0.05} /></Field></div>
              </Field>
            </div>
            <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything…" className="min-h-[100px] bg-black/20" /></Field>
            <RunBar type="text.chat" payload={() => ({ prompt, system, reasoning, temperature: temp[0] })} />
          </Bench></Card>
        </TabsContent>

        {/* 2. Image */}
        <TabsContent value="image" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A cinematic obsidian data center…" className="min-h-[100px] bg-black/20" /></Field>
                <Field label="Aspect ratio">
                  <div className="grid grid-cols-4 gap-2">{['1:1', '16:9', '9:16', '4:3'].map((a) => (<button key={a} onClick={() => setAspect(a)} className={`rounded-md border px-2 py-2 text-sm transition ${aspect === a ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground hover:text-foreground'}`}>{a}</button>))}</div>
                </Field>
              </div>
              <div className="space-y-5">
                <Field label={`Scale — ${dim[0]}px`}><Slider value={dim} onValueChange={setDim} min={512} max={2048} step={128} /></Field>
                <Field label="Quality"><Select value={quality} onValueChange={setQuality}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="ultra">Ultra</SelectItem></SelectContent></Select></Field>
                <Field label="Reference image"><DropZone label="Drop a reference image" kind="image" /></Field>
              </div>
            </div>
            <RunBar type="image.generate" payload={() => ({ prompt, aspect, quality, width: dim[0] })} />
          </Bench></Card>
        </TabsContent>

        {/* 3. Video */}
        <TabsContent value="video" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Prompt vector"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Slow dolly across neon skyline…" className="min-h-[100px] bg-black/20" /></Field>
              <div className="space-y-5">
                <Field label="Target movement"><Select defaultValue="dolly"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="static">Static</SelectItem><SelectItem value="pan">Pan</SelectItem><SelectItem value="dolly">Dolly</SelectItem><SelectItem value="orbit">Orbit</SelectItem></SelectContent></Select></Field>
                <Field label="Frames per second"><div className="grid grid-cols-3 gap-2">{['24', '30', '60'].map((f) => (<button key={f} onClick={() => setFps(f)} className={`rounded-md border px-2 py-2 text-sm transition ${fps === f ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>{f} fps</button>))}</div></Field>
                <Field label={`Duration — ${duration[0]}s`}><Slider value={duration} onValueChange={setDuration} min={2} max={20} step={1} /></Field>
              </div>
            </div>
            <RunBar type="video.generate" payload={() => ({ prompt, fps, duration: duration[0] })} />
          </Bench></Card>
        </TabsContent>

        {/* 4. Long-form video */}
        <TabsContent value="longvideo" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <Field label="Multiscene storyboard timeline">
              <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {[1, 2, 3, 4].map((s) => (
                  <div key={s} className="w-56 shrink-0 rounded-lg border border-white/[0.08] bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Scene {s}</span><Badge variant="outline" className="border-white/10 text-[10px]">{s * 5}s</Badge></div>
                    <div className="mb-2 aspect-video rounded-md bg-gradient-to-br from-cyan-500/15 to-violet-500/15" />
                    <Textarea placeholder={`Scene ${s} description…`} className="min-h-[60px] bg-black/20 text-xs" />
                  </div>
                ))}
                <button className="flex w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/12 text-sm text-muted-foreground hover:border-cyan-500/40 hover:text-cyan-200">+ Add scene</button>
              </div>
            </Field>
            <RunBar type="video.longform" payload={() => ({ scenes: 4 })} />
          </Bench></Card>
        </TabsContent>

        {/* 5. Music */}
        <TabsContent value="music" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <Field label="Genre matrix (tap to weight)">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {MUSIC_GENRES.map((g) => {
                  const w = genres[g] || 0
                  return (
                    <button key={g} onClick={() => setGenres((p) => ({ ...p, [g]: ((p[g] || 0) + 1) % 4 }))}
                      className={`rounded-md border px-2 py-2.5 text-xs transition ${w > 0 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>
                      {g}{w > 0 && <span className="ml-1 font-mono">{'★'.repeat(w)}</span>}
                    </button>
                  )
                })}
              </div>
            </Field>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label={`Tempo — ${tempo[0]} BPM`}><Slider value={tempo} onValueChange={setTempo} min={60} max={200} step={1} /></Field>
              <Field label="Arrangement"><Select defaultValue="verse-chorus"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="verse-chorus">Verse / Chorus</SelectItem><SelectItem value="loop">Loop</SelectItem><SelectItem value="progressive">Progressive build</SelectItem></SelectContent></Select></Field>
            </div>
            <RunBar type="music.generate" payload={() => ({ genres: Object.keys(genres).filter((k) => genres[k] > 0), tempo: tempo[0] })} />
          </Bench></Card>
        </TabsContent>

        {/* 6. Voice */}
        <TabsContent value="voice" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/90">
              <Info className="mt-0.5 h-4 w-4 shrink-0" /> Groq inputs over 200 characters will be safely auto-segmented and stitched back together in background tasks.
            </div>
            <Tabs defaultValue="tts">
              <TabsList className="bg-white/[0.03]"><TabsTrigger value="tts">TTS</TabsTrigger><TabsTrigger value="stt">STT</TabsTrigger></TabsList>
              <TabsContent value="tts" className="mt-4 space-y-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <Field label="Voice"><Select defaultValue="nova"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nova">Nova</SelectItem><SelectItem value="onyx">Onyx</SelectItem><SelectItem value="aria">Aria</SelectItem></SelectContent></Select></Field>
                  <Field label="Speed"><Slider defaultValue={[1]} min={0.5} max={2} step={0.1} /></Field>
                </div>
                <Field label="Text" hint={`${ttsText.length} chars`}><Textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Text to synthesize…" className="min-h-[120px] bg-black/20" /></Field>
                <RunBar type="voice.tts" payload={() => ({ text: ttsText })} />
              </TabsContent>
              <TabsContent value="stt" className="mt-4 space-y-5">
                <Field label="Audio input"><DropZone label="Drop an audio file to transcribe" kind="audio" /></Field>
                <RunBar type="voice.stt" payload={() => ({ audioId: 'mock-audio' })} />
              </TabsContent>
            </Tabs>
          </Bench></Card>
        </TabsContent>

        {/* 7. Avatar */}
        <TabsContent value="avatar" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <Field label="Profile library">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{['Ava', 'Kai', 'Mara', 'Leo', 'Zoe', 'Rex'].map((n, i) => (<button key={n} className={`rounded-lg border p-2 text-center transition ${i === 0 ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}><div className="mx-auto mb-1 h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30" /><span className="text-xs">{n}</span></button>))}</div>
            </Field>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label={`Gesture density — ${gesture[0]}%`}><Slider value={gesture} onValueChange={setGesture} min={0} max={100} step={1} /></Field>
              <Field label="Framing"><Select defaultValue="medium"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="close">Close-up</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="wide">Wide</SelectItem></SelectContent></Select></Field>
            </div>
            <RunBar type="avatar.generate" payload={() => ({ gesture: gesture[0] })} />
          </Bench></Card>
        </TabsContent>

        {/* 8. Scrape */}
        <TabsContent value="scrape" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <Field label="Target URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://brand.example.com" className="bg-black/20" /></Field>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label={`Extraction depth — ${depth[0]}`}><Slider value={depth} onValueChange={setDepth} min={1} max={5} step={1} /></Field>
              <Field label="Element flags"><div className="flex flex-wrap gap-2">{['Text', 'Images', 'Links', 'Metadata', 'Colors', 'Fonts'].map((el) => (<label key={el} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm"><Switch defaultChecked={['Text', 'Images'].includes(el)} /> {el}</label>))}</div></Field>
            </div>
            <RunBar type="scrape.crawl" payload={() => ({ url, depth: depth[0] })} disabled={!url} />
          </Bench></Card>
        </TabsContent>

        {/* 9. RAG */}
        <TabsContent value="rag" className="mt-6">
          <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
            <Field label="Knowledge files"><DropZone label="Drop PDFs, docs, or text files" kind="documents" /></Field>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label={`Chunk size — ${chunk[0]} tokens`}><Slider value={chunk} onValueChange={setChunk} min={200} max={2000} step={100} /></Field>
              <Field label="Overlap"><Select defaultValue="10"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem><SelectItem value="10">10%</SelectItem><SelectItem value="20">20%</SelectItem></SelectContent></Select></Field>
            </div>
            <RunBar type="rag.ingest" payload={() => ({ chunkSize: chunk[0] })} />
          </Bench></Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
