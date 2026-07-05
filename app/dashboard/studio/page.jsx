'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Sparkles, Loader2, Send, ChevronDown, Settings, X, Zap,
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
  { v: 'uncensored', label: 'Gated', icon: Zap, capability: 'uncensored.text', uncensored: true, disabled: true },
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
    { key: 'provider', label: 'Provider', options: ['DeepInfra gated lane'] },
    { key: 'status', label: 'Status', options: ['Backend gating pending'] },
    { key: 'fallback', label: 'Fallback', options: ['Disabled until configured'] },
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
function PreviewCanvas() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <Zap className="h-7 w-7 opacity-20" />
      </div>
      <p className="text-sm font-medium">Backend integration pending.</p>
      <p className="mt-1 max-w-md text-center text-xs text-muted-foreground/60">
        Real previews will appear here after /api/v1 jobs and artifacts are wired.
      </p>
    </div>
  )
}
// Director Chat (inline, no separate panel) ─────────────────
function DirectorInline() {
  const { chatHistory, appendBackendPendingChatNotice, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])
  const send = () => { if (!input.trim()) return; appendBackendPendingChatNotice(input); setInput('') }

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
  const { generating } = useStudioStore()

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
      const { appendBackendPendingChatNotice } = useStudioStore.getState()
      appendBackendPendingChatNotice(prompt)
      setPrompt('')
      setShowChat(true)
      return
    }
    if (mode !== 'chat') {
      toast.info('Backend integration pending', { description: `${currentMode.label} execution is disabled until the real /api/v1 backend is wired.` })
      return
    }
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
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px] mr-2">GATED LANE PENDING</Badge>
        )}
        <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">Backend Pending</Badge>
      </header>

      {/* ─── Preview Canvas (flex-1) ─────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <PreviewCanvas />

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
            disabled={mode !== 'chat' || generating[mode]}
            title={mode !== 'chat' ? 'Backend integration pending' : undefined}
            className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90 h-11 px-6 rounded-xl text-sm font-semibold transition-all">
            {generating[mode] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generating[mode] ? 'Pending...' : mode === 'chat' ? 'Send' : 'Backend Pending'}
          </Button>
        </div>
      </div>
    </div>
  )
}
