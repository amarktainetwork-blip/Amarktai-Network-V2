'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/mockSchemas'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import Stepper from '@/components/amarkt/Stepper'
import { DropZone, MediaPreview, ExtractedDataCard } from '@/components/amarkt/StudioComponents'
import AssetLibraryDrawer from '@/components/amarkt/AssetLibraryDrawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Field } from '@/components/amarkt/kit'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Play, Plus, Trash2, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Wand2, Package, Sliders,
  Settings, Palette, Type, Sparkles, Loader2, X, Search, Eye, Download,
  Upload, FileText, ChevronLeft, ChevronRight, ChevronDown, Minimize2,
  Zap, ToggleLeft, ToggleRight, Bot,
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

// ─── Creator / Pro Mode Toggle ─────────────────────────────────
function UxModeToggle() {
  const { uxMode, setUxMode } = useStudioStore()
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5">
      <button onClick={() => setUxMode('creator')}
        className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-all ${uxMode === 'creator' ? 'bg-cyan-500/15 text-cyan-300' : 'text-muted-foreground hover:text-foreground'}`}>
        <Sparkles className="h-2.5 w-2.5" /> Creator
      </button>
      <button onClick={() => setUxMode('pro')}
        className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-all ${uxMode === 'pro' ? 'bg-violet-500/15 text-violet-300' : 'text-muted-foreground hover:text-foreground'}`}>
        <Settings className="h-2.5 w-2.5" /> Pro
      </button>
    </div>
  )
}

// ─── Generate Button ───────────────────────────────────────────
function GenerateButton({ capability, label = 'Generate', disabled }) {
  const { generating, simulateGeneration } = useStudioStore()
  const key = capability.split('.')[0]
  const busy = generating[key]
  const handle = async () => {
    const asset = await simulateGeneration(capability, { title: `${capability} output` })
    toast.success('Generation complete', { description: `${capability} · ${asset.name}` })
  }
  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
      <span className="text-[10px] text-muted-foreground">Background job</span>
      <Button onClick={handle} disabled={disabled || busy} size="sm" className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90 text-xs">
        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
        {busy ? 'Generating…' : label}
      </Button>
    </div>
  )
}

