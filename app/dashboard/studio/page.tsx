// @ts-nocheck
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStudioStore, type GeneratedAsset } from '@/lib/useStudioStore'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import DynamicFormRenderer, { type FormSchema } from '@/components/amarkt/DynamicFormRenderer'
import { DropZone, MediaPreview, ExtractedDataCard } from '@/components/amarkt/StudioComponents'
import AssetLibraryDrawer from '@/components/amarkt/AssetLibraryDrawer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Play, Plus, Trash2, Send, MicIcon, Layers, Clock, Volume2,
  GripVertical, PanelLeftOpen, PanelRightOpen, Wand2, Package, Sliders,
  Settings, Palette, Type, Sparkles, Loader2, X, Search, Eye
} from 'lucide-react'
import { MUSIC_GENRES } from '@/lib/appdata'
import { toast } from 'sonner'

// ─── Tab Schemas ───────────────────────────────────────────────
const IMAGE_SCHEMA: FormSchema = {
  prompt: { type: 'string', label: 'Prompt', placeholder: 'A cinematic obsidian data center…', multiline: true },
  style: { type: 'enum', label: 'Style', options: ['Photorealistic', 'Illustration', '3D Render', 'Anime', 'Pixel Art'] },
  aspect: { type: 'enum', label: 'Aspect Ratio', options: ['1:1', '16:9', '9:16', '4:3'] },
  reference: { type: 'file', label: 'Reference Image', accept: 'image/*', kind: 'image' },
  negativePrompt: { type: 'string', label: 'Negative Prompt', placeholder: 'Elements to exclude…', multiline: true, advanced: true },
  seed: { type: 'number', label: 'Seed', min: 0, max: 999999, step: 1, advanced: true },
  cfgScale: { type: 'number', label: 'CFG Scale', min: 1, max: 20, step: 0.5, advanced: true },
}

const VIDEO_SCHEMA: FormSchema = {
  prompt: { type: 'string', label: 'Prompt', placeholder: 'Slow dolly across neon skyline…', multiline: true },
  mode: { type: 'enum', label: 'Mode', options: ['Text to Video', 'Image to Video', 'Video to Video'] },
  camera: { type: 'enum', label: 'Camera Movement', options: ['Static', 'Pan', 'Dolly', 'Orbit'] },
  duration: { type: 'enum', label: 'Duration', options: ['3 seconds', '5 seconds', '10 seconds'] },
  firstFrame: { type: 'file', label: 'First Frame', accept: 'image/*', kind: 'image' },
  lastFrame: { type: 'file', label: 'Last Frame', accept: 'image/*', kind: 'image' },
  lens: { type: 'enum', label: 'Lens Type', options: ['Wide', 'Standard', 'Telephoto'], advanced: true },
  motionStrength: { type: 'number', label: 'Motion Strength', min: 0, max: 100, step: 1, advanced: true },
}

const MUSIC_SCHEMA: FormSchema = {
  prompt: { type: 'string', label: 'Describe Your Song', placeholder: 'An upbeat electronic track with synth pads…', multiline: true },
  lyrics: { type: 'string', label: 'Lyrics (optional)', placeholder: 'Write your lyrics here…', multiline: true },
  mood: { type: 'enum', label: 'Mood', options: ['Energetic', 'Chill', 'Dark', 'Happy', 'Melancholic'] },
  vocalStyle: { type: 'enum', label: 'Vocal Style', options: ['Instrumental', 'Male', 'Female', 'Group', 'Rap', 'Choir'] },
  reference: { type: 'file', label: 'Reference Track', accept: 'audio/*', kind: 'audio' },
  tempo: { type: 'enum', label: 'Tempo', options: ['Slow (60-90 BPM)', 'Medium (90-130 BPM)', 'Fast (130-180 BPM)'], advanced: true },
  keyScale: { type: 'enum', label: 'Key / Scale', options: ['Auto', 'C Major', 'C Minor', 'G Major', 'G Minor'], advanced: true },
}

