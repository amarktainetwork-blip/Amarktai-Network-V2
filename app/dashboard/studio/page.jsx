'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/mockSchemas'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { DropZone, MediaPreview, ExtractedDataCard } from '@/components/amarkt/StudioComponents'
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Play, Plus, Trash2, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Wand2, Package, Sliders,
  Settings, Palette, Type, Sparkles, Loader2, X, Search, Eye, Download,
  Upload, FileText, ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

// ─── I/O Layout ────────────────────────────────────────────────
function IOLayout({ input, output, inputLabel = 'Controls', outputLabel = 'Preview' }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> {inputLabel}</div>
        {input}
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> {outputLabel}</div>
        {output}
      </div>
    </div>
  )
}

// ─── Creator / Pro Mode Toggle ─────────────────────────────────
function UxModeToggle() {
  const { uxMode, setUxMode } = useStudioStore()
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      <button
        onClick={() => setUxMode('creator')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${uxMode === 'creator' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Sparkles className="h-3 w-3" /> Creator
      </button>
      <button
        onClick={() => setUxMode('pro')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${uxMode === 'pro' ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Settings className="h-3 w-3" /> Pro
      </button>
    </div>
  )
}

// ─── Generate Button (with proper lifecycle) ───────────────────
function GenerateButton({ capability, label = 'Generate', disabled, onGenerate, formValues }) {
  const { generating, simulateGeneration } = useStudioStore()
  const key = capability.split('.')[0]
  const busy = generating[key]

  const handleGenerate = async () => {
    if (onGenerate) { onGenerate(); return }
    // Step A + B: Loading state + 2.5s delay (inside simulateGeneration)
    const asset = await simulateGeneration(capability, { title: `${capability} output` })
    // Step C: Success toast
    toast.success('Generation complete', {
      description: `${capability} · ${asset.name} · added to library`,
    })
  }

  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
      <span className="text-xs text-muted-foreground">Runs as a background job.</span>
      <Button onClick={handleGenerate} disabled={disabled || busy} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90 transition-all">
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
        {busy ? 'Generating…' : label}
      </Button>
    </div>
  )
}

// ─── Director Chat ─────────────────────────────────────────────
function DirectorChat() {
  const { chatHistory, simulateChatResponse, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const [attachedKB, setAttachedKB] = useState(null)
  const [kbOpen, setKbOpen] = useState(false)
  const scrollRef = useRef(null)
  const knowledgeBases = [{ id: 'brand-guide', name: 'Brand Guide' }, { id: 'product-docs', name: 'Product Documentation' }]
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])
  const send = () => { if (!input.trim()) return; simulateChatResponse(attachedKB ? `${input}\n\n[Context: ${attachedKB.name}]` : input); setInput('') }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Director</span>
        <Badge variant="outline" className="border-cyan-500/30 text-[10px] text-cyan-300">AI Assistant</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatHistory.map((m, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-8 bg-cyan-500/10 text-cyan-100' : 'mr-8 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {generating.chat && <div className="mr-8 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-foreground/80">Thinking<span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" /></div>}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        {attachedKB && <div className="mb-2"><Badge variant="outline" className="border-violet-500/30 text-[10px] text-violet-300 gap-1"><Database className="h-3 w-3" /> {attachedKB.name}<button onClick={() => setAttachedKB(null)} className="ml-1 hover:text-foreground"><X className="h-2.5 w-2.5" /></button></Badge></div>}
        <div className="flex items-center gap-2">
          <button className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Voice input"><MicIcon className="h-4 w-4" /></button>
          <div className="relative">
            <button onClick={() => setKbOpen(!kbOpen)} className={`rounded-md p-2 transition ${attachedKB ? 'text-violet-300 bg-violet-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'}`} title="Attach knowledge base"><Database className="h-4 w-4" /></button>
            {kbOpen && <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-white/[0.08] bg-[hsl(240_14%_5%)] shadow-xl p-2 space-y-1 z-10">
              <div className="text-[10px] text-muted-foreground px-2 py-1">Attach Knowledge Base</div>
              {knowledgeBases.map((kb) => <button key={kb.id} onClick={() => { setAttachedKB(kb); setKbOpen(false) }} className="w-full rounded-md px-2 py-1.5 text-xs text-foreground/80 hover:bg-white/[0.06] transition text-left">{kb.name}</button>)}
            </div>}
          </div>
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Describe your creative task…" className="bg-black/20 flex-1" />
          <Button onClick={send} size="sm" className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2"><Button variant="outline" size="sm" className="border-white/10 text-xs"><Wand2 className="mr-1 h-3 w-3" /> Generate Pipeline</Button></div>
      </div>
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────
function Timeline() {
  const { timelineTracks, dropAssetOnTimeline } = useStudioStore()
  const [dragOverTrack, setDragOverTrack] = useState(null)
  const handleDrop = (e, trackId) => { e.preventDefault(); setDragOverTrack(null); try { const asset = JSON.parse(e.dataTransfer.getData('text/plain')); dropAssetOnTimeline(asset, trackId); toast.success('Asset added to timeline', { description: asset.name }) } catch {} }
  const isEmpty = timelineTracks.every((t) => t.clips.length === 0)
  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"><Play className="h-3 w-3" /></Button><span className="text-[10px] text-muted-foreground font-mono">00:00 / 00:00</span></div>
      </div>
      {isEmpty ? <div className="flex flex-col items-center justify-center h-[calc(100%-36px)] p-4"><div className="rounded-lg border border-dashed border-white/12 bg-white/[0.015] px-6 py-8 text-center max-w-xs"><GripVertical className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" /><p className="text-xs text-muted-foreground">Drag assets from the library or generate to populate the timeline.</p></div></div> : (
        <div className="p-2 space-y-1">
          {timelineTracks.map((track) => (
            <div key={track.id} onDragOver={(e) => { e.preventDefault(); setDragOverTrack(track.id) }} onDragLeave={() => setDragOverTrack(null)} onDrop={(e) => handleDrop(e, track.id)} className={`flex items-center gap-2 rounded transition ${dragOverTrack === track.id ? 'bg-cyan-500/[0.06]' : ''}`}>
              <div className="w-16 shrink-0 flex items-center gap-1"><GripVertical className="h-3 w-3 text-muted-foreground/50" /><span className="text-[10px] text-muted-foreground truncate">{track.label}</span></div>
              <div className="relative h-8 flex-1 rounded bg-white/[0.02] border border-white/[0.04]">
                {track.clips.map((clip, i) => <div key={clip.id || i} className={`absolute top-1 bottom-1 rounded bg-${track.color}-500/20 border border-${track.color}-500/30 flex items-center px-1.5 cursor-grab`} style={{ left: `${clip.start}%`, width: `${clip.width}%` }}><span className="text-[9px] text-foreground/70 truncate">{clip.label}</span></div>)}
              </div>
              <div className="w-8 flex items-center justify-center"><Volume2 className="h-3 w-3 text-muted-foreground/50" /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Scene Card ────────────────────────────────────────────────
function SceneCard({ scene, index, onUpdate, onRemove }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-2">
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Scene {index + 1}</span><button onClick={onRemove} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button></div>
      <Textarea value={scene.prompt} onChange={(e) => onUpdate({ ...scene, prompt: e.target.value })} placeholder={`Describe scene ${index + 1}…`} className="min-h-[50px] bg-black/20 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Duration — ${scene.duration}s`}><Slider value={[scene.duration]} onValueChange={([v]) => onUpdate({ ...scene, duration: v })} min={1} max={30} step={1} /></Field>
        <Field label="Transition"><Select value={scene.transition} onValueChange={(v) => onUpdate({ ...scene, transition: v })}><SelectTrigger className="bg-black/20 text-xs h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cut">Cut</SelectItem><SelectItem value="Fade">Fade</SelectItem><SelectItem value="Dissolve">Dissolve</SelectItem></SelectContent></Select></Field>
      </div>
    </div>
  )
}

// ─── MAIN STUDIO PAGE ──────────────────────────────────────────
export default function Studio() {
  const { generating, generatedAssets, simulateGeneration, uxMode } = useStudioStore()
  const getAssets = (type) => generatedAssets.filter((a) => a.type === type)

  // Chat state
  const [chatValues, setChatValues] = useState({})
  const [chatMessages, setChatMessages] = useState([])

  // Dynamic form values per tab
  const [imageValues, setImageValues] = useState({})
  const [videoValues, setVideoValues] = useState({})
  const [longvideoValues, setLongvideoValues] = useState({})
  const [musicValues, setMusicValues] = useState({})
  const [voiceValues, setVoiceValues] = useState({})
  const [avatarValues, setAvatarValues] = useState({})
  const [scrapeValues, setScrapeValues] = useState({})
  const [ragValues, setRagValues] = useState({})

  // Long-form scenes (special case: array of objects)
  const [scenes, setScenes] = useState([{ prompt: '', duration: 5, transition: 'Cut' }, { prompt: '', duration: 5, transition: 'Fade' }])

  // RAG search
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState([])

  // Panel state
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Studio" subtitle="Unified creative environment — generate, preview, and manage all AI capabilities." />
        <div className="flex items-center gap-2">
          <UxModeToggle />
          <div className="flex items-center gap-1 ml-2">
            <Button variant="outline" size="sm" onClick={() => setLeftPanelOpen(!leftPanelOpen)} className={`border-white/10 ${leftPanelOpen ? 'bg-white/10' : ''}`}><PanelLeftOpen className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setBottomPanelOpen(!bottomPanelOpen)} className={`border-white/10 ${bottomPanelOpen ? 'bg-white/10' : ''}`}><Layers className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className={`border-white/10 ${rightPanelOpen ? 'bg-white/10' : ''}`}><PanelRightOpen className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setAssetDrawerOpen(!assetDrawerOpen)} className={`border-white/10 ${assetDrawerOpen ? 'bg-white/10' : ''}`}><Package className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {/* Left Panel — Node Canvas */}
        {leftPanelOpen && <div className="w-56 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2"><Layers className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium text-muted-foreground">Canvas</span></div>
          <div className="flex-1 flex items-center justify-center p-4"><div className="text-center text-muted-foreground"><Layers className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-xs">Drag nodes here</p></div></div>
          <div className="border-t border-white/[0.06] p-2 space-y-1">{['Script', 'Voice', 'Video', 'Image'].map((n) => <div key={n} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground cursor-grab transition"><GripVertical className="h-3 w-3" />{n}</div>)}</div>
        </div>}

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <Tabs defaultValue="chat" className="flex-1">
            <div className="overflow-x-auto hide-scrollbar">
              <TabsList className="flex w-max gap-1 bg-white/[0.03] p-1">
                {TABS.map((t) => <TabsTrigger key={t.v} value={t.v} className="gap-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground"><t.icon className="h-3.5 w-3.5" /> {t.label}</TabsTrigger>)}
              </TabsList>
            </div>

            {/* ── 1. CHAT/TEXT (DynamicFormRenderer) ── */}
            <TabsContent value="chat" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.chat} values={chatValues} onChange={setChatValues} mode={uxMode} capability="chat" />
                  <Button onClick={() => {
                    const prompt = chatValues.prompt
                    if (!prompt?.trim()) return
                    setChatMessages((p) => [...p, { role: 'user', content: prompt }])
                    setChatValues((v) => ({ ...v, prompt: '' }))
                    setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'This is a simulated response. In production, this will be powered by the AI provider pipeline.' }]), 1500)
                  }} disabled={!chatValues.prompt?.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="mr-1.5 h-4 w-4" /> Send</Button>
                </div>}
                output={<div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 min-h-[400px] max-h-[500px] overflow-y-auto space-y-3">
                  {chatMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-8 w-8 mb-2 opacity-30" /><span className="text-xs">Send a message to start</span></div>}
                  {chatMessages.map((m, i) => <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>{m.content}</div>)}
                </div>}
              /></Card>
            </TabsContent>

            {/* ── 2. IMAGE (DynamicFormRenderer) ── */}
            <TabsContent value="image" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.image} values={imageValues} onChange={setImageValues} mode={uxMode} capability="image" />
                  <GenerateButton capability="image.generate" formValues={imageValues} />
                </div>}
                output={<div className="space-y-4">
                  {generating.image ? <div className="space-y-2"><div className="h-48 w-full rounded-lg bg-white/[0.04] animate-pulse" /><div className="flex gap-2"><div className="h-3 w-24 rounded bg-white/[0.04] animate-pulse" /><div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" /></div></div> :
                    getAssets('image').length > 0 ? <div className="grid grid-cols-2 gap-2">{getAssets('image').slice(-4).map((a) => <div key={a.id} className={`relative aspect-square rounded-lg border border-white/[0.06] bg-gradient-to-br ${a.gradient} flex items-center justify-center group`}><ImageIcon className="h-8 w-8 text-foreground/20" /><div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex gap-1"><Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40"><Download className="h-3 w-3" /></Button><Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40">Upscale</Button></div></div>)}</div> :
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10"><ImageIcon className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Generated images will appear here</span></div>}
                </div>}
              /></Card>
            </TabsContent>

            {/* ── 3. VIDEO (DynamicFormRenderer) ── */}
            <TabsContent value="video" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.video} values={videoValues} onChange={setVideoValues} mode={uxMode} capability="video" />
                  <GenerateButton capability="video.generate" formValues={videoValues} />
                </div>}
                output={<div className="space-y-4">{generating.video ? <div className="h-64 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Generated video" />}</div>}
              /></Card>
            </TabsContent>

            {/* ── 4. LONG-FORM VIDEO (Storyboard + DynamicFormRenderer) ── */}
            <TabsContent value="longvideo" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.longvideo} values={longvideoValues} onChange={setLongvideoValues} mode={uxMode} capability="longvideo" />
                  {/* Scene Planner (special: array of objects) */}
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">Scene Planner</span><Button variant="outline" size="sm" onClick={() => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'Cut' }])} className="border-white/10 text-xs"><Plus className="mr-1 h-3 w-3" /> Add Scene</Button></div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {scenes.map((scene, i) => <SceneCard key={i} scene={scene} index={i} onUpdate={(d) => setScenes((p) => p.map((s, idx) => idx === i ? d : s))} onRemove={() => setScenes((p) => p.filter((_, idx) => idx !== i))} />)}
                  </div>
                  <GenerateButton capability="video.longform" label="Generate Video" />
                </div>}
                output={<div className="space-y-4">{generating.longvideo ? <div className="h-64 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Final stitched preview" />}</div>}
              /></Card>
            </TabsContent>

            {/* ── 5. MUSIC (DynamicFormRenderer) ── */}
            <TabsContent value="music" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="song" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="song">Song</TabsTrigger><TabsTrigger value="lyrics">Lyrics</TabsTrigger><TabsTrigger value="instrumental">Instrumental</TabsTrigger><TabsTrigger value="cover">Cover Art</TabsTrigger><TabsTrigger value="video">Music Video</TabsTrigger><TabsTrigger value="promo">Promo Pack</TabsTrigger></TabsList>
                  <TabsContent value="song" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.music} values={musicValues} onChange={setMusicValues} mode={uxMode} capability="music" />
                      <GenerateButton capability="music.generate" formValues={musicValues} />
                    </div>}
                    output={<div className="space-y-4">{generating.music ? <div className="h-24 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : getAssets('audio').length > 0 ? <MediaPreview type="audio" title="Generated track" /> : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10"><Music className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Generated tracks will appear here</span></div>}</div>}
                  /></TabsContent>
                  <TabsContent value="lyrics" className="mt-4"><div className="space-y-4"><Field label="Custom Lyrics"><Textarea placeholder="[Verse 1]&#10;Write your lyrics here…&#10;&#10;[Chorus]&#10;…" className="min-h-[200px] bg-black/20 font-mono text-sm" /></Field><Button className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Sparkles className="mr-1.5 h-4 w-4" /> Generate from Lyrics</Button></div></TabsContent>
                  <TabsContent value="instrumental" className="mt-4"><div className="space-y-4"><Field label="Describe the Instrumental"><Textarea placeholder="A cinematic orchestral piece…" className="min-h-[80px] bg-black/20" /></Field><GenerateButton capability="music.generate" label="Generate Instrumental" /></div></TabsContent>
                  <TabsContent value="cover" className="mt-4"><div className="space-y-4"><Field label="Cover Art Concept"><Textarea placeholder="Describe the album cover…" className="min-h-[80px] bg-black/20" /></Field><GenerateButton capability="image.generate" label="Generate Cover Art" /></div></TabsContent>
                  <TabsContent value="video" className="mt-4"><div className="space-y-4"><Field label="Music Video Concept"><Textarea placeholder="Describe the music video…" className="min-h-[80px] bg-black/20" /></Field><GenerateButton capability="video.generate" label="Generate Music Video" /></div></TabsContent>
                  <TabsContent value="promo" className="mt-4"><div className="space-y-4"><p className="text-sm text-muted-foreground">Generate a complete promo pack: cover art, social clips, and audio teasers.</p><Button className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Sparkles className="mr-1.5 h-4 w-4" /> Generate Promo Pack</Button></div></TabsContent>
                </Tabs>
              </Card>
            </TabsContent>

            {/* ── 6. VOICE (DynamicFormRenderer) ── */}
            <TabsContent value="voice" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="tts" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="tts">Text-to-Speech</TabsTrigger><TabsTrigger value="stt">Speech-to-Text</TabsTrigger><TabsTrigger value="dubbing">Dubbing</TabsTrigger><TabsTrigger value="library">Voice Library</TabsTrigger><TabsTrigger value="subtitles">Subtitles</TabsTrigger></TabsList>
                  <TabsContent value="tts" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.voice} values={voiceValues} onChange={setVoiceValues} mode={uxMode} capability="voice" />
                      <GenerateButton capability="voice.tts" formValues={voiceValues} />
                    </div>}
                    output={<div className="space-y-4">{generating.voice ? <div className="h-24 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="audio" title="Synthesized voice" />}<Button variant="outline" size="sm" className="w-full border-white/10 text-xs"><Download className="mr-1 h-3 w-3" /> Export SRT</Button></div>}
                  /></TabsContent>
                  <TabsContent value="stt" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Audio/Video File"><DropZone accept="audio/*,video/*" label="Drop audio or video" kind="media" /></Field><GenerateButton capability="voice.stt" label="Transcribe" /></div>} output={<MediaPreview type="text" title="Transcription will appear here" />} /></TabsContent>
                  <TabsContent value="dubbing" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Source Video"><DropZone accept="video/*" label="Drop video" kind="video" /></Field><Field label="Target Language"><Select defaultValue="es"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="es">Spanish</SelectItem><SelectItem value="fr">French</SelectItem><SelectItem value="de">German</SelectItem><SelectItem value="pt">Portuguese</SelectItem></SelectContent></Select></Field><GenerateButton capability="voice.tts" label="Dub Video" /></div>} output={<MediaPreview type="video" title="Dubbed video will appear here" />} /></TabsContent>
                  <TabsContent value="library" className="mt-4"><div className="grid grid-cols-2 gap-3">{['Nova', 'Onyx', 'Aria', 'Tara', 'Echo', 'Shimmer'].map((v) => <div key={v} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center"><Mic className="h-4 w-4 text-cyan-300" /></div><div><div className="text-sm font-medium">{v}</div><div className="text-[10px] text-muted-foreground">Preview available</div></div></div>)}</div></TabsContent>
                  <TabsContent value="subtitles" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Source Media"><DropZone accept="video/*,audio/*" label="Drop video or audio" kind="media" /></Field><Field label="Language"><Select defaultValue="en"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="auto">Auto-detect</SelectItem></SelectContent></Select></Field><GenerateButton capability="voice.stt" label="Generate Subtitles" /></div>} output={<MediaPreview type="text" title="SRT subtitle file will appear here" />} /></TabsContent>
                </Tabs>
              </Card>
            </TabsContent>

            {/* ── 7. AVATAR (DynamicFormRenderer) ── */}
            <TabsContent value="avatar" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="talking" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="library">Library</TabsTrigger><TabsTrigger value="create">Create</TabsTrigger><TabsTrigger value="talking">Talking Head</TabsTrigger><TabsTrigger value="presenter">Presenter</TabsTrigger><TabsTrigger value="lipsync">Lipsync</TabsTrigger><TabsTrigger value="voice">Voice Binding</TabsTrigger></TabsList>
                  <TabsContent value="talking" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.avatar} values={avatarValues} onChange={setAvatarValues} mode={uxMode} capability="avatar" />
                      <GenerateButton capability="avatar.generate" label="Generate Talking Head" formValues={avatarValues} />
                    </div>}
                    output={<div className="space-y-4">{generating.avatar ? <div className="h-64 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Talking head video" />}</div>}
                  /></TabsContent>
                  <TabsContent value="library" className="mt-4"><div className="grid grid-cols-3 gap-3">{['Ava', 'Kai', 'Mara', 'Leo', 'Zoe', 'Rex'].map((n, i) => <button key={n} className={`rounded-lg border p-3 text-center transition ${i === 0 ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}><div className="mx-auto mb-2 h-16 w-16 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30" /><span className="text-xs font-medium">{n}</span></button>)}</div></TabsContent>
                  <TabsContent value="create" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Describe the Avatar"><Textarea placeholder="Describe the avatar appearance…" className="min-h-[80px] bg-black/20" /></Field><GenerateButton capability="image.generate" label="Generate Avatar" /></div>} output={<MediaPreview type="image" title="Generated avatar" />} /></TabsContent>
                  <TabsContent value="presenter" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Script"><Textarea placeholder="Presenter script…" className="min-h-[80px] bg-black/20" /></Field><Field label="Presenter Style"><Select defaultValue="professional"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">Professional</SelectItem><SelectItem value="casual">Casual</SelectItem><SelectItem value="energetic">Energetic</SelectItem></SelectContent></Select></Field><GenerateButton capability="avatar.generate" label="Generate Presenter" /></div>} output={<MediaPreview type="video" title="Presenter video" />} /></TabsContent>
                  <TabsContent value="lipsync" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Face Video"><DropZone accept="video/*" label="Drop face video" kind="video" /></Field><Field label="Audio Track"><DropZone accept="audio/*" label="Drop audio" kind="audio" /></Field><GenerateButton capability="avatar.generate" label="Generate Lipsync" /></div>} output={<MediaPreview type="video" title="Lipsync video" />} /></TabsContent>
                  <TabsContent value="voice" className="mt-4"><IOLayout input={<div className="space-y-4"><Field label="Avatar"><Select defaultValue="ava"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ava">Ava</SelectItem><SelectItem value="kai">Kai</SelectItem><SelectItem value="mara">Mara</SelectItem></SelectContent></Select></Field><Field label="Voice"><Select defaultValue="nova"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nova">Nova</SelectItem><SelectItem value="onyx">Onyx</SelectItem><SelectItem value="aria">Aria</SelectItem></SelectContent></Select></Field><Button className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black">Bind Voice</Button></div>} output={<div className="text-sm text-muted-foreground text-center py-12">Select an avatar and voice to create a binding.</div>} /></TabsContent>
                </Tabs>
              </Card>
            </TabsContent>

            {/* ── 8. SCRAPE/BRAND (DynamicFormRenderer) ── */}
            <TabsContent value="scrape" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.scrape} values={scrapeValues} onChange={setScrapeValues} mode={uxMode} capability="scrape" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 border-cyan-500/30 text-cyan-300 text-xs"><Sparkles className="mr-1 h-3 w-3" /> Save as Brand Pack</Button>
                    <Button variant="outline" size="sm" className="flex-1 border-violet-500/30 text-violet-300 text-xs"><Database className="mr-1 h-3 w-3" /> Create RAG Knowledge Set</Button>
                  </div>
                  <GenerateButton capability="scrape.crawl" label="Start Scraping" formValues={scrapeValues} />
                </div>}
                output={<div className="space-y-3">
                  {generating.scrape ? <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 w-full rounded-lg bg-white/[0.04] animate-pulse" />)}</div> : <>
                    <ExtractedDataCard icon={Palette} title="Colors" items={['#22D3EE', '#8B5CF6', '#F0ABFC', '#0B0B12', '#FFFFFF']} />
                    <ExtractedDataCard icon={Type} title="Typography" items={['Inter', 'Space Grotesk', 'monospace']} />
                    <ExtractedDataCard icon={Globe} title="Brand Summary" items={['Enterprise AI', 'SaaS Platform', 'B2B']} />
                    <ExtractedDataCard icon={FileText} title="Pricing" items={['$99/mo Starter', '$299/mo Pro', '$999/mo Enterprise']} />
                  </>}
                </div>}
              /></Card>
            </TabsContent>

            {/* ── 9. RAG/KNOWLEDGE (DynamicFormRenderer) ── */}
            <TabsContent value="rag" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <DynamicFormRenderer schema={CAPABILITY_SCHEMAS.rag} values={ragValues} onChange={setRagValues} mode={uxMode} capability="rag" />
                  <GenerateButton capability="rag.ingest" label="Build Knowledge Set" formValues={ragValues} />
                </div>}
                output={<div className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Search your knowledge base…" className="bg-black/20 flex-1" />
                    <Button variant="outline" size="sm" className="border-white/10" onClick={() => { if (!ragQuery.trim()) return; setRagResults([{ text: 'AmarktAI Network provides enterprise AI orchestration capabilities including text, image, video, and audio generation.', score: 0.94, source: 'brand-guide.pdf' }, { text: 'The system uses a multi-provider routing strategy to optimize for cost, latency, and quality.', score: 0.87, source: 'architecture.md' }, { text: 'Connected apps receive their own API keys, capability scopes, and daily budget limits.', score: 0.82, source: 'api-docs.pdf' }]) }}><Search className="h-4 w-4" /></Button>
                  </div>
                  {ragResults.length > 0 ? <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">{ragResults.length} results found</div>
                    {ragResults.map((r, i) => <div key={i} className="rounded-lg border border-white/[0.06] bg-black/20 p-3"><div className="flex items-center justify-between mb-1.5"><span className="text-[10px] text-muted-foreground">{r.source}</span><Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">{(r.score * 100).toFixed(0)}% match</Badge></div><p className="text-xs text-foreground/80">{r.text}</p></div>)}
                  </div> : <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10"><Database className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Search results will appear here</span></div>}
                </div>}
              /></Card>
            </TabsContent>
          </Tabs>

          {/* Bottom Panel — Timeline */}
          {bottomPanelOpen && <div className="h-48 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden"><Timeline /></div>}
        </div>

        {/* Right Panel — Director Chat */}
        {rightPanelOpen && <div className="w-80 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden"><DirectorChat /></div>}
      </div>

      <AssetLibraryDrawer open={assetDrawerOpen} onClose={() => setAssetDrawerOpen(false)} />
    </PageTransition>
  )
}