// ─── Director Chat ─────────────────────────────────────────────
function DirectorChat() {
  const { chatHistory, simulateChatResponse, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])
  const send = () => { if (!input.trim()) return; simulateChatResponse(input); setInput('') }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <Bot className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-[11px] font-medium text-muted-foreground">Director</span>
        <Badge variant="outline" className="ml-auto border-cyan-500/30 text-[9px] text-cyan-300">AI</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {chatHistory.map((m, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-xs ${m.role === 'user' ? 'ml-6 bg-cyan-500/10 text-cyan-100' : 'mr-6 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {generating.chat && <div className="mr-6 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-foreground/80">Thinking<span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" /></div>}
      </div>
      <div className="border-t border-white/[0.06] p-2 flex gap-1.5">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask the Director…" className="bg-black/20 flex-1 h-8 text-xs" />
        <Button onClick={send} size="sm" className="h-8 w-8 p-0 bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="h-3 w-3" /></Button>
      </div>
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────
function Timeline() {
  const { timelineTracks, dropAssetOnTimeline } = useStudioStore()
  const [dragOver, setDragOver] = useState(null)
  const handleDrop = (e, trackId) => { e.preventDefault(); setDragOver(null); try { const asset = JSON.parse(e.dataTransfer.getData('text/plain')); dropAssetOnTimeline(asset, trackId); toast.success('Added to timeline', { description: asset.name }) } catch {} }
  const isEmpty = timelineTracks.every((t) => t.clips.length === 0)
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">Timeline</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]"><Play className="h-2.5 w-2.5" /></Button>
          <span className="text-[9px] text-muted-foreground font-mono">00:00</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full p-3">
            <div className="rounded border border-dashed border-white/10 bg-white/[0.01] px-4 py-5 text-center">
              <GripVertical className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground/30" />
              <p className="text-[10px] text-muted-foreground">Drag assets here or generate to populate</p>
            </div>
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {timelineTracks.map((track) => (
              <div key={track.id} onDragOver={(e) => { e.preventDefault(); setDragOver(track.id) }} onDragLeave={() => setDragOver(null)} onDrop={(e) => handleDrop(e, track.id)}
                className={`flex items-center gap-1.5 rounded transition ${dragOver === track.id ? 'bg-cyan-500/[0.06]' : ''}`}>
                <div className="w-12 shrink-0 text-[9px] text-muted-foreground truncate">{track.label}</div>
                <div className="relative h-6 flex-1 rounded bg-white/[0.02] border border-white/[0.03]">
                  {track.clips.map((clip, i) => (
                    <div key={clip.id || i} className={`absolute top-0.5 bottom-0.5 rounded bg-${track.color}-500/20 border border-${track.color}-500/30 flex items-center px-1`}
                      style={{ left: `${clip.start}%`, width: `${clip.width}%` }}>
                      <span className="text-[8px] text-foreground/60 truncate">{clip.label}</span>
                    </div>
                  ))}
                </div>
                <Volume2 className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Scene Card ────────────────────────────────────────────────
function SceneCard({ scene, index, onUpdate, onRemove }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Scene {index + 1}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
      </div>
      <Textarea value={scene.prompt} onChange={(e) => onUpdate({ ...scene, prompt: e.target.value })} placeholder={`Describe scene ${index + 1}…`} className="min-h-[40px] bg-black/20 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Duration — {scene.duration}s</div>
          <Slider value={[scene.duration]} onValueChange={([v]) => onUpdate({ ...scene, duration: v })} min={1} max={30} step={1} />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Transition</div>
          <Select value={scene.transition} onValueChange={(v) => onUpdate({ ...scene, transition: v })}>
            <SelectTrigger className="bg-black/20 text-xs h-7"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Cut">Cut</SelectItem><SelectItem value="Fade">Fade</SelectItem><SelectItem value="Dissolve">Dissolve</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN STUDIO PAGE ──────────────────────────────────────────
export default function Studio() {
  const { generating, generatedAssets, uxMode } = useStudioStore()
  const getAssets = (type) => generatedAssets.filter((a) => a.type === type)

  // Form values
  const [chatValues, setChatValues] = useState({})
  const [chatMessages, setChatMessages] = useState([])
  const [imageValues, setImageValues] = useState({})
  const [videoValues, setVideoValues] = useState({})
  const [longvideoValues, setLongvideoValues] = useState({})
  const [musicValues, setMusicValues] = useState({})
  const [voiceValues, setVoiceValues] = useState({})
  const [avatarValues, setAvatarValues] = useState({})
  const [scrapeValues, setScrapeValues] = useState({})
  const [ragValues, setRagValues] = useState({})
  const [scenes, setScenes] = useState([{ prompt: '', duration: 5, transition: 'Cut' }, { prompt: '', duration: 5, transition: 'Fade' }])
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState([])

  // Panel state — default: left open, right closed, bottom closed
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')

  const TABS = [
    { v: 'chat', label: 'Chat', icon: MessageSquare },
    { v: 'image', label: 'Image', icon: ImageIcon },
    { v: 'video', label: 'Video', icon: Video },
    { v: 'longvideo', label: 'Long-form', icon: Film },
    { v: 'music', label: 'Music', icon: Music },
    { v: 'voice', label: 'Voice', icon: Mic },
    { v: 'avatar', label: 'Avatar', icon: User },
    { v: 'scrape', label: 'Scrape', icon: Globe },
    { v: 'rag', label: 'RAG', icon: Database },
  ]

  // ─── Long-form Video Stepper ─────────────────────────────────
  const longvideoSteps = [
    {
      label: 'Source',
      content: (
        <div className="space-y-4">
          <DynamicFormRenderer schema={{
            source: CAPABILITY_SCHEMAS.longvideo.source,
            target_duration: CAPABILITY_SCHEMAS.longvideo.target_duration,
          }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
          <Field label="Prompt / Script">
            <Textarea placeholder="Describe the overall video…" className="min-h-[80px] bg-black/20" />
          </Field>
        </div>
      ),
    },
    {
      label: 'Scenes',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Scene Planner</span>
            <Button variant="outline" size="sm" onClick={() => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'Cut' }])} className="border-white/10 text-[10px] h-6">
              <Plus className="mr-1 h-2.5 w-2.5" /> Add
            </Button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {scenes.map((scene, i) => <SceneCard key={i} scene={scene} index={i} onUpdate={(d) => setScenes((p) => p.map((s, idx) => idx === i ? d : s))} onRemove={() => setScenes((p) => p.filter((_, idx) => idx !== i))} />)}
          </div>
        </div>
      ),
    },
    {
      label: 'Audio',
      content: (
        <div className="space-y-4">
          <DynamicFormRenderer schema={{
            voiceover: CAPABILITY_SCHEMAS.longvideo.voiceover,
            music_bed: CAPABILITY_SCHEMAS.longvideo.music_bed,
          }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
        </div>
      ),
    },
    {
      label: 'Export',
      content: (
        <div className="space-y-4">
          <DynamicFormRenderer schema={{
            subtitles: CAPABILITY_SCHEMAS.longvideo.subtitles,
            logo_overlay: CAPABILITY_SCHEMAS.longvideo.logo_overlay,
            cutdown_pack: CAPABILITY_SCHEMAS.longvideo.cutdown_pack,
          }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
          <GenerateButton capability="video.longform" label="Generate Video" />
        </div>
      ),
    },
  ]

  // ─── Scrape Stepper ──────────────────────────────────────────
  const scrapeSteps = [
    {
      label: 'Target',
      content: (
        <div className="space-y-4">
          <DynamicFormRenderer schema={{
            website_url: CAPABILITY_SCHEMAS.scrape.website_url,
            crawl_depth: CAPABILITY_SCHEMAS.scrape.crawl_depth,
            max_pages: CAPABILITY_SCHEMAS.scrape.max_pages,
          }} values={scrapeValues} onChange={setScrapeValues} mode={uxMode} capability="scrape" />
        </div>
      ),
    },
    {
      label: 'Extraction',
      content: (
        <DynamicFormRenderer schema={{
          extract_targets: CAPABILITY_SCHEMAS.scrape.extract_targets,
          brand_guide: CAPABILITY_SCHEMAS.scrape.brand_guide,
        }} values={scrapeValues} onChange={setScrapeValues} mode={uxMode} capability="scrape" />
      ),
    },
    {
      label: 'Review',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <ExtractedDataCard icon={Palette} title="Colors" items={['#22D3EE', '#8B5CF6', '#F0ABFC']} />
            <ExtractedDataCard icon={Type} title="Fonts" items={['Inter', 'Space Grotesk']} />
            <ExtractedDataCard icon={Globe} title="Brand" items={['Enterprise AI', 'SaaS']} />
            <ExtractedDataCard icon={FileText} title="Pricing" items={['$99/mo', '$299/mo']} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 border-cyan-500/30 text-cyan-300 text-[10px]"><Sparkles className="mr-1 h-2.5 w-2.5" /> Save as Brand Pack</Button>
            <Button variant="outline" size="sm" className="flex-1 border-violet-500/30 text-violet-300 text-[10px]"><Database className="mr-1 h-2.5 w-2.5" /> Create RAG Set</Button>
          </div>
          <GenerateButton capability="scrape.crawl" label="Start Scraping" />
        </div>
      ),
    },
  ]

  // ─── Avatar Stepper ──────────────────────────────────────────
  const avatarSteps = [
    {
      label: 'Identity',
      content: (
        <div className="space-y-4">
          <Field label="Reference Face"><DropZone accept="image/*" label="Upload face image" kind="image" compact /></Field>
          <Field label="Or describe"><Textarea placeholder="Describe the avatar appearance…" className="min-h-[60px] bg-black/20" /></Field>
        </div>
      ),
    },
    {
      label: 'Audio',
      content: (
        <div className="space-y-4">
          <Field label="Lip-Sync Audio"><DropZone accept="audio/*" label="Upload audio" kind="audio" compact /></Field>
          <DynamicFormRenderer schema={{ voice_type: CAPABILITY_SCHEMAS.voice.voice_type }} values={voiceValues} onChange={setVoiceValues} mode={uxMode} capability="voice" />
        </div>
      ),
    },
    {
      label: 'Environment',
      content: (
        <div className="space-y-4">
          <DynamicFormRenderer schema={{
            background: CAPABILITY_SCHEMAS.avatar.background,
            gesture_intensity: CAPABILITY_SCHEMAS.avatar.gesture_intensity,
          }} values={avatarValues} onChange={setAvatarValues} mode={uxMode} capability="avatar" />
          <GenerateButton capability="avatar.generate" label="Generate Talking Head" />
        </div>
      ),
    },
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* ─── Top Bar (60px) ─────────────────────────────────────── */}
      <header className="h-[60px] shrink-0 flex items-center gap-3 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-4 z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-black" />
          </div>
          <span className="text-sm font-semibold tracking-tight hidden sm:block">Studio</span>
        </div>

        {/* 9-Tab Navigation */}
        <nav className="flex-1 flex items-center gap-0.5 overflow-x-auto hide-scrollbar">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => setActiveTab(t.v)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition ${activeTab === t.v ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'}`}>
              <t.icon className="h-3 w-3" />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          <UxModeToggle />
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => setLeftOpen(!leftOpen)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Asset Bin">
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setRightOpen(!rightOpen)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Director">
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setBottomOpen(!bottomOpen)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Timeline">
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ─── Main Viewport ──────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── Left Panel: Asset Bin / Node Canvas ──────────────── */}
        <aside className={`${leftOpen ? 'w-[250px]' : 'w-[48px]'} shrink-0 border-r border-white/[0.06] bg-[hsl(240_14%_3.5%)] flex flex-col transition-all duration-200 overflow-hidden`}>
          {leftOpen ? (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Asset Bin</span>
                <button onClick={() => setLeftOpen(false)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {generatedAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <Package className="h-6 w-6 mb-2 opacity-30" />
                    <span className="text-[10px]">No assets yet</span>
                  </div>
                ) : (
                  generatedAssets.map((asset) => {
                    const icons = { image: ImageIcon, video: Film, audio: Music, document: FileText }
                    const Icon = icons[asset.type] || FileText
                    return (
                      <div key={asset.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify(asset)); e.dataTransfer.effectAllowed = 'copy' }}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-grab hover:bg-white/[0.04] transition group">
                        <div className={`h-7 w-7 rounded bg-gradient-to-br ${asset.gradient} flex items-center justify-center shrink-0`}>
                          <Icon className="h-3 w-3 text-foreground/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium truncate">{asset.name}</div>
                          <div className="text-[9px] text-muted-foreground">{asset.size}</div>
                        </div>
                        <GripVertical className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition shrink-0" />
                      </div>
                    )
                  })
                )}
              </div>
              {/* Node palette */}
              <div className="border-t border-white/[0.06] p-2 space-y-0.5">
                {['Script', 'Voice', 'Video', 'Image'].map((n) => (
                  <div key={n} className="flex items-center gap-2 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/[0.04] cursor-grab transition">
                    <GripVertical className="h-2.5 w-2.5" />{n}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-3 gap-3">
              <button onClick={() => setLeftOpen(true)} className="text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
              <Package className="h-4 w-4 text-muted-foreground/50" />
            </div>
          )}
        </aside>

        {/* ─── Center Panel: Workbench ──────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto p-4">
            {/* Chat */}
            {activeTab === 'chat' && (
              <div className="grid gap-4 lg:grid-cols-2 h-full">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.chat} values={chatValues} onChange={setChatValues} mode={uxMode} capability="chat" />
                  <Button onClick={() => { if (!chatValues.prompt?.trim()) return; setChatMessages((p) => [...p, { role: 'user', content: chatValues.prompt }]); setChatValues((v) => ({ ...v, prompt: '' })); setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'Simulated response. In production, powered by AI provider pipeline.' }]), 1500) }} disabled={!chatValues.prompt?.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"><Send className="mr-1.5 h-3 w-3" /> Send</Button>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 overflow-y-auto space-y-2 min-h-[300px]">
                  {chatMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-6 w-6 mb-1 opacity-30" /><span className="text-[10px]">Send a message to start</span></div>}
                  {chatMessages.map((m, i) => <div key={i} className={`rounded px-2.5 py-1.5 text-xs ${m.role === 'user' ? 'ml-6 bg-cyan-500/10 text-cyan-100' : 'mr-6 bg-white/[0.04] text-foreground/80'}`}>{m.content}</div>)}
                </div>
              </div>
            )}

            {/* Image */}
            {activeTab === 'image' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.image} values={imageValues} onChange={setImageValues} mode={uxMode} capability="image" />
                  <GenerateButton capability="image.generate" />
                </div>
                <div>
                  {generating.image ? <div className="h-48 rounded-lg bg-white/[0.04] animate-pulse" /> :
                    getAssets('image').length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {getAssets('image').slice(-4).map((a) => (
                          <div key={a.id} className={`relative aspect-square rounded-lg border border-white/[0.06] bg-gradient-to-br ${a.gradient} flex items-center justify-center group`}>
                            <ImageIcon className="h-6 w-6 text-foreground/20" />
                            <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex gap-1">
                              <Button size="sm" variant="outline" className="h-5 text-[9px] border-white/20 bg-black/40"><Download className="h-2.5 w-2.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10"><ImageIcon className="h-8 w-8 mb-1 opacity-30" /><span className="text-[10px]">Generated images appear here</span></div>}
                </div>
              </div>
            )}

            {/* Video */}
            {activeTab === 'video' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.video} values={videoValues} onChange={setVideoValues} mode={uxMode} capability="video" />
                  <GenerateButton capability="video.generate" />
                </div>
                <div>{generating.video ? <div className="h-48 rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Generated video" />}</div>
              </div>
            )}

            {/* Long-form Video (Stepper) */}
            {activeTab === 'longvideo' && (
              <div className="h-full">
                <Stepper steps={longvideoSteps} onComplete={() => toast.info('Video generation queued')} />
              </div>
            )}

            {/* Music */}
            {activeTab === 'music' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.music} values={musicValues} onChange={setMusicValues} mode={uxMode} capability="music" />
                  <GenerateButton capability="music.generate" />
                </div>
                <div>{generating.music ? <div className="h-24 rounded-lg bg-white/[0.04] animate-pulse" /> : getAssets('audio').length > 0 ? <MediaPreview type="audio" title="Generated track" /> : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10"><Music className="h-8 w-8 mb-1 opacity-30" /><span className="text-[10px]">Generated tracks appear here</span></div>}</div>
              </div>
            )}

            {/* Voice */}
            {activeTab === 'voice' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.voice} values={voiceValues} onChange={setVoiceValues} mode={uxMode} capability="voice" />
                  <GenerateButton capability="voice.tts" />
                </div>
                <div>{generating.voice ? <div className="h-24 rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="audio" title="Synthesized voice" />}</div>
              </div>
            )}

            {/* Avatar (Stepper) */}
            {activeTab === 'avatar' && (
              <div className="h-full">
                <Stepper steps={avatarSteps} onComplete={() => toast.info('Avatar generation queued')} />
              </div>
            )}

            {/* Scrape/Brand (Stepper) */}
            {activeTab === 'scrape' && (
              <div className="h-full">
                <Stepper steps={scrapeSteps} onComplete={() => toast.info('Scrape queued')} />
              </div>
            )}

            {/* RAG */}
            {activeTab === 'rag' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.rag} values={ragValues} onChange={setRagValues} mode={uxMode} capability="rag" />
                  <GenerateButton capability="rag.ingest" label="Build Knowledge Set" />
                </div>
                <div className="space-y-3">
                  <div className="flex gap-1.5">
                    <Input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Search knowledge base…" className="bg-black/20 flex-1 h-8 text-xs" />
                    <Button variant="outline" size="sm" className="h-8 border-white/10" onClick={() => { if (!ragQuery.trim()) return; setRagResults([{ text: 'AmarktAI Network provides enterprise AI orchestration capabilities.', score: 0.94, source: 'brand-guide.pdf' }, { text: 'Multi-provider routing strategy optimizes for cost, latency, and quality.', score: 0.87, source: 'architecture.md' }]) }}><Search className="h-3 w-3" /></Button>
                  </div>
                  {ragResults.length > 0 ? (
                    <div className="space-y-1.5">
                      {ragResults.map((r, i) => (
                        <div key={i} className="rounded border border-white/[0.06] bg-black/20 p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-muted-foreground">{r.source}</span>
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[9px]">{(r.score * 100).toFixed(0)}%</Badge>
                          </div>
                          <p className="text-[11px] text-foreground/80">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10"><Database className="h-8 w-8 mb-1 opacity-30" /><span className="text-[10px]">Search results appear here</span></div>}
                </div>
              </div>
            )}
          </div>

          {/* ─── Bottom Panel: Timeline ─────────────────────────── */}
          {bottomOpen && (
            <div className="h-[200px] shrink-0 border-t border-white/[0.06] bg-[hsl(240_14%_3.5%)]">
              <Timeline />
            </div>
          )}
          {/* Bottom toggle */}
          <div className="flex justify-center py-0.5 border-t border-white/[0.04]">
            <button onClick={() => setBottomOpen(!bottomOpen)} className="text-muted-foreground hover:text-foreground transition px-4 py-0.5">
              {bottomOpen ? <Minimize2 className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
            </button>
          </div>
        </main>

        {/* ─── Right Panel: Director Chat ───────────────────────── */}
        {rightOpen && (
          <aside className="w-[300px] shrink-0 border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)]">
            <DirectorChat />
          </aside>
        )}
      </div>
    </div>
  )
}
