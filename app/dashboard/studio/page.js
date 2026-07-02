'use client'
import { useState, useRef, useEffect } from 'react'
import { fetchJSON } from '@/lib/fetchJSON'
import { PageTransition, PageHeader, Field, DropZone } from '@/components/amarkt/kit'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import AssetLibraryDrawer from '@/components/amarkt/AssetLibraryDrawer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Info, Sparkles, MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Play, Pause, Plus, Trash2, ChevronRight, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Eye, EyeOff, Wand2, ArrowUpCircle,
  Package, Sliders
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

// ─── RunBar ───────────────────────────────────────────────────
function RunBar({ type, payload, disabled, onRun }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      if (onRun) { onRun() }
      else {
        await fetchJSON('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: type, payload: payload() }) })
        toast.success('Job enqueued', { description: `${type} · track in Proof Runner` })
      }
    } catch { toast.error('Failed to enqueue') }
    setBusy(false)
  }
  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
      <span className="text-xs text-muted-foreground">Executes as a background job.</span>
      <div className="transition-transform duration-200 hover:scale-105 active:scale-95">
        <Button onClick={run} disabled={disabled || busy} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Sparkles className="mr-1.5 h-4 w-4" /> Execute
        </Button>
      </div>
    </div>
  )
}

function Bench({ children }) { return <div className="animate-fade-up space-y-5">{children}</div> }

// ─── Scene Card (Long-form Video) ─────────────────────────────
function SceneCard({ scene, index, onUpdate, onRemove }) {
  return (
    <div className="w-64 shrink-0 rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Scene {index + 1}</span>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="border-white/10 text-[10px]">{scene.duration}s</Badge>
          <button onClick={onRemove} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="aspect-video rounded-md bg-gradient-to-br from-cyan-500/15 to-violet-500/15" />
      <Textarea value={scene.prompt} onChange={(e) => onUpdate({ ...scene, prompt: e.target.value })} placeholder={`Scene ${index + 1} description…`} className="min-h-[60px] bg-black/20 text-xs" />
      <Field label={`Duration — ${scene.duration}s`}><Slider value={[scene.duration]} onValueChange={([v]) => onUpdate({ ...scene, duration: v })} min={1} max={30} step={1} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Voiceover"><Select value={scene.voiceover} onValueChange={(v) => onUpdate({ ...scene, voiceover: v })}><SelectTrigger className="bg-black/20 text-xs h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="ai">AI Voice</SelectItem></SelectContent></Select></Field>
        <Field label="Music"><Select value={scene.music} onValueChange={(v) => onUpdate({ ...scene, music: v })}><SelectTrigger className="bg-black/20 text-xs h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="ambient">Ambient</SelectItem><SelectItem value="cinematic">Cinematic</SelectItem><SelectItem value="upbeat">Upbeat</SelectItem></SelectContent></Select></Field>
      </div>
    </div>
  )
}

