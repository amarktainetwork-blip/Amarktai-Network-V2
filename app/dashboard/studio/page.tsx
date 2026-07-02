// @ts-nocheck
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore, type GeneratedAsset } from '@/lib/useStudioStore'
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
  Upload, FileText, ChevronDown
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

// ─── Generate Button ───────────────────────────────────────────
function GenerateButton({ capability, label = 'Generate', disabled, onGenerate }) {
  const { generating, simulateGeneration } = useStudioStore()
  const key = capability.split('.')[0]
  const busy = generating[key]
  const handleGenerate = async () => {
    if (onGenerate) { onGenerate(); return }
    await simulateGeneration(capability, { title: `${capability} output` })
    toast.success('Generation complete', { description: `${capability} · asset added to library` })
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
  const { generating, generatedAssets, simulateGeneration } = useStudioStore()
  const getAssets = (type) => generatedAssets.filter((a) => a.type === type)

  // Chat state
  const [chatPrompt, setChatPrompt] = useState('')
  const [chatSystem, setChatSystem] = useState('')
  const [chatMessages, setChatMessages] = useState([])

  // Long-form scenes
  const [scenes, setScenes] = useState([{ prompt: '', duration: 5, transition: 'Cut' }, { prompt: '', duration: 5, transition: 'Fade' }])

  // RAG
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
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setLeftPanelOpen(!leftPanelOpen)} className={`border-white/10 ${leftPanelOpen ? 'bg-white/10' : ''}`}><PanelLeftOpen className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setBottomPanelOpen(!bottomPanelOpen)} className={`border-white/10 ${bottomPanelOpen ? 'bg-white/10' : ''}`}><Layers className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className={`border-white/10 ${rightPanelOpen ? 'bg-white/10' : ''}`}><PanelRightOpen className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAssetDrawerOpen(!assetDrawerOpen)} className={`border-white/10 ${assetDrawerOpen ? 'bg-white/10' : ''}`}><Package className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex gap-2" style={{ minHeight: 'calc(100vh - 220px)' }}>
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

            {/* ── 1. CHAT/TEXT ── */}
            <TabsContent value="chat" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <Field label="Prompt"><Textarea value={chatPrompt} onChange={(e) => setChatPrompt(e.target.value)} placeholder="Ask anything…" className="min-h-[80px] bg-black/20" /></Field>
                  <Field label="System Instruction"><Textarea value={chatSystem} onChange={(e) => setChatSystem(e.target.value)} placeholder="You are a helpful enterprise assistant…" className="min-h-[60px] bg-black/20" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Purpose"><Select defaultValue="general"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="creative">Creative Writing</SelectItem><SelectItem value="analysis">Analysis</SelectItem><SelectItem value="code">Code Generation</SelectItem><SelectItem value="summarize">Summarize</SelectItem></SelectContent></Select></Field>
                    <Field label="Tone"><Select defaultValue="professional"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">Professional</SelectItem><SelectItem value="casual">Casual</SelectItem><SelectItem value="friendly">Friendly</SelectItem><SelectItem value="authoritative">Authoritative</SelectItem><SelectItem value="creative">Creative</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Language"><Select defaultValue="en"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="es">Spanish</SelectItem><SelectItem value="fr">French</SelectItem><SelectItem value="de">German</SelectItem><SelectItem value="pt">Portuguese</SelectItem><SelectItem value="zh">Chinese</SelectItem></SelectContent></Select></Field>
                    <Field label="Brand Voice"><Select defaultValue="default"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="corporate">Corporate</SelectItem><SelectItem value="startup">Startup</SelectItem><SelectItem value="luxury">Luxury</SelectItem></SelectContent></Select></Field>
                  </div>
                  <Field label="Output Length"><div className="flex items-center gap-3"><Slider defaultValue={[50]} min={0} max={100} step={1} className="flex-1" /><span className="text-xs text-muted-foreground w-12">Medium</span></div></Field>
                  <Field label="Audience"><Input placeholder="e.g. Enterprise buyers, developers…" className="bg-black/20" /></Field>
                  <Field label="Forbidden Words"><Textarea placeholder="Words to exclude, one per line…" className="min-h-[40px] bg-black/20" /></Field>
                  <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">JSON mode</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Strict schema</span><Switch /></div>
                    <Field label="Temperature"><Slider defaultValue={[70]} min={0} max={100} step={1} /></Field>
                  </AccordionContent></AccordionItem></Accordion>
                  <Button onClick={() => { if (!chatPrompt.trim()) return; setChatMessages((p) => [...p, { role: 'user', content: chatPrompt }]); setChatPrompt(''); setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'This is a simulated response. In production, this will be powered by the AI provider pipeline.' }]), 1500) }} disabled={!chatPrompt.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Send className="mr-1.5 h-4 w-4" /> Send</Button>
                </div>}
                output={<div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 min-h-[400px] max-h-[500px] overflow-y-auto space-y-3">
                  {chatMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-8 w-8 mb-2 opacity-30" /><span className="text-xs">Send a message to start</span></div>}
                  {chatMessages.map((m, i) => <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>{m.content}</div>)}
                </div>}
              /></Card>
            </TabsContent>

            {/* ── 2. IMAGE ── */}
            <TabsContent value="image" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <Field label="Prompt"><Textarea placeholder="A cinematic obsidian data center…" className="min-h-[80px] bg-black/20" /></Field>
                  <Field label="Negative Prompt"><Textarea placeholder="Elements to exclude…" className="min-h-[50px] bg-black/20" /></Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Style"><Select defaultValue="photorealistic"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="photorealistic">Photorealistic</SelectItem><SelectItem value="anime">Anime</SelectItem><SelectItem value="3d">3D Render</SelectItem><SelectItem value="oil">Oil Painting</SelectItem><SelectItem value="illustration">Illustration</SelectItem></SelectContent></Select></Field>
                    <Field label="Aspect Ratio"><Select defaultValue="1:1"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1:1">1:1</SelectItem><SelectItem value="16:9">16:9</SelectItem><SelectItem value="9:16">9:16</SelectItem><SelectItem value="4:3">4:3</SelectItem></SelectContent></Select></Field>
                    <Field label="Quality"><Select defaultValue="standard"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="hd">HD</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Reference Image"><DropZone accept="image/*" label="Drop image" kind="image" compact /></Field>
                    <Field label="Logo Asset"><DropZone accept="image/*" label="Drop logo" kind="image" compact /></Field>
                    <Field label="Product Image"><DropZone accept="image/*" label="Drop product" kind="image" compact /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Brand Palette Lock</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Remove Background</span><Switch /></div>
                    <Field label="Upscale"><Select defaultValue="none"><SelectTrigger className="bg-black/20 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="2x">2x</SelectItem><SelectItem value="4x">4x</SelectItem></SelectContent></Select></Field>
                  </div>
                  <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                    <Field label="Seed (0 = random)"><Input type="number" defaultValue={0} className="bg-black/20" /></Field>
                    <Field label="Steps"><Slider defaultValue={[30]} min={1} max={100} step={1} /></Field>
                    <Field label="Guidance"><Slider defaultValue={[7]} min={1} max={20} step={0.5} /></Field>
                  </AccordionContent></AccordionItem></Accordion>
                  <GenerateButton capability="image.generate" />
                </div>}
                output={<div className="space-y-4">
                  {generating.image ? <div className="space-y-2"><div className="h-48 w-full rounded-lg bg-white/[0.04] animate-pulse" /><div className="flex gap-2"><div className="h-3 w-24 rounded bg-white/[0.04] animate-pulse" /><div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" /></div></div> :
                    getAssets('image').length > 0 ? <div className="grid grid-cols-2 gap-2">{getAssets('image').slice(-4).map((a) => <div key={a.id} className={`relative aspect-square rounded-lg border border-white/[0.06] bg-gradient-to-br ${a.gradient} flex items-center justify-center group`}><ImageIcon className="h-8 w-8 text-foreground/20" /><div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex gap-1"><Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40"><Download className="h-3 w-3" /></Button><Button size="sm" variant="outline" className="h-6 text-[10px] border-white/20 bg-black/40">Upscale</Button></div></div>)}</div> :
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground rounded-lg border border-dashed border-white/10"><ImageIcon className="h-10 w-10 mb-2 opacity-30" /><span className="text-xs">Generated images will appear here</span></div>}
                </div>}
              /></Card>
            </TabsContent>

            {/* ── 3. VIDEO ── */}
            <TabsContent value="video" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <Field label="Mode"><Select defaultValue="text-to-video"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text-to-video">Text to Video</SelectItem><SelectItem value="image-to-video">Image to Video</SelectItem><SelectItem value="first-last-frame">First / Last Frame</SelectItem><SelectItem value="reel">Reel</SelectItem><SelectItem value="ad">Ad</SelectItem></SelectContent></Select></Field>
                  <Field label="Prompt"><Textarea placeholder="Slow dolly across neon skyline…" className="min-h-[80px] bg-black/20" /></Field>
                  <Field label="Negative Prompt"><Textarea placeholder="Elements to exclude…" className="min-h-[40px] bg-black/20" /></Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Style"><Select defaultValue="cinematic"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cinematic">Cinematic</SelectItem><SelectItem value="realistic">Realistic</SelectItem><SelectItem value="anime">Anime</SelectItem><SelectItem value="3d">3D</SelectItem></SelectContent></Select></Field>
                    <Field label="Duration"><Select defaultValue="5s"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4s">4 seconds</SelectItem><SelectItem value="8s">8 seconds</SelectItem><SelectItem value="16s">16 seconds</SelectItem><SelectItem value="30s">30 seconds</SelectItem></SelectContent></Select></Field>
                    <Field label="Camera"><Select defaultValue="dolly"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="static">Static</SelectItem><SelectItem value="pan-left">Pan Left</SelectItem><SelectItem value="pan-right">Pan Right</SelectItem><SelectItem value="zoom-in">Zoom In</SelectItem><SelectItem value="zoom-out">Zoom Out</SelectItem><SelectItem value="drone">Drone</SelectItem><SelectItem value="orbit">Orbit</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="First Frame"><DropZone accept="image/*" label="Drop image" kind="image" compact /></Field>
                    <Field label="Last Frame"><DropZone accept="image/*" label="Drop image" kind="image" compact /></Field>
                    <Field label="Audio Input"><DropZone accept="audio/*" label="Drop audio" kind="audio" compact /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Logo Overlay</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Subtitles</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">CTA End Card</span><Switch /></div>
                  </div>
                  <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                    <Field label="Lens Type"><Select defaultValue="standard"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wide">Wide</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="telephoto">Telephoto</SelectItem></SelectContent></Select></Field>
                    <Field label="Motion Strength"><Slider defaultValue={[50]} min={0} max={100} step={1} /></Field>
                  </AccordionContent></AccordionItem></Accordion>
                  <GenerateButton capability="video.generate" />
                </div>}
                output={<div className="space-y-4">{generating.video ? <div className="h-64 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Generated video" />}</div>}
              /></Card>
            </TabsContent>

            {/* ── 4. LONG-FORM VIDEO (STORYBOARD) ── */}
            <TabsContent value="longvideo" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Source"><Select defaultValue="prompt"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prompt">Prompt</SelectItem><SelectItem value="script">Script</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="brand-pack">Brand Pack</SelectItem></SelectContent></Select></Field>
                    <Field label="Target Duration"><Select defaultValue="60s"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30s">30 seconds</SelectItem><SelectItem value="60s">1 minute</SelectItem><SelectItem value="120s">2 minutes</SelectItem><SelectItem value="300s">5 minutes</SelectItem></SelectContent></Select></Field>
                    <Field label="Scene Count"><Select defaultValue="4"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2">2 scenes</SelectItem><SelectItem value="4">4 scenes</SelectItem><SelectItem value="6">6 scenes</SelectItem><SelectItem value="8">8 scenes</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">Scene Planner</span><Button variant="outline" size="sm" onClick={() => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'Cut' }])} className="border-white/10 text-xs"><Plus className="mr-1 h-3 w-3" /> Add Scene</Button></div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {scenes.map((scene, i) => <SceneCard key={i} scene={scene} index={i} onUpdate={(d) => setScenes((p) => p.map((s, idx) => idx === i ? d : s))} onRemove={() => setScenes((p) => p.filter((_, idx) => idx !== i))} />)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Voiceover"><Select defaultValue="none"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="male">Male Voice</SelectItem><SelectItem value="female">Female Voice</SelectItem><SelectItem value="ai">AI Voice</SelectItem></SelectContent></Select></Field>
                    <Field label="Music Bed"><Select defaultValue="none"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="ambient">Ambient</SelectItem><SelectItem value="cinematic">Cinematic</SelectItem><SelectItem value="upbeat">Upbeat</SelectItem></SelectContent></Select></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Subtitles</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Logo Overlay</span><Switch /></div>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-xs">Cutdown Pack (9:16)</span><Switch /></div>
                  </div>
                  <GenerateButton capability="video.longform" label="Generate Video" />
                </div>}
                output={<div className="space-y-4">{generating.longvideo ? <div className="h-64 w-full rounded-lg bg-white/[0.04] animate-pulse" /> : <MediaPreview type="video" title="Final stitched preview" />}</div>}
              /></Card>
            </TabsContent>

            {/* ── 5. MUSIC ── */}
            <TabsContent value="music" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="song" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="song">Song</TabsTrigger><TabsTrigger value="lyrics">Lyrics</TabsTrigger><TabsTrigger value="instrumental">Instrumental</TabsTrigger><TabsTrigger value="cover">Cover Art</TabsTrigger><TabsTrigger value="video">Music Video</TabsTrigger><TabsTrigger value="promo">Promo Pack</TabsTrigger></TabsList>
                  <TabsContent value="song" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <Field label="Describe Your Song"><Textarea placeholder="An upbeat electronic track with synth pads…" className="min-h-[80px] bg-black/20" /></Field>
                      <Field label="Genre"><div className="flex flex-wrap gap-1.5">{MUSIC_GENRES.map((g) => <Badge key={g} variant="outline" className="border-white/10 cursor-pointer hover:border-cyan-500/30 hover:text-cyan-300 transition text-[10px]">{g}</Badge>)}</div></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Mood"><Select defaultValue="happy"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="happy">Happy</SelectItem><SelectItem value="sad">Sad</SelectItem><SelectItem value="epic">Epic</SelectItem><SelectItem value="chill">Chill</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></Field>
                        <Field label="Vocal Style"><Select defaultValue="instrumental"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="group">Group</SelectItem><SelectItem value="rap">Rap</SelectItem><SelectItem value="choir">Choir</SelectItem><SelectItem value="instrumental">Instrumental</SelectItem></SelectContent></Select></Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tempo"><Select defaultValue="medium"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="slow">Slow</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="fast">Fast</SelectItem></SelectContent></Select></Field>
                        <Field label="Reference Track"><DropZone accept="audio/*" label="Drop audio" kind="audio" compact /></Field>
                      </div>
                      <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                        <Field label="Vibe"><Select defaultValue="auto"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="bright">Bright</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="warm">Warm</SelectItem></SelectContent></Select></Field>
                        <Field label="Exact BPM"><Input type="number" defaultValue={120} className="bg-black/20" /></Field>
                      </AccordionContent></AccordionItem></Accordion>
                      <GenerateButton capability="music.generate" />
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

            {/* ── 6. VOICE ── */}
            <TabsContent value="voice" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="tts" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="tts">Text-to-Speech</TabsTrigger><TabsTrigger value="stt">Speech-to-Text</TabsTrigger><TabsTrigger value="dubbing">Dubbing</TabsTrigger><TabsTrigger value="library">Voice Library</TabsTrigger><TabsTrigger value="subtitles">Subtitles</TabsTrigger></TabsList>
                  <TabsContent value="tts" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <Field label="Script"><Textarea placeholder="Enter text to synthesize…" className="min-h-[100px] bg-black/20" /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Voice Type"><Select defaultValue="female"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="child">Child</SelectItem><SelectItem value="elderly">Elderly</SelectItem></SelectContent></Select></Field>
                        <Field label="Emotion"><Select defaultValue="neutral"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Neutral</SelectItem><SelectItem value="happy">Happy</SelectItem><SelectItem value="angry">Angry</SelectItem><SelectItem value="whisper">Whisper</SelectItem><SelectItem value="authoritative">Authoritative</SelectItem></SelectContent></Select></Field>
                      </div>
                      <Field label="Speed"><div className="flex items-center gap-3"><Slider defaultValue={[100]} min={50} max={200} step={10} className="flex-1" /><span className="text-xs text-muted-foreground w-10">1.0x</span></div></Field>
                      <Field label="Clone Voice Audio"><DropZone accept="audio/*" label="Drop audio for cloning" kind="audio" compact /></Field>
                      <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                        <Field label="Sample Rate"><Select defaultValue="44100"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="22050">22050 Hz</SelectItem><SelectItem value="44100">44100 Hz</SelectItem><SelectItem value="48000">48000 Hz</SelectItem></SelectContent></Select></Field>
                        <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Diarization</span><Switch /></div>
                        <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">SSML Mode</span><Switch /></div>
                      </AccordionContent></AccordionItem></Accordion>
                      <GenerateButton capability="voice.tts" />
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

            {/* ── 7. AVATAR ── */}
            <TabsContent value="avatar" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <Tabs defaultValue="talking" className="mb-4">
                  <TabsList className="bg-white/[0.03]"><TabsTrigger value="library">Library</TabsTrigger><TabsTrigger value="create">Create</TabsTrigger><TabsTrigger value="talking">Talking Head</TabsTrigger><TabsTrigger value="presenter">Presenter</TabsTrigger><TabsTrigger value="lipsync">Lipsync</TabsTrigger><TabsTrigger value="voice">Voice Binding</TabsTrigger></TabsList>
                  <TabsContent value="talking" className="mt-4"><IOLayout
                    input={<div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Reference Face"><DropZone accept="image/*" label="Drop face image" kind="image" compact /></Field>
                        <Field label="Lip-Sync Audio"><DropZone accept="audio/*" label="Drop audio" kind="audio" compact /></Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Background"><Select defaultValue="studio"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="office">Office</SelectItem><SelectItem value="studio">Studio</SelectItem><SelectItem value="green-screen">Green Screen</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></Field>
                        <Field label="Gesture Intensity"><Select defaultValue="subtle"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="subtle">Subtle</SelectItem><SelectItem value="expressive">Expressive</SelectItem></SelectContent></Select></Field>
                      </div>
                      <GenerateButton capability="avatar.generate" label="Generate Talking Head" />
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

            {/* ── 8. SCRAPE/BRAND ── */}
            <TabsContent value="scrape" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <Field label="Website URL"><Input placeholder="https://brand.example.com" className="bg-black/20" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Crawl Depth"><Slider defaultValue={[2]} min={1} max={5} step={1} /></Field>
                    <Field label="Max Pages"><Input type="number" defaultValue={50} className="bg-black/20" /></Field>
                  </div>
                  <Field label="Extract Elements"><div className="grid grid-cols-3 gap-2">{['Logo', 'Colors', 'Fonts', 'Hero Images', 'Products', 'Services', 'Pricing', 'Testimonials', 'FAQs', 'Social Links', 'Contact Info', 'CTAs', 'Offers', 'Competitors'].map((el) => <label key={el} className="flex items-center gap-1.5 text-xs"><Switch defaultChecked={['Logo', 'Colors', 'Fonts'].includes(el)} /> {el}</label>)}</div></Field>
                  <Field label="Brand Guide PDF"><DropZone accept=".pdf" label="Drop brand guide" kind="PDF" compact /></Field>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 border-cyan-500/30 text-cyan-300 text-xs"><Sparkles className="mr-1 h-3 w-3" /> Save as Brand Pack</Button>
                    <Button variant="outline" size="sm" className="flex-1 border-violet-500/30 text-violet-300 text-xs"><Database className="mr-1 h-3 w-3" /> Create RAG Knowledge Set</Button>
                  </div>
                  <GenerateButton capability="scrape.crawl" label="Start Scraping" />
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

            {/* ── 9. RAG/KNOWLEDGE ── */}
            <TabsContent value="rag" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6"><IOLayout
                input={<div className="space-y-4">
                  <Field label="Knowledge Set Name"><Input placeholder="e.g. Product Documentation" className="bg-black/20" /></Field>
                  <Field label="Upload Documents"><DropZone accept=".pdf,.doc,.docx,.txt" label="Drop PDFs, DOCX, or text files" kind="documents" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Chunking Size"><Select defaultValue="medium"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Small (200 tokens)</SelectItem><SelectItem value="medium">Medium (500 tokens)</SelectItem><SelectItem value="large">Large (1000 tokens)</SelectItem></SelectContent></Select></Field>
                    <Field label="Top Results"><Slider defaultValue={[5]} min={1} max={10} step={1} /></Field>
                  </div>
                  <Accordion type="single" collapsible><AccordionItem value="adv" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
                    <Field label="Overlap"><Select defaultValue="10%"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0%">None</SelectItem><SelectItem value="5%">5%</SelectItem><SelectItem value="10%">10%</SelectItem><SelectItem value="20%">20%</SelectItem></SelectContent></Select></Field>
                    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"><span className="text-sm">Rerank Results</span><Switch defaultChecked /></div>
                  </AccordionContent></AccordionItem></Accordion>
                  <GenerateButton capability="rag.ingest" label="Build Knowledge Set" />
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

          {bottomPanelOpen && <div className="h-48 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden"><Timeline /></div>}
        </div>

        {rightPanelOpen && <div className="w-80 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden"><DirectorChat /></div>}
      </div>

      <AssetLibraryDrawer open={assetDrawerOpen} onClose={() => setAssetDrawerOpen(false)} />
    </PageTransition>
  )
}
