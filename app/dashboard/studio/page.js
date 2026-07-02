'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
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
  Play, Pause, Plus, Trash2, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Wand2, Package, Sliders,
  Download, Settings, Palette, Type, Sparkles, Loader2, ChevronRight, X,
  Search, Copy, Eye
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

// ─── I/O Layout Wrapper ────────────────────────────────────────
function IOLayout({ input, output, inputLabel = 'Controls', outputLabel = 'Preview' }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <Sliders className="h-3 w-3" /> {inputLabel}
        </div>
        {input}
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <Eye className="h-3 w-3" /> {outputLabel}
        </div>
        {output}
      </div>
    </div>
  )
}

// ─── Generate Button ───────────────────────────────────────────
function GenerateButton({ type, label = 'Generate', payload, disabled, onGenerate }) {
  const { generating, simulateGeneration } = useStudioStore()
  const key = type.split('.')[0]
  const busy = generating[key]

  const handleGenerate = async () => {
    if (onGenerate) { onGenerate(); return }
    await simulateGeneration(type, { title: payload?.title || `${type} output` })
    toast.success('Generation complete', { description: `${type} · asset added to library` })
  }

  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
      <span className="text-xs text-muted-foreground">Runs as a background job.</span>
      <Button onClick={handleGenerate} disabled={disabled || busy} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
        {busy ? 'Generating…' : label}
      </Button>
    </div>
  )
}

// ─── Generating Skeleton ───────────────────────────────────────
function GeneratingSkeleton({ type = 'image' }) {
  if (type === 'image') return (
    <div className="space-y-2">
      <Skeleton className="h-48 w-full rounded-lg bg-white/[0.04]" />
      <div className="flex gap-2"><Skeleton className="h-3 w-24 bg-white/[0.04]" /><Skeleton className="h-3 w-16 bg-white/[0.04]" /></div>
    </div>
  )
  if (type === 'video') return <Skeleton className="h-64 w-full rounded-lg bg-white/[0.04]" />
  if (type === 'audio') return <Skeleton className="h-24 w-full rounded-lg bg-white/[0.04]" />
  return <Skeleton className="h-32 w-full rounded-lg bg-white/[0.04]" />
}