const VOICE_SCHEMA: FormSchema = {
  script: { type: 'string', label: 'Script', placeholder: 'Enter text to synthesize…', multiline: true },
  voiceType: { type: 'enum', label: 'Voice Type', options: ['Nova (Female)', 'Onyx (Male)', 'Aria (Female)', 'Tara (Female)'] },
  emotion: { type: 'enum', label: 'Emotion', options: ['Neutral', 'Happy', 'Serious', 'Excited'] },
  cloneAudio: { type: 'file', label: 'Clone Voice Audio', accept: 'audio/*', kind: 'audio' },
  speed: { type: 'number', label: 'Speed', min: 0.5, max: 2, step: 0.1, advanced: true },
  ssml: { type: 'boolean', label: 'SSML Mode', advanced: true },
  noiseReduction: { type: 'boolean', label: 'Noise Reduction', advanced: true },
}

const AVATAR_SCHEMA: FormSchema = {
  faceImage: { type: 'file', label: 'Reference Face', accept: 'image/*', kind: 'image' },
  lipSyncAudio: { type: 'file', label: 'Lip-Sync Audio', accept: 'audio/*', kind: 'audio' },
  background: { type: 'enum', label: 'Background', options: ['Transparent', 'Studio', 'Office', 'Custom'] },
  gestureIntensity: { type: 'number', label: 'Gesture Intensity', min: 0, max: 100, step: 1 },
}

const SCRAPE_SCHEMA: FormSchema = {
  url: { type: 'string', label: 'Website URL', placeholder: 'https://brand.example.com' },
  depth: { type: 'number', label: 'Crawl Depth', min: 1, max: 5, step: 1 },
  renderJs: { type: 'boolean', label: 'Render JavaScript', advanced: true },
}

const RAG_SCHEMA: FormSchema = {
  documents: { type: 'file', label: 'Upload Documents', accept: '.pdf,.doc,.docx,.txt', kind: 'documents' },
  chunkSize: { type: 'number', label: 'Chunk Size (tokens)', min: 200, max: 2000, step: 100 },
  overlap: { type: 'enum', label: 'Overlap', options: ['None', '5%', '10%', '20%'] },
  topK: { type: 'number', label: 'Top-K Results', min: 1, max: 20, step: 1, advanced: true },
  rerank: { type: 'boolean', label: 'Rerank Results', advanced: true },
}

// ─── Director Chat ─────────────────────────────────────────────
function DirectorChat() {
  const { chatHistory, simulateChatResponse, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const [attachedKB, setAttachedKB] = useState<{ id: string; name: string } | null>(null)
  const [kbOpen, setKbOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const knowledgeBases = [
    { id: 'brand-guide', name: 'Brand Guide' },
    { id: 'product-docs', name: 'Product Documentation' },
  ]

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [chatHistory])

  const send = () => {
    if (!input.trim()) return
    const msg = attachedKB ? `${input}\n\n[Context: ${attachedKB.name}]` : input
    setInput('')
    simulateChatResponse(msg)
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
              <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-white/[0.08] bg-[hsl(240_14%_5%)] shadow-xl p-2 space-y-1 z-10">
                <div className="text-[10px] text-muted-foreground px-2 py-1">Attach Knowledge Base</div>
                {knowledgeBases.map((kb) => (
                  <button key={kb.id} onClick={() => { setAttachedKB(kb); setKbOpen(false) }}
                    className="w-full rounded-md px-2 py-1.5 text-xs text-foreground/80 hover:bg-white/[0.06] transition text-left">{kb.name}</button>
                ))}
              </div>
            )}
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
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null)

  const handleDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault()
    setDragOverTrack(null)
    try {
      const asset = JSON.parse(e.dataTransfer.getData('text/plain')) as GeneratedAsset
      dropAssetOnTimeline(asset, trackId)
      toast.success('Asset added to timeline', { description: asset.name })
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
          <span className="text-[10px] text-muted-foreground font-mono">00:00 / 00:00</span>
        </div>
      </div>
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[calc(100%-36px)] p-4">
          <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.015] px-6 py-8 text-center max-w-xs">
            <GripVertical className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Drag assets from the library or generate to populate the timeline.</p>
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
                  <div key={clip.id || i} className={`absolute top-1 bottom-1 rounded bg-${track.color}-500/20 border border-${track.color}-500/30 flex items-center px-1.5 cursor-grab`}
                    style={{ left: `${clip.start}%`, width: `${clip.width}%` }}>
                    <span className="text-[9px] text-foreground/70 truncate">{clip.label}</span>
                    <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 rounded-l" />
                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 rounded-r" />
                  </div>
                ))}
              </div>
              <div className="w-8 flex items-center justify-center"><Volume2 className="h-3 w-3 text-muted-foreground/50" /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Generate Button ───────────────────────────────────────────
