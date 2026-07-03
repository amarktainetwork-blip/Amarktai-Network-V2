'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/mockSchemas'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import Stepper from '@/components/amarkt/Stepper'
import { DropZone, MediaPreview, ExtractedDataCard } from '@/components/amarkt/StudioComponents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Field } from '@/components/amarkt/kit'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Play, Plus, Trash2, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Wand2, Package, Sliders,
  Settings, Palette, Type, Sparkles, Loader2, X, Search, Eye, Download,
  Upload, FileText, ChevronLeft, ChevronRight, ChevronDown, Minimize2,
  Zap, Bot, Home, FolderOpen, LayoutGrid, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

// ─── Creator / Pro Mode Toggle ─────────────────────────────────
function UxModeToggle() {
  const { uxMode, setUxMode } = useStudioStore()
  return (
    <div className="flex items-center rounded-lg border border-white/[0.1] bg-white/[0.03] p-0.5">
      <button onClick={() => setUxMode('creator')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${uxMode === 'creator' ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-300 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
        <Sparkles className="h-3 w-3" /> Creator
      </button>
      <button onClick={() => setUxMode('pro')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${uxMode === 'pro' ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
        <Settings className="h-3 w-3" /> Pro
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
    <Button onClick={handle} disabled={disabled || busy}
      className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90 text-sm font-semibold h-11 rounded-lg transition-all">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      {busy ? 'Generating…' : label}
    </Button>
  )
}

// ─── Director Chat ─────────────────────────────────────────────
function DirectorChat({ onClose }) {
  const { chatHistory, simulateChatResponse, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])
  const send = () => { if (!input.trim()) return; simulateChatResponse(input); setInput('') }
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
            <Bot className="h-3 w-3 text-black" />
          </div>
          <span className="text-xs font-semibold">Director AI</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatHistory.map((m, i) => (
          <div key={i} className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${m.role === 'user' ? 'ml-8 bg-cyan-500/10 text-cyan-100' : 'mr-8 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {generating.chat && <div className="mr-8 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-xs text-foreground/80">Thinking<span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" /></div>}
      </div>
      {/* Input */}
      <div className="border-t border-white/[0.06] p-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask the Director…" className="bg-black/20 flex-1 h-9 text-xs rounded-lg" />
        <Button onClick={send} size="sm" className="h-9 w-9 p-0 bg-gradient-to-r from-cyan-400 to-violet-500 text-black rounded-lg"><Send className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────
function Timeline({ onClose }) {
  const { timelineTracks, dropAssetOnTimeline } = useStudioStore()
  const [dragOver, setDragOver] = useState(null)
  const handleDrop = (e, trackId) => { e.preventDefault(); setDragOver(null); try { const asset = JSON.parse(e.dataTransfer.getData('text/plain')); dropAssetOnTimeline(asset, trackId); toast.success('Added to timeline', { description: asset.name }) } catch {} }
  const isEmpty = timelineTracks.every((t) => t.clips.length === 0)
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground">Timeline</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px]"><Play className="h-3 w-3" /></Button>
          <span className="text-[9px] text-muted-foreground font-mono">00:00 / 00:00</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition ml-2"><Minimize2 className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-6 py-8 text-center">
              <GripVertical className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground">Drag assets here or generate to populate</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {timelineTracks.map((track) => (
              <div key={track.id} onDragOver={(e) => { e.preventDefault(); setDragOver(track.id) }} onDragLeave={() => setDragOver(null)} onDrop={(e) => handleDrop(e, track.id)}
                className={`flex items-center gap-2 rounded-lg transition px-2 py-1 ${dragOver === track.id ? 'bg-cyan-500/[0.06]' : ''}`}>
                <div className="w-14 shrink-0 text-[9px] text-muted-foreground truncate font-medium">{track.label}</div>
                <div className="relative h-7 flex-1 rounded-md bg-white/[0.02] border border-white/[0.04]">
                  {track.clips.map((clip, i) => (
                    <div key={clip.id || i} className={`absolute top-1 bottom-1 rounded bg-${track.color}-500/20 border border-${track.color}-500/30 flex items-center px-1.5`}
                      style={{ left: `${clip.start}%`, width: `${clip.width}%` }}>
                      <span className="text-[8px] text-foreground/60 truncate">{clip.label}</span>
                    </div>
                  ))}
                </div>
                <Volume2 className="h-3 w-3 text-muted-foreground/30 shrink-0" />
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scene {index + 1}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
      </div>
      <Textarea value={scene.prompt} onChange={(e) => onUpdate({ ...scene, prompt: e.target.value })} placeholder={`Describe scene ${index + 1}…`} className="min-h-[48px] bg-black/20 text-xs rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">Duration — {scene.duration}s</div>
          <Slider value={[scene.duration]} onValueChange={([v]) => onUpdate({ ...scene, duration: v })} min={1} max={30} step={1} />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">Transition</div>
          <Select value={scene.transition} onValueChange={(v) => onUpdate({ ...scene, transition: v })}>
            <SelectTrigger className="bg-black/20 text-xs h-8 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Cut">Cut</SelectItem><SelectItem value="Fade">Fade</SelectItem><SelectItem value="Dissolve">Dissolve</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// ─── Left Panel: Asset Bin ─────────────────────────────────────
function AssetBin({ generatedAssets, collapsed, onToggle }) {
  const icons = { image: ImageIcon, video: Film, audio: Music, document: FileText }
  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-4 gap-4">
        <button onClick={onToggle} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Expand Asset Bin">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button className="p-2 rounded-lg text-muted-foreground/50" title="Assets"><FolderOpen className="h-4 w-4" /></button>
        <button className="p-2 rounded-lg text-muted-foreground/50" title="Nodes"><LayoutGrid className="h-4 w-4" /></button>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Asset Bin</span>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {generatedAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <Package className="h-8 w-8 mb-3 opacity-20" />
            <span className="text-[11px]">No assets yet</span>
            <span className="text-[10px] text-muted-foreground/50 mt-1">Generate to populate</span>
          </div>
        ) : (
          generatedAssets.map((asset) => {
            const Icon = icons[asset.type] || FileText
            return (
              <div key={asset.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify(asset)); e.dataTransfer.effectAllowed = 'copy' }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-grab hover:bg-white/[0.04] transition group border border-transparent hover:border-white/[0.06]">
                <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${asset.gradient} flex items-center justify-center shrink-0`}>
                  <Icon className="h-3.5 w-3.5 text-foreground/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate">{asset.name}</div>
                  <div className="text-[9px] text-muted-foreground">{asset.size}</div>
                </div>
                <GripVertical className="h-3 w-3 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </div>
            )
          })
        )}
      </div>
      <div className="border-t border-white/[0.06] p-3 space-y-1">
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Node Palette</div>
        {['Script', 'Voice', 'Video', 'Image'].map((n) => (
          <div key={n} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-white/[0.04] cursor-grab transition">
            <GripVertical className="h-2.5 w-2.5" />{n}
          </div>
        ))}
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

  // Panel state
  const [leftCollapsed, setLeftCollapsed] = useState(false)
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
    { label: 'Source', content: (
      <div className="space-y-5">
        <DynamicFormRenderer schema={{ source: CAPABILITY_SCHEMAS.longvideo.source, target_duration: CAPABILITY_SCHEMAS.longvideo.target_duration }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
        <Field label="Prompt / Script"><Textarea placeholder="Describe the overall video…" className="min-h-[80px] bg-black/20 rounded-lg" /></Field>
      </div>
    )},
    { label: 'Scenes', content: (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Scene Planner</span>
          <Button variant="outline" size="sm" onClick={() => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'Cut' }])} className="border-white/10 text-xs h-8 rounded-lg"><Plus className="mr-1 h-3 w-3" /> Add Scene</Button>
        </div>
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {scenes.map((scene, i) => <SceneCard key={i} scene={scene} index={i} onUpdate={(d) => setScenes((p) => p.map((s, idx) => idx === i ? d : s))} onRemove={() => setScenes((p) => p.filter((_, idx) => idx !== i))} />)}
        </div>
      </div>
    )},
    { label: 'Audio', content: (
      <DynamicFormRenderer schema={{ voiceover: CAPABILITY_SCHEMAS.longvideo.voiceover, music_bed: CAPABILITY_SCHEMAS.longvideo.music_bed }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
    )},
    { label: 'Export', content: (
      <div className="space-y-5">
        <DynamicFormRenderer schema={{ subtitles: CAPABILITY_SCHEMAS.longvideo.subtitles, logo_overlay: CAPABILITY_SCHEMAS.longvideo.logo_overlay, cutdown_pack: CAPABILITY_SCHEMAS.longvideo.cutdown_pack }} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
        <GenerateButton capability="video.longform" label="Generate Video" />
      </div>
    )},
  ]

  // ─── Scrape Stepper ──────────────────────────────────────────
  const scrapeSteps = [
    { label: 'Target', content: (
      <DynamicFormRenderer schema={{ website_url: CAPABILITY_SCHEMAS.scrape.website_url, crawl_depth: CAPABILITY_SCHEMAS.scrape.crawl_depth, max_pages: CAPABILITY_SCHEMAS.scrape.max_pages }} values={scrapeValues} onChange={setScrapeValues} mode={uxMode} capability="scrape" />
    )},
    { label: 'Extraction', content: (
      <DynamicFormRenderer schema={{ extract_targets: CAPABILITY_SCHEMAS.scrape.extract_targets, brand_guide: CAPABILITY_SCHEMAS.scrape.brand_guide }} values={scrapeValues} onChange={setScrapeValues} mode={uxMode} capability="scrape" />
    )},
    { label: 'Review', content: (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <ExtractedDataCard icon={Palette} title="Colors" items={['#22D3EE', '#8B5CF6', '#F0ABFC']} />
          <ExtractedDataCard icon={Type} title="Fonts" items={['Inter', 'Space Grotesk']} />
          <ExtractedDataCard icon={Globe} title="Brand" items={['Enterprise AI', 'SaaS']} />
          <ExtractedDataCard icon={FileText} title="Pricing" items={['$99/mo', '$299/mo']} />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" className="flex-1 border-cyan-500/30 text-cyan-300 text-xs h-9 rounded-lg"><Sparkles className="mr-1 h-3 w-3" /> Save as Brand Pack</Button>
          <Button variant="outline" size="sm" className="flex-1 border-violet-500/30 text-violet-300 text-xs h-9 rounded-lg"><Database className="mr-1 h-3 w-3" /> Create RAG Set</Button>
        </div>
        <GenerateButton capability="scrape.crawl" label="Start Scraping" />
      </div>
    )},
  ]

  // ─── Avatar Stepper ──────────────────────────────────────────
  const avatarSteps = [
    { label: 'Identity', content: (
      <div className="space-y-5">
        <Field label="Reference Face"><DropZone accept="image/*" label="Upload face image" kind="image" /></Field>
        <Field label="Or describe"><Textarea placeholder="Describe the avatar appearance…" className="min-h-[60px] bg-black/20 rounded-lg" /></Field>
      </div>
    )},
    { label: 'Audio', content: (
      <div className="space-y-5">
        <Field label="Lip-Sync Audio"><DropZone accept="audio/*" label="Upload audio" kind="audio" /></Field>
        <DynamicFormRenderer schema={{ voice_type: CAPABILITY_SCHEMAS.voice.voice_type }} values={voiceValues} onChange={setVoiceValues} mode={uxMode} capability="voice" />
      </div>
    )},
    { label: 'Environment', content: (
      <div className="space-y-5">
        <DynamicFormRenderer schema={{ background: CAPABILITY_SCHEMAS.avatar.background, gesture_intensity: CAPABILITY_SCHEMAS.avatar.gesture_intensity }} values={avatarValues} onChange={setAvatarValues} mode={uxMode} capability="avatar" />
        <GenerateButton capability="avatar.generate" label="Generate Talking Head" />
      </div>
    )},
  ]

  return (
    <div className="h-screen overflow-hidden bg-background" style={{
      display: 'grid',
      gridTemplateRows: '64px 56px 1fr',
      gridTemplateColumns: `${leftCollapsed ? '64px' : '280px'} 1fr ${rightOpen ? '320px' : '0px'}`,
      gridTemplateAreas: `
        "header header header"
        "toolbar toolbar toolbar"
        "left-panel center-workbench right-panel"
      `,
      transition: 'grid-template-columns 0.2s ease',
    }}>

      {/* ─── Header (64px) ─────────────────────────────────────── */}
      <header style={{ gridArea: 'header' }} className="flex items-center gap-4 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-5 z-20">
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
        <UxModeToggle />
      </header>

      {/* ─── Toolbar (56px) ────────────────────────────────────── */}
      <nav style={{ gridArea: 'toolbar' }} className="flex items-center gap-1 border-b border-white/[0.06] bg-[hsl(240_14%_3.5%)] px-4 z-10">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setActiveTab(t.v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium whitespace-nowrap transition ${activeTab === t.v ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'}`}>
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button onClick={() => setLeftCollapsed(!leftCollapsed)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Asset Bin">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button onClick={() => setRightOpen(!rightOpen)} className={`p-2 rounded-lg transition ${rightOpen ? 'text-cyan-300 bg-cyan-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'}`} title="Director">
            <PanelRightOpen className="h-4 w-4" />
          </button>
          <button onClick={() => setBottomOpen(!bottomOpen)} className={`p-2 rounded-lg transition ${bottomOpen ? 'text-cyan-300 bg-cyan-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'}`} title="Timeline">
            <Layers className="h-4 w-4" />
          </button>
        </div>
      </nav>

      {/* ─── Left Panel: Asset Bin ─────────────────────────────── */}
      <aside style={{ gridArea: 'left-panel' }} className="border-r border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden transition-all duration-200">
        <AssetBin generatedAssets={generatedAssets} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(!leftCollapsed)} />
      </aside>

      {/* ─── Center Workbench ──────────────────────────────────── */}
      <main style={{ gridArea: 'center-workbench' }} className="flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-6">

          {/* Chat */}
          {activeTab === 'chat' && (
            <div className="grid gap-6 lg:grid-cols-2 h-full">
              <div className="space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.chat} values={chatValues} onChange={setChatValues} mode={uxMode} capability="chat" />
                <Button onClick={() => { if (!chatValues.prompt?.trim()) return; setChatMessages((p) => [...p, { role: 'user', content: chatValues.prompt }]); setChatValues((v) => ({ ...v, prompt: '' })); setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'Simulated response. In production, powered by AI provider pipeline.' }]), 1500) }} disabled={!chatValues.prompt?.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-sm font-semibold h-11 rounded-lg"><Send className="mr-2 h-4 w-4" /> Send</Button>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 overflow-y-auto space-y-3 min-h-[300px]">
                {chatMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-8 w-8 mb-2 opacity-20" /><span className="text-xs">Send a message to start</span></div>}
                {chatMessages.map((m, i) => <div key={i} className={`rounded-xl px-3.5 py-2.5 text-xs ${m.role === 'user' ? 'ml-8 bg-cyan-500/10 text-cyan-100' : 'mr-8 bg-white/[0.04] text-foreground/80'}`}>{m.content}</div>)}
              </div>
            </div>
          )}

          {/* Image */}
          {activeTab === 'image' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.image} values={imageValues} onChange={setImageValues} mode={uxMode} capability="image" />
                <GenerateButton capability="image.generate" />
              </div>
              <div className="lg:col-span-2">
                {generating.image ? <div className="h-64 rounded-xl bg-white/[0.04] animate-pulse" /> :
                  getAssets('image').length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {getAssets('image').slice(-4).map((a) => (
                        <div key={a.id} className={`relative aspect-square rounded-xl border border-white/[0.06] bg-gradient-to-br ${a.gradient} flex items-center justify-center group`}>
                          <ImageIcon className="h-8 w-8 text-foreground/20" />
                          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-6 text-[9px] border-white/20 bg-black/40 rounded-md"><Download className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="h-6 text-[9px] border-white/20 bg-black/40 rounded-md">Upscale</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-xl border border-dashed border-white/10"><ImageIcon className="h-10 w-10 mb-2 opacity-20" /><span className="text-xs">Generated images appear here</span></div>}
              </div>
            </div>
          )}

          {/* Video */}
          {activeTab === 'video' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.video} values={videoValues} onChange={setVideoValues} mode={uxMode} capability="video" />
                <GenerateButton capability="video.generate" />
              </div>
              <div className="lg:col-span-2">{generating.video ? <div className="h-64 rounded-xl bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Generated video" />}</div>
            </div>
          )}

          {/* Long-form Video (Stepper) */}
          {activeTab === 'longvideo' && <Stepper steps={longvideoSteps} onComplete={() => toast.info('Video generation queued')} />}

          {/* Music */}
          {activeTab === 'music' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.music} values={musicValues} onChange={setMusicValues} mode={uxMode} capability="music" />
                <GenerateButton capability="music.generate" />
              </div>
              <div className="lg:col-span-2">{generating.music ? <div className="h-32 rounded-xl bg-white/[0.04] animate-pulse" /> : getAssets('audio').length > 0 ? <MediaPreview type="audio" title="Generated track" /> : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-xl border border-dashed border-white/10"><Music className="h-10 w-10 mb-2 opacity-20" /><span className="text-xs">Generated tracks appear here</span></div>}</div>
            </div>
          )}

          {/* Voice */}
          {activeTab === 'voice' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.voice} values={voiceValues} onChange={setVoiceValues} mode={uxMode} capability="voice" />
                <GenerateButton capability="voice.tts" />
              </div>
              <div className="lg:col-span-2">{generating.voice ? <div className="h-32 rounded-xl bg-white/[0.04] animate-pulse" /> : <MediaPreview type="audio" title="Synthesized voice" />}</div>
            </div>
          )}

          {/* Avatar (Stepper) */}
          {activeTab === 'avatar' && <Stepper steps={avatarSteps} onComplete={() => toast.info('Avatar generation queued')} />}

          {/* Scrape/Brand (Stepper) */}
          {activeTab === 'scrape' && <Stepper steps={scrapeSteps} onComplete={() => toast.info('Scrape queued')} />}

          {/* RAG */}
          {activeTab === 'rag' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-5">
                <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.rag} values={ragValues} onChange={setRagValues} mode={uxMode} capability="rag" />
                <GenerateButton capability="rag.ingest" label="Build Knowledge Set" />
              </div>
              <div className="lg:col-span-2 space-y-4">
                <div className="flex gap-2">
                  <Input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Search knowledge base…" className="bg-black/20 flex-1 h-9 text-xs rounded-lg" />
                  <Button variant="outline" size="sm" className="h-9 border-white/10 rounded-lg" onClick={() => { if (!ragQuery.trim()) return; setRagResults([{ text: 'AmarktAI Network provides enterprise AI orchestration capabilities.', score: 0.94, source: 'brand-guide.pdf' }, { text: 'Multi-provider routing strategy optimizes for cost, latency, and quality.', score: 0.87, source: 'architecture.md' }]) }}><Search className="h-3.5 w-3.5" /></Button>
                </div>
                {ragResults.length > 0 ? (
                  <div className="space-y-2">
                    {ragResults.map((r, i) => (
                      <div key={i} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] text-muted-foreground">{r.source}</span>
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[9px]">{(r.score * 100).toFixed(0)}%</Badge>
                        </div>
                        <p className="text-[11px] text-foreground/80 leading-relaxed">{r.text}</p>
                      </div>
                    ))}
                  </div>
                ) : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-xl border border-dashed border-white/10"><Database className="h-10 w-10 mb-2 opacity-20" /><span className="text-xs">Search results appear here</span></div>}
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom Panel: Timeline ─────────────────────────── */}
        {bottomOpen && (
          <div className="h-[250px] shrink-0 border-t border-white/[0.06] bg-[hsl(240_14%_3.5%)]">
            <Timeline onClose={() => setBottomOpen(false)} />
          </div>
        )}
      </main>

      {/* ─── Right Panel: Director Chat ───────────────────────── */}
      <aside style={{ gridArea: 'right-panel' }} className="border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden transition-all duration-200">
        {rightOpen && <DirectorChat onClose={() => setRightOpen(false)} />}
      </aside>
    </div>
  )
}