// ─── Director Chat ─────────────────────────────────────────────
function DirectorChat() {
  const { chatHistory, addChatMessage, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const [attachedKB, setAttachedKB] = useState(null)
  const [kbOpen, setKbOpen] = useState(false)
  const scrollRef = useRef(null)

  const knowledgeBases = [
    { id: 'brand-guide', name: 'Brand Guide', entries: 142 },
    { id: 'product-docs', name: 'Product Documentation', entries: 87 },
  ]

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])

  const send = () => {
    if (!input.trim()) return
    const msg = attachedKB ? `${input}\n\n[Context: ${attachedKB.name}]` : input
    setInput('')
    useStudioStore.getState().simulateChatResponse(msg)
  }

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
        {generating.chat && (
          <div className="mr-8 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-foreground/80">
            <span className="inline-flex items-center gap-1">Thinking<span className="inline-block h-3 w-px animate-pulse bg-cyan-400 ml-0.5" /></span>
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        {attachedKB && (
          <div className="mb-2">
            <Badge variant="outline" className="border-violet-500/30 text-[10px] text-violet-300 gap-1">
              <Database className="h-3 w-3" /> {attachedKB.name}
              <button onClick={() => setAttachedKB(null)} className="ml-1 hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title="Voice input"><MicIcon className="h-4 w-4" /></button>
          <div className="relative">
            <button onClick={() => setKbOpen(!kbOpen)} className={`rounded-md p-2 transition ${attachedKB ? 'text-violet-300 bg-violet-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'}`} title="Attach knowledge base">
              <Database className="h-4 w-4" />
            </button>
            {kbOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-white/[0.08] bg-[hsl(240_14%_5%)] shadow-xl p-2 space-y-1 z-10">
                <div className="text-[10px] text-muted-foreground px-2 py-1">Attach Knowledge Base</div>
                {knowledgeBases.map((kb) => (
                  <button key={kb.id} onClick={() => { setAttachedKB(kb); setKbOpen(false) }}
                    className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground/80 hover:bg-white/[0.06] transition">
                    <span>{kb.name}</span><span className="text-[10px] text-muted-foreground">{kb.entries}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Describe your creative task…" className="bg-black/20 flex-1" />
          <Button onClick={send} size="sm" className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/10 text-xs"><Wand2 className="mr-1 h-3 w-3" /> Generate Pipeline</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────
function Timeline() {
  const { timelineTracks, dropAssetOnTimeline } = useStudioStore()
  const [dragOverTrack, setDragOverTrack] = useState(null)

  const handleDrop = (e, trackId) => {
    e.preventDefault()
    setDragOverTrack(null)
    try {
      const asset = JSON.parse(e.dataTransfer.getData('text/plain'))
      dropAssetOnTimeline(asset, trackId)
      toast.success('Asset added to timeline', { description: `${asset.title} → ${trackId} track` })
    } catch {}
  }

  const isEmpty = timelineTracks.every((t) => t.clips.length === 0)

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"><Play className="h-3 w-3" /></Button>
          <span className="text-[10px] text-muted-foreground font-mono">00:00 / {isEmpty ? '00:00' : '00:15'}</span>
        </div>
      </div>
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[calc(100%-36px)] p-4 text-center">
          <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.015] px-6 py-8 max-w-xs">
            <GripVertical className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Drag assets from the library or run a generation to populate the timeline.</p>
          </div>
        </div>
      ) : (
        <div className="p-2 space-y-1">
          {timelineTracks.map((track) => (
            <div key={track.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverTrack(track.id) }}
              onDragLeave={() => setDragOverTrack(null)}
              onDrop={(e) => handleDrop(e, track.id)}
              className={`flex items-center gap-2 rounded transition ${dragOverTrack === track.id ? 'bg-cyan-500/[0.06]' : ''}`}>
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
      )}
    </div>
  )
}

// ─── Node Canvas ───────────────────────────────────────────────
function NodeCanvas() {
  const { nodeStates, resetNodeState } = useStudioStore()
  const nodes = [
    { id: 'chat', label: 'Chat/Text', icon: MessageSquare },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'longvideo', label: 'Long-form', icon: Film },
    { id: 'music', label: 'Music', icon: Music },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'avatar', label: 'Avatar', icon: User },
    { id: 'scrape', label: 'Scrape', icon: Globe },
    { id: 'rag', label: 'RAG', icon: Database },
  ]

  const statusStyles = {
    idle: 'bg-white/5 text-muted-foreground border-white/10',
    processing: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
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
        const state = nodeStates[node.id] || 'idle'
        return (
          <div key={node.id} className={`flex items-center gap-3 rounded-lg border p-3 transition hover:border-white/20 ${statusStyles[state]}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{node.label}</div>
              <div className="text-[10px] opacity-60 capitalize">{state}</div>
            </div>
            {state === 'complete' && (
              <button onClick={() => resetNodeState(node.id)} className="text-emerald-400 hover:text-emerald-300 text-[10px]">Reset</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── MAIN STUDIO PAGE ──────────────────────────────────────────
export default function Studio() {
  const { generating, generatedAssets, simulateGeneration } = useStudioStore()

  // Form state
  const [prompt, setPrompt] = useState('')
  const [system, setSystem] = useState('')
  const [aspect, setAspect] = useState('1:1')
  const [quality, setQuality] = useState('standard')
  const [dim, setDim] = useState([1024])
  const [ttsText, setTtsText] = useState('')
  const [url, setUrl] = useState('')
  const [chunk, setChunk] = useState([800])
  const [gesture, setGesture] = useState([50])
  const [temp, setTemp] = useState([0.7])
  const [voice, setVoice] = useState('nova')
  const [speed, setSpeed] = useState([1])
  const [crawlDepth, setCrawlDepth] = useState([2])

  // Long-form scenes
  const [scenes, setScenes] = useState([
    { prompt: '', duration: 5, transition: 'cut', voiceover: 'none', music: 'ambient' },
    { prompt: '', duration: 5, transition: 'fade', voiceover: 'none', music: 'ambient' },
  ])

  // RAG search
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState([])

  // Chat output for text tab
  const [chatMessages, setChatMessages] = useState([])

  // Panel state
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)

  const addScene = () => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'cut', voiceover: 'none', music: 'ambient' }])
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

  // Get assets by type for preview panels
  const getAssets = (type) => generatedAssets.filter((a) => a.type === type)

  return (
    <PageTransition className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Studio" subtitle="Unified creative environment — generate, preview, and manage all AI capabilities." />
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
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  inputLabel="Input"
                  outputLabel="Chat History"
                  input={
                    <div className="space-y-4">
                      <Field label="System guide"><Textarea value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful enterprise assistant…" className="min-h-[80px] bg-black/20" /></Field>
                      <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything…" className="min-h-[80px] bg-black/20" /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tone"><Select defaultValue="professional"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">Professional</SelectItem><SelectItem value="casual">Casual</SelectItem><SelectItem value="creative">Creative</SelectItem><SelectItem value="technical">Technical</SelectItem></SelectContent></Select></Field>
                        <Field label="Audience"><Select defaultValue="general"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="technical">Technical</SelectItem><SelectItem value="executive">Executive</SelectItem></SelectContent></Select></Field>
                      </div>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label={`Temperature — ${temp[0].toFixed(2)}`}><Slider value={temp} onValueChange={setTemp} min={0} max={2} step={0.05} /></Field>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Reasoning mode</span><Switch /></div>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">JSON output</span><Switch /></div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <Button onClick={() => {
                        if (!prompt.trim()) return
                        setChatMessages((p) => [...p, { role: 'user', content: prompt }])
                        setPrompt('')
                        setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'This is a simulated response. In production, this will be powered by the AI provider pipeline.' }]), 1500)
                      }} disabled={!prompt.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
                        <Send className="mr-1.5 h-4 w-4" /> Send
                      </Button>
                    </div>
                  }
                  output={
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 min-h-[400px] max-h-[500px] overflow-y-auto space-y-3">
                      {chatMessages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                          <span className="text-xs">Send a message to start chatting</span>
                        </div>
                      )}
                      {chatMessages.map((m, i) => (
                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>
                          {m.content}
                        </div>
                      ))}
                    </div>
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 2. Image ── */}
            <TabsContent value="image" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A cinematic obsidian data center…" className="min-h-[80px] bg-black/20" /></Field>
                      <Field label="Style"><Select defaultValue="photorealistic"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="photorealistic">Photorealistic</SelectItem><SelectItem value="illustration">Illustration</SelectItem><SelectItem value="3d">3D Render</SelectItem><SelectItem value="anime">Anime</SelectItem><SelectItem value="pixel">Pixel Art</SelectItem></SelectContent></Select></Field>
                      <Field label="Aspect ratio"><div className="grid grid-cols-4 gap-2">{['1:1', '16:9', '9:16', '4:3'].map((a) => (<button key={a} onClick={() => setAspect(a)} className={`rounded-md border px-2 py-2 text-sm transition ${aspect === a ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>{a}</button>))}</div></Field>
                      <Field label="Reference image"><DropZone accept="image/*" label="Drop reference image" kind="image" compact /></Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label="Negative prompt"><Textarea placeholder="Elements to exclude…" className="min-h-[60px] bg-black/20" /></Field>
                            <Field label="Seed (0 = random)"><Input type="number" defaultValue={0} className="bg-black/20" /></Field>
                            <Field label={`Quality — ${quality}`}><Select value={quality} onValueChange={setQuality}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="ultra">Ultra</SelectItem></SelectContent></Select></Field>
                            <Field label={`Scale — ${dim[0]}px`}><Slider value={dim} onValueChange={setDim} min={512} max={2048} step={128} /></Field>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="image.generate" payload={{ title: 'Generated image' }} />
                    </div>
                  }
                  output={
                    generating.image ? <GeneratingSkeleton type="image" /> :
                    getAssets('image').length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {getAssets('image').slice(-4).map((asset) => (
                          <div key={asset.id} className={`relative aspect-square rounded-lg border border-white/[0.06] bg-gradient-to-br ${asset.gradient} flex items-center justify-center group`}>
                            <ImageIcon className="h-8 w-8 text-foreground/20" />
                            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40"><Download className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40">Upscale</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                        <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
                        <span className="text-xs">Generated images will appear here</span>
                      </div>
                    )
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 3. Video ── */}
            <TabsContent value="video" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Prompt"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Slow dolly across neon skyline…" className="min-h-[80px] bg-black/20" /></Field>
                      <Field label="Mode"><Select defaultValue="text-to-video"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text-to-video">Text to Video</SelectItem><SelectItem value="image-to-video">Image to Video</SelectItem><SelectItem value="video-to-video">Video to Video</SelectItem></SelectContent></Select></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Camera"><Select defaultValue="dolly"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="static">Static</SelectItem><SelectItem value="pan">Pan</SelectItem><SelectItem value="dolly">Dolly</SelectItem><SelectItem value="orbit">Orbit</SelectItem></SelectContent></Select></Field>
                        <Field label="Duration"><Select defaultValue="5"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="3">3 seconds</SelectItem><SelectItem value="5">5 seconds</SelectItem><SelectItem value="10">10 seconds</SelectItem></SelectContent></Select></Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="First frame"><DropZone accept="image/*" label="Drop first frame" kind="image" compact /></Field>
                        <Field label="Last frame"><DropZone accept="image/*" label="Drop last frame" kind="image" compact /></Field>
                      </div>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label="Lens type"><Select defaultValue="standard"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wide">Wide</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="telephoto">Telephoto</SelectItem></SelectContent></Select></Field>
                            <Field label="Motion strength"><Slider defaultValue={[50]} min={0} max={100} step={1} /></Field>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="video.generate" payload={{ title: 'Generated video' }} />
                    </div>
                  }
                  output={
                    generating.video ? <GeneratingSkeleton type="video" /> :
                    getAssets('video').length > 0 ? (
                      <MediaPreview type="video" title="Generated video" className="min-h-[300px]" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                        <Film className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Generated videos will appear here</span>
                      </div>
                    )
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 4. Long-form Video (Storyboard) ── */}
            <TabsContent value="longvideo" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Scene Storyboard</span>
                        <Button variant="outline" size="sm" onClick={addScene} className="border-white/10 text-xs"><Plus className="mr-1 h-3 w-3" /> Add Scene</Button>
                      </div>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                        {scenes.map((scene, i) => (
                          <div key={i} className="rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Scene {i + 1}</span>
                              <button onClick={() => removeScene(i)} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
                            </div>
                            <Textarea value={scene.prompt} onChange={(e) => updateScene(i, { ...scene, prompt: e.target.value })} placeholder={`Describe scene ${i + 1}…`} className="min-h-[50px] bg-black/20 text-xs" />
                            <div className="grid grid-cols-2 gap-2">
                              <Field label={`Duration — ${scene.duration}s`}><Slider value={[scene.duration]} onValueChange={([v]) => updateScene(i, { ...scene, duration: v })} min={1} max={30} step={1} /></Field>
                              <Field label="Transition"><Select value={scene.transition} onValueChange={(v) => updateScene(i, { ...scene, transition: v })}><SelectTrigger className="bg-black/20 text-xs h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cut">Cut</SelectItem><SelectItem value="fade">Fade</SelectItem><SelectItem value="dissolve">Dissolve</SelectItem><SelectItem value="wipe">Wipe</SelectItem></SelectContent></Select></Field>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Global voiceover"><Select defaultValue="none"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="ai">AI Voice</SelectItem></SelectContent></Select></Field>
                        <Field label="Music bed"><Select defaultValue="ambient"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="ambient">Ambient</SelectItem><SelectItem value="cinematic">Cinematic</SelectItem><SelectItem value="upbeat">Upbeat</SelectItem></SelectContent></Select></Field>
                      </div>
                      <GenerateButton type="video.longform" payload={{ title: 'Long-form video' }} />
                    </div>
                  }
                  output={
                    generating.longvideo ? <GeneratingSkeleton type="video" /> :
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                      <Film className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Final stitched preview will appear here</span>
                    </div>
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 5. Music ── */}
            <TabsContent value="music" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Describe your song"><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="An upbeat electronic track with synth pads…" className="min-h-[80px] bg-black/20" /></Field>
                      <Field label="Lyrics (optional)"><Textarea placeholder="Write your lyrics here…" className="min-h-[60px] bg-black/20" /></Field>
                      <Field label="Genre"><div className="flex flex-wrap gap-1.5">{MUSIC_GENRES.slice(0, 8).map((g) => <Badge key={g} variant="outline" className="border-white/10 cursor-pointer hover:border-cyan-500/30 hover:text-cyan-300 transition text-[10px]">{g}</Badge>)}</div></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Mood"><Select defaultValue="energetic"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="energetic">Energetic</SelectItem><SelectItem value="chill">Chill</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="happy">Happy</SelectItem><SelectItem value="melancholic">Melancholic</SelectItem></SelectContent></Select></Field>
                        <Field label="Vocal style"><Select defaultValue="none"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Instrumental</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="group">Group</SelectItem><SelectItem value="rap">Rap</SelectItem><SelectItem value="choir">Choir</SelectItem></SelectContent></Select></Field>
                      </div>
                      <Field label="Reference track"><DropZone accept="audio/*" label="Drop reference audio" kind="audio" compact /></Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label="Tempo"><Select defaultValue="medium"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="slow">Slow (60-90 BPM)</SelectItem><SelectItem value="medium">Medium (90-130 BPM)</SelectItem><SelectItem value="fast">Fast (130-180 BPM)</SelectItem></SelectContent></Select></Field>
                            <Field label="Key / Scale"><Select defaultValue="auto"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="c-major">C Major</SelectItem><SelectItem value="c-minor">C Minor</SelectItem><SelectItem value="g-major">G Major</SelectItem></SelectContent></Select></Field>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Hook-first arrangement</span><Switch /></div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="music.generate" payload={{ title: 'Generated track' }} />
                    </div>
                  }
                  output={
                    generating.music ? <GeneratingSkeleton type="audio" /> :
                    getAssets('audio').length > 0 ? (
                      <MediaPreview type="audio" title="Generated track" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                        <Music className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Generated tracks will appear here</span>
                      </div>
                    )
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 6. Voice ── */}
            <TabsContent value="voice" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Script" hint={`${ttsText.length} chars`}><Textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Enter text to synthesize…" className="min-h-[100px] bg-black/20" /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Voice type"><Select value={voice} onValueChange={setVoice}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nova">Nova (Female)</SelectItem><SelectItem value="onyx">Onyx (Male)</SelectItem><SelectItem value="aria">Aria (Female)</SelectItem><SelectItem value="tara">Tara (Female)</SelectItem></SelectContent></Select></Field>
                        <Field label="Emotion"><Select defaultValue="neutral"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Neutral</SelectItem><SelectItem value="happy">Happy</SelectItem><SelectItem value="serious">Serious</SelectItem><SelectItem value="excited">Excited</SelectItem></SelectContent></Select></Field>
                      </div>
                      <Field label="Clone voice audio"><DropZone accept="audio/*" label="Drop audio for voice cloning" kind="audio" compact /></Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label={`Speed — ${speed[0].toFixed(1)}x`}><Slider value={speed} onValueChange={setSpeed} min={0.5} max={2} step={0.1} /></Field>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">SSML mode</span><Switch /></div>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Noise reduction</span><Switch /></div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="voice.tts" payload={{ title: 'Voice synthesis' }} />
                    </div>
                  }
                  output={
                    generating.voice ? <GeneratingSkeleton type="audio" /> :
                    getAssets('audio').length > 0 ? (
                      <div className="space-y-3">
                        <MediaPreview type="audio" title="Voice synthesis" />
                        <Button variant="outline" size="sm" className="w-full border-white/10 text-xs"><Download className="mr-1 h-3 w-3" /> Export SRT</Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                        <Mic className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Synthesized audio will appear here</span>
                      </div>
                    )
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 7. Avatar ── */}
            <TabsContent value="avatar" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Reference face"><DropZone accept="image/*" label="Drop face image" kind="image" compact /></Field>
                        <Field label="Lip-sync audio"><DropZone accept="audio/*" label="Drop audio" kind="audio" compact /></Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Background"><Select defaultValue="transparent"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="transparent">Transparent</SelectItem><SelectItem value="studio">Studio</SelectItem><SelectItem value="office">Office</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></Field>
                        <Field label={`Gesture intensity — ${gesture[0]}%`}><Slider value={gesture} onValueChange={setGesture} min={0} max={100} step={1} /></Field>
                      </div>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Approval required</span><Switch /></div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="avatar.generate" payload={{ title: 'Avatar video' }} />
                    </div>
                  }
                  output={
                    generating.avatar ? <GeneratingSkeleton type="video" /> :
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10">
                      <User className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Talking head video will appear here</span>
                    </div>
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 8. Scrape/Brand ── */}
            <TabsContent value="scrape" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Website URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://brand.example.com" className="bg-black/20" /></Field>
                      <Field label={`Crawl depth — ${crawlDepth[0]}`}><Slider value={crawlDepth} onValueChange={setCrawlDepth} min={1} max={5} step={1} /></Field>
                      <Field label="Extract elements"><div className="grid grid-cols-3 gap-2">{['Logo', 'Colors', 'Fonts', 'Pricing', 'Team', 'Contact', 'Social', 'Products', 'FAQ'].map((el) => (<label key={el} className="flex items-center gap-1.5 text-xs"><Switch defaultChecked={['Logo', 'Colors'].includes(el)} /> {el}</label>))}</div></Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="pt-2">
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Render JavaScript</span><Switch /></div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="scrape.crawl" payload={{ title: 'Brand scrape' }} disabled={!url} />
                    </div>
                  }
                  output={
                    generating.scrape ? <GeneratingSkeleton /> :
                    <div className="space-y-3">
                      <ExtractedDataCard icon={Palette} title="Colors" items={['#22D3EE', '#8B5CF6', '#F0ABFC', '#0B0B12', '#FFFFFF']} />
                      <ExtractedDataCard icon={Type} title="Typography" items={['Inter', 'Space Grotesk', 'monospace']} />
                      <ExtractedDataCard icon={Globe} title="Brand Summary" items={['Enterprise AI', 'SaaS Platform', 'B2B']} />
                      <Button variant="outline" size="sm" className="w-full border-cyan-500/30 text-cyan-300 text-xs"><Sparkles className="mr-1 h-3 w-3" /> Save as Brand Pack</Button>
                    </div>
                  }
                />
              </Card>
            </TabsContent>

            {/* ── 9. RAG/Knowledge ── */}
            <TabsContent value="rag" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <IOLayout
                  input={
                    <div className="space-y-4">
                      <Field label="Upload documents"><DropZone accept=".pdf,.doc,.docx,.txt" label="Drop PDFs, docs, or text files" kind="documents" /></Field>
                      <Field label={`Chunk size — ${chunk[0]} tokens`}><Slider value={chunk} onValueChange={setChunk} min={200} max={2000} step={100} /></Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced" className="border-white/[0.06]">
                          <AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-2">
                            <Field label="Overlap"><Select defaultValue="10"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem><SelectItem value="5">5%</SelectItem><SelectItem value="10">10%</SelectItem><SelectItem value="20">20%</SelectItem></SelectContent></Select></Field>
                            <Field label="Top-K results"><Slider defaultValue={[5]} min={1} max={20} step={1} /></Field>
                            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Rerank results</span><Switch defaultChecked /></div>
                            <Field label="Confidence threshold"><Slider defaultValue={[0.7]} min={0} max={1} step={0.05} /></Field>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <GenerateButton type="rag.ingest" payload={{ title: 'RAG ingest' }} />
                    </div>
                  }
                  output={
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Search your knowledge base…" className="bg-black/20 flex-1" />
                        <Button variant="outline" size="sm" className="border-white/10" onClick={() => {
                          if (!ragQuery.trim()) return
                          setRagResults([
                            { text: 'AmarktAI Network provides enterprise AI orchestration capabilities including text, image, video, and audio generation.', score: 0.94, source: 'brand-guide.pdf' },
                            { text: 'The system uses a multi-provider routing strategy to optimize for cost, latency, and quality.', score: 0.87, source: 'architecture-doc.md' },
                            { text: 'Connected apps receive their own API keys, capability scopes, and daily budget limits.', score: 0.82, source: 'api-documentation.pdf' },
                          ])
                        }}><Search className="h-4 w-4" /></Button>
                      </div>
                      {ragResults.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">{ragResults.length} results found</div>
                          {ragResults.map((r, i) => (
                            <div key={i} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] text-muted-foreground">{r.source}</span>
                                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">{(r.score * 100).toFixed(0)}% match</Badge>
                              </div>
                              <p className="text-xs text-foreground/80">{r.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              </Card>
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