// ─── Director Chat (Right Panel) ──────────────────────────────
function DirectorChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Welcome to the Studio Director. I can help you plan and execute multi-step creative workflows.\n\n**Available capabilities:**\n- Text generation & reasoning\n- Image creation & editing\n- Video production\n- Music composition\n- Voice synthesis\n- Brand intelligence\n\nDescribe what you want to create and I\'ll build an execution plan.' }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])

  const send = () => {
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages((p) => [...p, userMsg])
    setInput('')
    setStreaming(true)
    // Simulate streaming response
    const fullResponse = `I'll help you with that. Let me analyze your request and create an execution plan.\n\n**Step 1:** Analyze input requirements\n**Step 2:** Select optimal providers\n**Step 3:** Execute pipeline\n\nReady to proceed?`
    let idx = 0
    const interval = setInterval(() => {
      idx += 3
      if (idx >= fullResponse.length) {
        clearInterval(interval)
        setMessages((p) => [...p.slice(0, -1), { role: 'assistant', content: fullResponse }])
        setStreaming(false)
      } else {
        setMessages((p) => {
          const withoutPlaceholder = p.filter((m) => m.role !== 'streaming')
          return [...withoutPlaceholder, { role: 'streaming', content: fullResponse.slice(0, idx) }]
        })
      }
    }, 20)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Director</span>
        <Badge variant="outline" className="border-cyan-500/30 text-[10px] text-cyan-300">AI Assistant</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-8 bg-cyan-500/10 text-cyan-100' : 'mr-8 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{m.content}{m.role === 'streaming' && <span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" />}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2">
          <button className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Voice input"><MicIcon className="h-4 w-4" /></button>
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Describe your creative task…" className="bg-black/20 flex-1" />
          <Button onClick={send} size="sm" className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/10 text-xs"><Wand2 className="mr-1 h-3 w-3" /> Execute Plan</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Timeline (Bottom Panel) ──────────────────────────────────
function Timeline() {
  const tracks = [
    { id: 'video', label: 'Video', color: 'cyan', clips: [{ start: 0, width: 40, label: 'Scene 1' }, { start: 42, width: 30, label: 'Scene 2' }] },
    { id: 'voice', label: 'Voice', color: 'violet', clips: [{ start: 5, width: 35, label: 'VO Track' }] },
    { id: 'music', label: 'Music', color: 'amber', clips: [{ start: 0, width: 72, label: 'BGM' }] },
    { id: 'captions', label: 'Captions', color: 'emerald', clips: [{ start: 2, width: 20, label: 'Sub 1' }, { start: 28, width: 25, label: 'Sub 2' }] },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"><Play className="h-3 w-3" /></Button>
          <span className="text-[10px] text-muted-foreground font-mono">00:00 / 00:15</span>
        </div>
      </div>
      <div className="p-2 space-y-1">
        {tracks.map((track) => (
          <div key={track.id} className="flex items-center gap-2">
            <div className="w-16 shrink-0 flex items-center gap-1">
              <GripVertical className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground truncate">{track.label}</span>
            </div>
            <div className="relative h-8 flex-1 rounded bg-white/[0.02] border border-white/[0.04]">
              {track.clips.map((clip, i) => (
                <div key={i} className={`absolute top-1 bottom-1 rounded bg-${track.color}-500/20 border border-${track.color}-500/30 flex items-center px-1.5 cursor-grab`}
                  style={{ left: `${clip.start}%`, width: `${clip.width}%` }}>
                  <span className="text-[9px] text-foreground/70 truncate">{clip.label}</span>
                  <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 rounded-l" />
                  <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 rounded-r" />
                </div>
              ))}
            </div>
            <div className="w-8 flex items-center justify-center">
              <Volume2 className="h-3 w-3 text-muted-foreground/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Node Canvas (Left Panel) ─────────────────────────────────
function NodeCanvas() {
  const nodes = [
    { id: 'chat', label: 'Chat/Text', icon: MessageSquare, status: 'idle' },
    { id: 'image', label: 'Image', icon: ImageIcon, status: 'idle' },
    { id: 'video', label: 'Video', icon: Video, status: 'idle' },
    { id: 'longvideo', label: 'Long-form', icon: Film, status: 'idle' },
    { id: 'music', label: 'Music', icon: Music, status: 'idle' },
    { id: 'voice', label: 'Voice', icon: Mic, status: 'idle' },
    { id: 'avatar', label: 'Avatar', icon: User, status: 'idle' },
    { id: 'scrape', label: 'Scrape', icon: Globe, status: 'idle' },
    { id: 'rag', label: 'RAG', icon: Database, status: 'idle' },
  ]

  const statusColors = {
    idle: 'bg-white/5 text-muted-foreground border-white/10',
    processing: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 animate-pulse',
    complete: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  }

  return (
    <div className="h-full overflow-auto p-3 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Capability Nodes</span>
      </div>
      {nodes.map((node) => {
        const Icon = node.icon
        const status = statusColors[node.status]
        return (
          <div key={node.id} className={`flex items-center gap-3 rounded-lg border p-3 transition hover:border-white/20 ${status}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{node.label}</div>
              <div className="text-[10px] opacity-60 capitalize">{node.status}</div>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0"><Play className="h-3 w-3" /></Button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Studio Tab Schemas ────────────────────────────────────────
const CHAT_SCHEMA = {
  jsonMode: { type: 'boolean', label: 'JSON mode output' },
  reasoning: { type: 'boolean', label: 'Reasoning tokens' },
  webSearch: { type: 'boolean', label: 'Web search enabled' },
  ragToggle: { type: 'boolean', label: 'RAG context injection' },
  forbiddenWords: { type: 'string', label: 'Forbidden words', multiline: true, placeholder: 'Enter words to exclude, one per line…' },
}

const IMAGE_SCHEMA = {
  negativePrompt: { type: 'string', label: 'Negative prompt', multiline: true, placeholder: 'Elements to exclude…' },
  seed: { type: 'number', label: 'Seed (0 = random)', min: 0, max: 999999, step: 1 },
  cfgScale: { type: 'number', label: 'CFG Scale', min: 1, max: 20, step: 0.5, unit: '', showRange: true },
  brandPaletteLock: { type: 'boolean', label: 'Brand palette lock' },
  backgroundRemove: { type: 'boolean', label: 'Remove background' },
  upscale: { type: 'enum', label: 'Upscale', options: ['none', '2x', '4x'] },
}

const VIDEO_SCHEMA = {
  mode: { type: 'enum', label: 'Generation mode', options: ['text-to-video', 'image-to-video', 'video-to-video'] },
  cameraMovement: { type: 'enum', label: 'Camera movement', options: ['static', 'pan', 'dolly', 'orbit', 'crane', 'tracking'] },
  lensType: { type: 'enum', label: 'Lens type', options: ['wide', 'standard', 'telephoto', 'fisheye', 'macro'] },
  motionStrength: { type: 'number', label: 'Motion strength', min: 0, max: 100, step: 1, unit: '%' },
  ctaEndCard: { type: 'boolean', label: 'CTA end card overlay' },
}

const MUSIC_SCHEMA = {
  genres: { type: 'matrix', label: 'Genre matrix', options: MUSIC_GENRES, maxWeight: 3 },
  bpm: { type: 'number', label: 'BPM / Tempo', min: 60, max: 200, step: 1, unit: 'BPM' },
  keyScale: { type: 'enum', label: 'Key / Scale', options: ['C Major', 'C Minor', 'D Major', 'D Minor', 'E Major', 'E Minor', 'F Major', 'F Minor', 'G Major', 'G Minor', 'A Major', 'A Minor', 'B Major', 'B Minor'] },
  songStructure: { type: 'enum', label: 'Song structure', options: ['intro-verse-chorus-bridge-outro', 'verse-chorus-verse-chorus', 'aaba', 'through-composed', 'loop'] },
  hookFirst: { type: 'boolean', label: 'Hook-first arrangement' },
  referenceTrack: { type: 'file', label: 'Reference track', accept: 'audio', dropLabel: 'Drop reference audio' },
}

const VOICE_SCHEMA = {
  ssml: { type: 'boolean', label: 'SSML markup mode' },
  diarization: { type: 'boolean', label: 'Speaker diarization' },
  noiseReduction: { type: 'boolean', label: 'Noise reduction' },
  pronunciationDict: { type: 'string', label: 'Pronunciation dictionary', multiline: true, placeholder: 'word=pronunciation, one per line…' },
}

const AVATAR_SCHEMA = {
  emotionalArc: { type: 'string', label: 'Emotional arc notes', multiline: true, placeholder: 'Describe the emotional progression…' },
  approvalRequired: { type: 'boolean', label: 'Approval required before publish' },
}

const SCRAPE_SCHEMA = {
  renderJs: { type: 'boolean', label: 'Render JavaScript' },
  extract: { type: 'checkboxgrid', label: 'Extract elements', options: ['Logo', 'Colors', 'Fonts', 'Pricing', 'Team', 'Contact', 'Social Links', 'Testimonials', 'Products', 'Services', 'FAQ', 'Metadata'] },
}

const RAG_SCHEMA = {
  topK: { type: 'number', label: 'Top-K results', min: 1, max: 20, step: 1 },
  rerank: { type: 'boolean', label: 'Rerank results' },
  confidenceThreshold: { type: 'number', label: 'Confidence threshold', min: 0, max: 1, step: 0.05 },
}

// ─── Main Studio Page ──────────────────────────────────────────
export default function Studio() {
  // Core state
  const [prompt, setPrompt] = useState('')
  const [system, setSystem] = useState('')
  const [aspect, setAspect] = useState('1:1')
  const [quality, setQuality] = useState('standard')
  const [dim, setDim] = useState([1024])
  const [fps, setFps] = useState('24')
  const [duration, setDuration] = useState([6])
  const [ttsText, setTtsText] = useState('')
  const [url, setUrl] = useState('')
  const [chunk, setChunk] = useState([800])
  const [overlap, setOverlap] = useState('10')
  const [gesture, setGesture] = useState([50])
  const [temp, setTemp] = useState([0.7])
  const [voice, setVoice] = useState('nova')
  const [speed, setSpeed] = useState([1])
  const [crawlDepth, setCrawlDepth] = useState([2])

  // Dynamic form state per tab
  const [chatValues, setChatValues] = useState({ jsonMode: false, reasoning: false, webSearch: false, ragToggle: false, forbiddenWords: '' })
  const [imageValues, setImageValues] = useState({ negativePrompt: '', seed: 0, cfgScale: 7, brandPaletteLock: false, backgroundRemove: false, upscale: 'none' })
  const [videoValues, setVideoValues] = useState({ mode: 'text-to-video', cameraMovement: 'dolly', lensType: 'standard', motionStrength: 50, ctaEndCard: false })
  const [musicValues, setMusicValues] = useState({ genres: {}, bpm: 120, keyScale: 'C Major', songStructure: 'intro-verse-chorus-bridge-outro', hookFirst: false })
  const [voiceValues, setVoiceValues] = useState({ ssml: false, diarization: false, noiseReduction: false, pronunciationDict: '' })
  const [avatarValues, setAvatarValues] = useState({ emotionalArc: '', approvalRequired: false })
  const [scrapeValues, setScrapeValues] = useState({ renderJs: false, extract: ['Logo', 'Colors'] })
  const [ragValues, setRagValues] = useState({ topK: 5, rerank: true, confidenceThreshold: 0.7 })

  // Long-form scenes
  const [scenes, setScenes] = useState([
    { prompt: '', duration: 5, voiceover: 'none', music: 'ambient' },
    { prompt: '', duration: 5, voiceover: 'none', music: 'ambient' },
    { prompt: '', duration: 5, voiceover: 'none', music: 'ambient' },
  ])

  // UI state
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)

  const addScene = () => setScenes((p) => [...p, { prompt: '', duration: 5, voiceover: 'none', music: 'ambient' }])
  const removeScene = (i) => setScenes((p) => p.filter((_, idx) => idx !== i))
  const updateScene = (i, data) => setScenes((p) => p.map((s, idx) => idx === i ? data : s))

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
    <PageTransition className="space-y-4">
      {/* Header with panel toggles */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Studio" subtitle="Unified testing environment — nine specialized capability workbenches." />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setLeftPanelOpen(!leftPanelOpen)} className={`border-white/10 ${leftPanelOpen ? 'bg-white/10' : ''}`}><PanelLeftOpen className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setBottomPanelOpen(!bottomPanelOpen)} className={`border-white/10 ${bottomPanelOpen ? 'bg-white/10' : ''}`}><Layers className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className={`border-white/10 ${rightPanelOpen ? 'bg-white/10' : ''}`}><PanelRightOpen className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAssetDrawerOpen(!assetDrawerOpen)} className={`border-white/10 ${assetDrawerOpen ? 'bg-white/10' : ''}`}><Package className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex gap-2" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {/* Left Panel — Node Canvas */}
        {leftPanelOpen && (
          <div className="w-56 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden">
            <NodeCanvas />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <Tabs defaultValue="chat" className="flex-1">
            <div className="overflow-x-auto hide-scrollbar">
              <TabsList className="flex w-max gap-1 bg-white/[0.03] p-1">
                {TABS.map((t) => (
                  <TabsTrigger key={t.v} value={t.v} className="gap-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground">
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ── 1. Chat/Text ── */}
            <TabsContent value="chat" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label="System guide"><Textarea value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful enterprise assistant…" className="min-h-[120px] bg-black/20" /></Field>
                    <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything…" className="min-h-[100px] bg-black/20" /></Field>
                  </div>
                  <div className="space-y-5">
                    <Field label="Mode"><Select defaultValue="balanced"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fast">Fast</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="deep">Deep reasoning</SelectItem></SelectContent></Select></Field>
                    <Field label={`Temperature — ${temp[0].toFixed(2)}`}><Slider value={temp} onValueChange={setTemp} min={0} max={2} step={0.05} /></Field>
                    <DynamicFormRenderer schema={CHAT_SCHEMA} values={chatValues} onChange={setChatValues} />
                  </div>
                </div>
                <RunBar type="text.chat" payload={() => ({ prompt, system, temperature: temp[0], ...chatValues })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 2. Image ── */}
            <TabsContent value="image" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A cinematic obsidian data center…" className="min-h-[100px] bg-black/20" /></Field>
                    <Field label="Aspect ratio">
                      <div className="grid grid-cols-4 gap-2">{['1:1', '16:9', '9:16', '4:3'].map((a) => (<button key={a} onClick={() => setAspect(a)} className={`rounded-md border px-2 py-2 text-sm transition ${aspect === a ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground hover:text-foreground'}`}>{a}</button>))}</div>
                    </Field>
                    <Field label={`Scale — ${dim[0]}px`}><Slider value={dim} onValueChange={setDim} min={512} max={2048} step={128} /></Field>
                    <Field label="Quality"><Select value={quality} onValueChange={setQuality}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="ultra">Ultra</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="space-y-5">
                    <DynamicFormRenderer schema={IMAGE_SCHEMA} values={imageValues} onChange={setImageValues} />
                    <Field label="Reference image"><DropZone label="Drop a reference image" kind="image" /></Field>
                  </div>
                </div>
                <RunBar type="image.generate" payload={() => ({ prompt, aspect, quality, width: dim[0], ...imageValues })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 3. Video ── */}
            <TabsContent value="video" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label="Prompt vector"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Slow dolly across neon skyline…" className="min-h-[100px] bg-black/20" /></Field>
                    <Field label="Frames per second"><div className="grid grid-cols-3 gap-2">{['24', '30', '60'].map((f) => (<button key={f} onClick={() => setFps(f)} className={`rounded-md border px-2 py-2 text-sm transition ${fps === f ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>{f} fps</button>))}</div></Field>
                    <Field label={`Duration — ${duration[0]}s`}><Slider value={duration} onValueChange={setDuration} min={2} max={20} step={1} /></Field>
                  </div>
                  <div className="space-y-5">
                    <DynamicFormRenderer schema={VIDEO_SCHEMA} values={videoValues} onChange={setVideoValues} />
                  </div>
                </div>
                <RunBar type="video.generate" payload={() => ({ prompt, fps, duration: duration[0], ...videoValues })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 4. Long-form Video (Storyboard) ── */}
            <TabsContent value="longvideo" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <Field label="Scene Storyboard">
                  <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                    {scenes.map((scene, i) => <SceneCard key={i} scene={scene} index={i} onUpdate={(d) => updateScene(i, d)} onRemove={() => removeScene(i)} />)}
                    <button onClick={addScene} className="flex w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/12 text-sm text-muted-foreground hover:border-cyan-500/40 hover:text-cyan-200 gap-1"><Plus className="h-4 w-4" /> Add scene</button>
                  </div>
                </Field>
                <RunBar type="video.longform" payload={() => ({ scenes })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 5. Music ── */}
            <TabsContent value="music" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <DynamicFormRenderer schema={MUSIC_SCHEMA} values={musicValues} onChange={setMusicValues} />
                <RunBar type="music.generate" payload={() => ({ ...musicValues, genres: Object.keys(musicValues.genres || {}).filter((k) => musicValues.genres[k] > 0) })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 6. Voice ── */}
            <TabsContent value="voice" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/90">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" /> Groq inputs over 200 characters will be safely auto-segmented and stitched back together.
                </div>
                <Tabs defaultValue="tts">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="tts">TTS</TabsTrigger><TabsTrigger value="stt">STT</TabsTrigger></TabsList>
                  <TabsContent value="tts" className="mt-4 space-y-5">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <Field label="Voice"><Select value={voice} onValueChange={setVoice}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nova">Nova</SelectItem><SelectItem value="onyx">Onyx</SelectItem><SelectItem value="aria">Aria</SelectItem><SelectItem value="tara">Tara</SelectItem></SelectContent></Select></Field>
                      <Field label={`Speed — ${speed[0].toFixed(1)}x`}><Slider value={speed} onValueChange={setSpeed} min={0.5} max={2} step={0.1} /></Field>
                    </div>
                    <Field label="Text" hint={`${ttsText.length} chars`}><Textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Text to synthesize…" className="min-h-[120px] bg-black/20" /></Field>
                    <DynamicFormRenderer schema={VOICE_SCHEMA} values={voiceValues} onChange={setVoiceValues} />
                    <RunBar type="voice.tts" payload={() => ({ text: ttsText, voice, speed: speed[0], ...voiceValues })} />
                  </TabsContent>
                  <TabsContent value="stt" className="mt-4 space-y-5">
                    <Field label="Audio input"><DropZone label="Drop an audio file to transcribe" kind="audio" /></Field>
                    <DynamicFormRenderer schema={VOICE_SCHEMA} values={voiceValues} onChange={setVoiceValues} />
                    <RunBar type="voice.stt" payload={() => ({ audioId: 'mock-audio', ...voiceValues })} />
                  </TabsContent>
                </Tabs>
              </Bench></Card>
            </TabsContent>

            {/* ── 7. Avatar ── */}
            <TabsContent value="avatar" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <Field label="Profile library">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{['Ava', 'Kai', 'Mara', 'Leo', 'Zoe', 'Rex'].map((n, i) => (<button key={n} className={`rounded-lg border p-2 text-center transition ${i === 0 ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}><div className="mx-auto mb-1 h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30" /><span className="text-xs">{n}</span></button>))}</div>
                </Field>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label={`Gesture intensity — ${gesture[0]}%`}><Slider value={gesture} onValueChange={setGesture} min={0} max={100} step={1} /></Field>
                    <Field label="Framing"><Select defaultValue="medium"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="close">Close-up</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="wide">Wide</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="space-y-5">
                    <DynamicFormRenderer schema={AVATAR_SCHEMA} values={avatarValues} onChange={setAvatarValues} />
                  </div>
                </div>
                <RunBar type="avatar.generate" payload={() => ({ gesture: gesture[0], ...avatarValues })} />
              </Bench></Card>
            </TabsContent>

            {/* ── 8. Scrape/Brand ── */}
            <TabsContent value="scrape" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <Field label="Target URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://brand.example.com" className="bg-black/20" /></Field>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label={`Crawl depth — ${crawlDepth[0]}`}><Slider value={crawlDepth} onValueChange={setCrawlDepth} min={1} max={5} step={1} /></Field>
                    <DynamicFormRenderer schema={SCRAPE_SCHEMA} values={scrapeValues} onChange={setScrapeValues} />
                  </div>
                  <div className="space-y-5">
                    <Field label="Brand Pack preview">
                      <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 text-center text-sm text-muted-foreground">
                        <Globe className="mx-auto mb-2 h-8 w-8 opacity-30" />
                        Run the scrape to generate a Brand Pack preview
                      </div>
                    </Field>
                    <Button variant="outline" className="w-full border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"><Sparkles className="mr-2 h-4 w-4" /> Save as Brand Pack</Button>
                  </div>
                </div>
                <RunBar type="scrape.crawl" payload={() => ({ url, depth: crawlDepth[0], ...scrapeValues })} disabled={!url} />
              </Bench></Card>
            </TabsContent>

            {/* ── 9. RAG ── */}
            <TabsContent value="rag" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><Bench>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5">
                    <Field label="Knowledge files"><DropZone label="Drop PDFs, docs, or text files" kind="documents" /></Field>
                    <Field label={`Chunk size — ${chunk[0]} tokens`}><Slider value={chunk} onValueChange={setChunk} min={200} max={2000} step={100} /></Field>
                    <Field label={`Overlap — ${overlap}%`}><Select value={overlap} onValueChange={setOverlap}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem><SelectItem value="5">5%</SelectItem><SelectItem value="10">10%</SelectItem><SelectItem value="20">20%</SelectItem><SelectItem value="30">30%</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="space-y-5">
                    <DynamicFormRenderer schema={RAG_SCHEMA} values={ragValues} onChange={setRagValues} />
                  </div>
                </div>
                <RunBar type="rag.ingest" payload={() => ({ chunkSize: chunk[0], overlap, ...ragValues })} />
              </Bench></Card>
            </TabsContent>
          </Tabs>

          {/* Bottom Panel — Timeline */}
          {bottomPanelOpen && (
            <div className="h-48 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden">
              <Timeline />
            </div>
          )}
        </div>

        {/* Right Panel — Director Chat */}
        {rightPanelOpen && (
          <div className="w-80 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden">
            <DirectorChat />
          </div>
        )}
      </div>

      {/* Asset Library Drawer */}
      <AssetLibraryDrawer open={assetDrawerOpen} onClose={() => setAssetDrawerOpen(false)} />
    </PageTransition>
  )
}