function GenerateButton({ capability, label = 'Generate', disabled, onGenerate }: { capability: string; label?: string; disabled?: boolean; onGenerate?: () => void }) {
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

// ─── Main Studio Page ──────────────────────────────────────────
export default function Studio() {
  const { generating, generatedAssets, simulateGeneration } = useStudioStore()

  const [imageValues, setImageValues] = useState<Record<string, unknown>>({ aspect: '1:1', style: 'Photorealistic' })
  const [videoValues, setVideoValues] = useState<Record<string, unknown>>({ mode: 'Text to Video', camera: 'Dolly', duration: '5 seconds' })
  const [musicValues, setMusicValues] = useState<Record<string, unknown>>({ mood: 'Energetic', vocalStyle: 'Instrumental' })
  const [voiceValues, setVoiceValues] = useState<Record<string, unknown>>({ voiceType: 'Nova (Female)', emotion: 'Neutral' })
  const [avatarValues, setAvatarValues] = useState<Record<string, unknown>>({ background: 'Transparent', gestureIntensity: 50 })
  const [scrapeValues, setScrapeValues] = useState<Record<string, unknown>>({ depth: 2 })
  const [ragValues, setRagValues] = useState<Record<string, unknown>>({ chunkSize: 800, overlap: '10%' })

  const [chatPrompt, setChatPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState<{ text: string; score: number; source: string }[]>([])
  const [scenes, setScenes] = useState([
    { prompt: '', duration: 5, transition: 'Cut' },
    { prompt: '', duration: 5, transition: 'Fade' },
  ])

  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)

  const getAssets = (type: string) => generatedAssets.filter((a) => a.type === type)

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
        {/* LEFT PANEL — Node Canvas */}
        {leftPanelOpen && (
          <div className="w-56 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Canvas</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center text-muted-foreground">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Drag nodes here to build pipelines</p>
              </div>
            </div>
            <div className="border-t border-white/[0.06] p-2 space-y-1">
              {['Script', 'Voice', 'Video', 'Image'].map((node) => (
                <div key={node} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground cursor-grab transition">
                  <GripVertical className="h-3 w-3" />{node}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CENTER — Main Tabs */}
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

            {/* Chat */}
            <TabsContent value="chat" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Input</div>
                    <Field label="System guide"><Textarea placeholder="You are a helpful enterprise assistant…" className="min-h-[80px] bg-black/20" /></Field>
                    <Field label="Prompt"><Textarea value={chatPrompt} onChange={(e) => setChatPrompt(e.target.value)} placeholder="Ask anything…" className="min-h-[80px] bg-black/20" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tone"><Select defaultValue="professional"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">Professional</SelectItem><SelectItem value="casual">Casual</SelectItem><SelectItem value="creative">Creative</SelectItem></SelectContent></Select></Field>
                      <Field label="Audience"><Select defaultValue="general"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="technical">Technical</SelectItem><SelectItem value="executive">Executive</SelectItem></SelectContent></Select></Field>
                    </div>
                    <Button onClick={() => {
                      if (!chatPrompt.trim()) return
                      setChatMessages((p) => [...p, { role: 'user', content: chatPrompt }])
                      setChatPrompt('')
                      setTimeout(() => setChatMessages((p) => [...p, { role: 'assistant', content: 'This is a simulated response. In production, this will be powered by the AI provider pipeline.' }]), 1500)
                    }} disabled={!chatPrompt.trim()} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
                      <Send className="mr-1.5 h-4 w-4" /> Send
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Chat History</div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 min-h-[400px] max-h-[500px] overflow-y-auto space-y-3">
                      {chatMessages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mb-2 opacity-30" /><span className="text-xs">Send a message to start</span>
                        </div>
                      )}
                      {chatMessages.map((m, i) => (
                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>{m.content}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Image */}
            <TabsContent value="image" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={IMAGE_SCHEMA} values={imageValues} onChange={setImageValues} />
                    <GenerateButton capability="image.generate" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Preview</div>
                    {generating.image ? <MediaPreview type="image" loading /> :
                      getAssets('image').length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {getAssets('image').slice(-4).map((a) => <MediaPreview key={a.id} type="image" title={a.name} />)}
                        </div>
                      ) : <MediaPreview type="image" title="Generated images will appear here" />}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Video */}
            <TabsContent value="video" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={VIDEO_SCHEMA} values={videoValues} onChange={setVideoValues} />
                    <GenerateButton capability="video.generate" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Preview</div>
                    {generating.video ? <MediaPreview type="video" loading /> :
                      getAssets('video').length > 0 ? <MediaPreview type="video" title="Generated video" /> :
                        <MediaPreview type="video" title="Generated videos will appear here" />}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Long-form */}
            <TabsContent value="longvideo" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Scene Storyboard</div>
                      <Button variant="outline" size="sm" onClick={() => setScenes((p) => [...p, { prompt: '', duration: 5, transition: 'Cut' }])} className="border-white/10 text-xs"><Plus className="mr-1 h-3 w-3" /> Add Scene</Button>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {scenes.map((scene, i) => (
                        <div key={i} className="rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Scene {i + 1}</span>
                            <button onClick={() => setScenes((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
                          </div>
                          <Textarea value={scene.prompt} onChange={(e) => setScenes((p) => p.map((s, idx) => idx === i ? { ...s, prompt: e.target.value } : s))} placeholder={`Describe scene ${i + 1}…`} className="min-h-[50px] bg-black/20 text-xs" />
                          <div className="grid grid-cols-2 gap-2">
                            <Field label={`Duration — ${scene.duration}s`}><input type="range" min={1} max={30} value={scene.duration} onChange={(e) => setScenes((p) => p.map((s, idx) => idx === i ? { ...s, duration: Number(e.target.value) } : s))} className="w-full" /></Field>
                            <Field label="Transition"><Select value={scene.transition} onValueChange={(v) => setScenes((p) => p.map((s, idx) => idx === i ? { ...s, transition: v } : s))}><SelectTrigger className="bg-black/20 text-xs h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cut">Cut</SelectItem><SelectItem value="Fade">Fade</SelectItem><SelectItem value="Dissolve">Dissolve</SelectItem></SelectContent></Select></Field>
                          </div>
                        </div>
                      ))}
                    </div>
                    <GenerateButton capability="video.longform" label="Generate Video" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Final Preview</div>
                    <MediaPreview type="video" title="Stitched preview will appear here" />
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Music */}
            <TabsContent value="music" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <Field label="Genre"><div className="flex flex-wrap gap-1.5">{MUSIC_GENRES.slice(0, 8).map((g) => <Badge key={g} variant="outline" className="border-white/10 cursor-pointer hover:border-cyan-500/30 hover:text-cyan-300 transition text-[10px]">{g}</Badge>)}</div></Field>
                    <DynamicFormRenderer schema={MUSIC_SCHEMA} values={musicValues} onChange={setMusicValues} />
                    <GenerateButton capability="music.generate" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Preview</div>
                    {generating.music ? <MediaPreview type="audio" loading /> :
                      getAssets('audio').length > 0 ? <MediaPreview type="audio" title="Generated track" /> :
                        <MediaPreview type="audio" title="Generated tracks will appear here" />}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Voice */}
            <TabsContent value="voice" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={VOICE_SCHEMA} values={voiceValues} onChange={setVoiceValues} />
                    <GenerateButton capability="voice.tts" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Preview</div>
                    {generating.voice ? <MediaPreview type="audio" loading /> :
                      getAssets('audio').length > 0 ? <MediaPreview type="audio" title="Voice synthesis" /> :
                        <MediaPreview type="audio" title="Synthesized audio will appear here" />}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Avatar */}
            <TabsContent value="avatar" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={AVATAR_SCHEMA} values={avatarValues} onChange={setAvatarValues} />
                    <GenerateButton capability="avatar.generate" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Preview</div>
                    {generating.avatar ? <MediaPreview type="video" loading /> :
                      <MediaPreview type="video" title="Talking head video will appear here" />}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Scrape */}
            <TabsContent value="scrape" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={SCRAPE_SCHEMA} values={scrapeValues} onChange={setScrapeValues} />
                    <GenerateButton capability="scrape.crawl" disabled={!scrapeValues.url} />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Extracted Data</div>
                    {generating.scrape ? <MediaPreview type="text" loading /> :
                      <div className="space-y-3">
                        <ExtractedDataCard icon={Palette} title="Colors" items={['#22D3EE', '#8B5CF6', '#F0ABFC', '#0B0B12', '#FFFFFF']} />
                        <ExtractedDataCard icon={Type} title="Typography" items={['Inter', 'Space Grotesk', 'monospace']} />
                        <ExtractedDataCard icon={Globe} title="Brand Summary" items={['Enterprise AI', 'SaaS Platform', 'B2B']} />
                        <Button variant="outline" size="sm" className="w-full border-cyan-500/30 text-cyan-300 text-xs"><Sparkles className="mr-1 h-3 w-3" /> Save as Brand Pack</Button>
                      </div>}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* RAG */}
            <TabsContent value="rag" className="mt-4">
              <Card className="border-white/[0.07] bg-white/[0.02] p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Sliders className="h-3 w-3" /> Controls</div>
                    <DynamicFormRenderer schema={RAG_SCHEMA} values={ragValues} onChange={setRagValues} />
                    <GenerateButton capability="rag.ingest" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider"><Eye className="h-3 w-3" /> Search Results</div>
                    <div className="flex gap-2">
                      <Input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Search your knowledge base…" className="bg-black/20 flex-1" />
                      <Button variant="outline" size="sm" className="border-white/10" onClick={() => {
                        if (!ragQuery.trim()) return
                        setRagResults([
                          { text: 'AmarktAI Network provides enterprise AI orchestration capabilities.', score: 0.94, source: 'brand-guide.pdf' },
                          { text: 'The system uses a multi-provider routing strategy.', score: 0.87, source: 'architecture.md' },
                        ])
                      }}><Search className="h-4 w-4" /></Button>
                    </div>
                    {ragResults.length > 0 && (
                      <div className="space-y-2">
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
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* BOTTOM PANEL — Timeline */}
          {bottomPanelOpen && (
            <div className="h-48 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden">
              <Timeline />
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Director Chat */}
        {rightPanelOpen && (
          <div className="w-80 shrink-0 rounded-lg border border-white/[0.06] bg-[hsl(240_14%_3.5%)] overflow-hidden">
            <DirectorChat />
          </div>
        )}
      </div>

      <AssetLibraryDrawer open={assetDrawerOpen} onClose={() => setAssetDrawerOpen(false)} />
    </PageTransition>
  )
}
