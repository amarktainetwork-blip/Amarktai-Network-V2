'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/mockSchemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Sparkles, Loader2, Send, ChevronDown, Settings, X, Download,
  Image as ImageIcon2, Play, Zap,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Capability Modes ──────────────────────────────────────────
const MODES = [
  { v: 'chat', label: 'Chat', icon: MessageSquare, capability: 'text.chat' },
  { v: 'image', label: 'Image', icon: ImageIcon, capability: 'image.generate' },
  { v: 'video', label: 'Video', icon: Video, capability: 'video.generate' },
  { v: 'longvideo', label: 'Long-form', icon: Film, capability: 'video.longform' },
  { v: 'music', label: 'Music', icon: Music, capability: 'music.generate' },
  { v: 'voice', label: 'Voice', icon: Mic, capability: 'voice.tts' },
  { v: 'avatar', label: 'Avatar', icon: User, capability: 'avatar.generate' },
  { v: 'scrape', label: 'Scrape', icon: Globe, capability: 'scrape.crawl' },
  { v: 'rag', label: 'RAG', icon: Database, capability: 'rag.ingest' },
  { v: 'uncensored', label: 'Uncensored', icon: Zap, capability: 'text.chat', uncensored: true },
]

// ─── Context-Aware Chip Configs ────────────────────────────────
const MODE_CHIPS = {
  chat: [
    { key: 'purpose', label: 'Purpose', options: ['General', 'Creative', 'Analysis', 'Code', 'Summarize'] },
    { key: 'tone', label: 'Tone', options: ['Professional', 'Casual', 'Friendly', 'Authoritative', 'Creative'] },
    { key: 'language', label: 'Language', options: ['English', 'Spanish', 'French', 'German', 'Chinese'] },
  ],
  image: [
    { key: 'style', label: 'Style', options: ['Photorealistic', 'Anime', '3D Render', 'Oil Painting', 'Illustration'] },
    { key: 'aspect', label: 'Aspect', options: ['1:1', '16:9', '9:16', '4:3'] },
    { key: 'quality', label: 'Quality', options: ['Draft', 'Standard', 'HD'] },
  ],
  video: [
    { key: 'mode', label: 'Mode', options: ['Text to Video', 'Image to Video', 'Reel', 'Ad'] },
    { key: 'style', label: 'Style', options: ['Cinematic', 'Realistic', 'Anime', '3D'] },
    { key: 'duration', label: 'Duration', options: ['4s', '8s', '16s', '30s'] },
    { key: 'camera', label: 'Camera', options: ['Static', 'Pan Left', 'Pan Right', 'Zoom In', 'Drone', 'Orbit'] },
  ],
  longvideo: [
    { key: 'source', label: 'Source', options: ['Prompt', 'Script', 'Website', 'Brand Pack'] },
    { key: 'duration', label: 'Duration', options: ['30s', '1 min', '2 min', '5 min'] },
    { key: 'scenes', label: 'Scenes', options: ['2', '4', '6', '8'] },
  ],
  music: [
    { key: 'genre', label: 'Genre', options: ['Pop', 'Rock', 'Hip-Hop', 'Amapiano', 'Afrobeat', 'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae', 'Acoustic'] },
    { key: 'mood', label: 'Mood', options: ['Happy', 'Sad', 'Epic', 'Chill', 'Dark'] },
    { key: 'vocals', label: 'Vocals', options: ['Male', 'Female', 'Group', 'Rap', 'Choir', 'Instrumental'] },
    { key: 'tempo', label: 'Tempo', options: ['Slow', 'Medium', 'Fast'] },
  ],
  voice: [
    { key: 'voiceType', label: 'Voice', options: ['Male', 'Female', 'Child', 'Elderly'] },
    { key: 'emotion', label: 'Emotion', options: ['Neutral', 'Happy', 'Angry', 'Whisper', 'Authoritative'] },
  ],
  avatar: [
    { key: 'background', label: 'Background', options: ['Office', 'Studio', 'Green Screen', 'Custom'] },
    { key: 'gesture', label: 'Gesture', options: ['None', 'Subtle', 'Expressive'] },
  ],
  scrape: [
    { key: 'depth', label: 'Depth', options: ['1', '2', '3', '4', '5'] },
    { key: 'extract', label: 'Extract', options: ['Logo', 'Colors', 'Fonts', 'Pricing', 'Products', 'Team'] },
  ],
  rag: [
    { key: 'chunking', label: 'Chunking', options: ['Auto', 'Precise', 'Broad', 'Custom'] },
    { key: 'topK', label: 'Top-K', options: ['3', '5', '10', '20'] },
  ],
  uncensored: [
    { key: 'model', label: 'Model', options: ['DeepInfra Text', 'MiMo Reasoning', 'Groq Text'] },
    { key: 'safety', label: 'Safety', options: ['Off', 'Minimal', 'Standard'] },
    { key: 'fallback', label: 'Fallback', options: ['Strict (Fail)', 'Final provider fallback'] },
  ],
}

// ─── Chip Popover Component ────────────────────────────────────
function Chip({ label, value, options, onChange }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition whitespace-nowrap">
          <span className="text-foreground/50">{label}:</span>
          <span className="text-cyan-300">{value}</span>
          <ChevronDown className="h-2.5 w-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1.5" align="start">
        {options.map((opt) => (
          <button key={opt} onClick={() => onChange(opt)}
            className={`w-full text-left rounded px-2.5 py-1.5 text-xs transition ${value === opt ? 'bg-cyan-500/15 text-cyan-300' : 'text-foreground/80 hover:bg-white/[0.06]'}`}>
            {opt}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ─── Preview Canvas ────────────────────────────────────────────
function PreviewCanvas({ mode, generating, generatedAssets }) {
  const busy = generating[mode]
  const isUncensored = mode === 'uncensored'
  const assets = generatedAssets.filter((a) => {
    if (mode === 'image') return a.type === 'image'
    if (mode === 'video' || mode === 'longvideo' || mode === 'avatar') return a.type === 'video'
    if (mode === 'music' || mode === 'voice') return a.type === 'audio'
    return false
  })
  const latest = assets[assets.length - 1]

  if (busy) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isUncensored ? 'border-2 border-red-500/30 rounded-xl' : ''}`}>
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
          </div>
          <div className="mt-4 w-48 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full animate-pulse" style={{ width: '65%' }} />
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Generating…</p>
      </div>
    )
  }

  if (latest) {
    if (latest.type === 'image') {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="relative max-w-lg w-full aspect-square rounded-2xl border border-white/[0.08] bg-gradient-to-br from-cyan-500/10 to-violet-500/10 flex items-center justify-center group">
            <ImageIcon className="h-16 w-16 text-foreground/10" />
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent rounded-b-2xl opacity-0 group-hover:opacity-100 transition flex gap-2 justify-center">
              <Button size="sm" variant="outline" className="h-8 text-[10px] border-white/20 bg-black/40 rounded-lg"><Download className="mr-1 h-3 w-3" /> Download</Button>
              <Button size="sm" variant="outline" className="h-8 text-[10px] border-white/20 bg-black/40 rounded-lg">Upscale 2x</Button>
            </div>
          </div>
        </div>
      )
    }
    if (latest.type === 'video') {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="relative max-w-2xl w-full aspect-video rounded-2xl border border-white/[0.08] bg-black/30 flex items-center justify-center">
            <div className="text-center">
              <Play className="h-12 w-12 text-foreground/20 mx-auto mb-2" />
              <span className="text-xs text-foreground/40">Video preview</span>
            </div>
          </div>
        </div>
      )
    }
    if (latest.type === 'audio') {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-black/20 p-6">
            <div className="flex items-center gap-4 mb-4">
              <button className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
                <Play className="h-5 w-5 ml-0.5" />
              </button>
              <div className="flex-1">
                <div className="text-sm font-medium">{latest.name}</div>
                <div className="text-[10px] text-muted-foreground">0:00 / 0:15</div>
              </div>
            </div>
            <div className="flex items-end gap-px h-12">
              {Array.from({ length: 80 }).map((_, i) => {
                const h = Math.sin(i * 0.3) * 30 + 40 + Math.random() * 20
                return <div key={i} className="flex-1 rounded-t bg-cyan-500/30" style={{ height: `${h}%` }} />
              })}
            </div>
          </div>
        </div>
      )
    }
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <Zap className="h-7 w-7 opacity-20" />
      </div>
      <p className="text-sm font-medium">Generate something to see it here</p>
      <p className="text-[10px] text-muted-foreground/50 mt-1">Use the command bar below to get started</p>
    </div>
  )
}

// ─── Director Chat (inline, no separate panel) ─────────────────
function DirectorInline() {
  const { chatHistory, simulateChatResponse, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])
  const send = () => { if (!input.trim()) return; simulateChatResponse(input); setInput('') }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {chatHistory.map((m, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-xs ${m.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {generating.chat && <div className="mr-12 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-foreground/80">Thinking<span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" /></div>}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask the Director AI…" className="bg-black/20 flex-1 h-8 text-xs rounded-lg" />
        <Button onClick={send} size="sm" className="h-8 w-8 p-0 bg-gradient-to-r from-cyan-400 to-violet-500 text-black rounded-lg"><Send className="h-3 w-3" /></Button>
      </div>
    </div>
  )
}

// ─── MAIN STUDIO PAGE ──────────────────────────────────────────
export default function Studio() {
  const { generating, generatedAssets, simulateGeneration } = useStudioStore()

  // Mode and chip state
  const [mode, setMode] = useState('chat')
  const [chipValues, setChipValues] = useState({})
  const [prompt, setPrompt] = useState('')
  const [showChat, setShowChat] = useState(false)

  const setChip = (key, val) => setChipValues((p) => ({ ...p, [key]: val }))

  // Get chips for current mode
  const chips = MODE_CHIPS[mode] || []
  const currentMode = MODES.find((m) => m.v === mode)
  const isUncensored = currentMode?.uncensored === true

  // Generate handler
  const handleGenerate = async () => {
    if (!prompt.trim() && mode !== 'chat') {
      toast.warning('Enter a prompt first')
      return
    }
    if (mode === 'chat') {
      // Chat mode: send to Director
      if (!prompt.trim()) return
      const { simulateChatResponse } = useStudioStore.getState()
      simulateChatResponse(prompt)
      setPrompt('')
      setShowChat(true)
      return
    }
    // Generate mode
    const asset = await simulateGeneration(currentMode.capability, { title: `${currentMode.label} output` })
    toast.success('Generation complete', { description: `${currentMode.label} · ${asset.name}` })
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* ─── Top Bar (56px) ─────────────────────────────────────── */}
      <header className="h-14 shrink-0 flex items-center gap-4 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
            <Zap className="h-4 w-4 text-black" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">AmarktAI Studio</div>
            <div className="text-[9px] text-muted-foreground -mt-0.5">Enterprise AI Workspace</div>
          </div>
        </div>
        <div className="flex-1" />
        {isUncensored && (
          <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px] mr-2">UNCENSORED MODE ACTIVE</Badge>
        )}
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">All Systems Operational</Badge>
      </header>

      {/* ─── Preview Canvas (flex-1) ─────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <PreviewCanvas mode={mode} generating={generating} generatedAssets={generatedAssets} />

        {/* Director Chat overlay (toggled) */}
        {showChat && (
          <div className="absolute inset-y-0 right-0 w-96 border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)] shadow-2xl z-10 flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
                  <MessageSquare className="h-3 w-3 text-black" />
                </div>
                <span className="text-xs font-semibold">Director AI</span>
              </div>
              <button onClick={() => setShowChat(false)} className="text-muted-foreground hover:text-foreground transition"><X className="h-3.5 w-3.5" /></button>
            </div>
            <DirectorInline />
          </div>
        )}
      </div>

      {/* ─── Command Bar (fixed bottom, flex-shrink-0) ──────────── */}
      <div className="flex-shrink-0 border-t border-white/[0.06] bg-[hsl(240_14%_3.5%)]">
        {/* Chips row */}
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto hide-scrollbar border-b border-white/[0.04]">
          {/* Mode Selector */}
          <Select value={mode} onValueChange={(v) => { setMode(v); setChipValues({}) }}>
            <SelectTrigger className="w-32 bg-black/20 h-8 text-xs rounded-lg shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.v} value={m.v}>
                  <div className="flex items-center gap-2"><m.icon className="h-3 w-3" /> {m.label}</div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="h-5 w-px bg-white/10 shrink-0" />

          {/* Context-Aware Chips */}
          {chips.map((chip) => {
            const currentVal = chipValues[chip.key] || chip.options[0]
            return (
              <Chip key={chip.key} label={chip.label} value={currentVal} options={chip.options} onChange={(v) => setChip(chip.key, v)} />
            )
          })}

          <div className="flex-1" />

          {/* Director toggle */}
          <button onClick={() => setShowChat(!showChat)}
            className={`p-2 rounded-lg transition ${showChat ? 'text-cyan-300 bg-cyan-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'}`}
            title="Director AI">
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>

        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 relative">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder={mode === 'chat' ? 'Ask the Director AI…' : `Describe your ${currentMode?.label?.toLowerCase()}…`}
              className="bg-black/20 h-11 text-sm rounded-xl pr-4"
            />
          </div>
          <Button onClick={handleGenerate}
            disabled={generating[mode]}
            className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90 h-11 px-6 rounded-xl text-sm font-semibold transition-all">
            {generating[mode] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generating[mode] ? 'Generating…' : mode === 'chat' ? 'Send' : 'Generate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
