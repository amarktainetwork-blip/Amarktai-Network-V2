'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/studio-capability-schemas'
import { getBackendCapability } from '@/lib/capability-map'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Send, Zap, Code2, ShieldAlert, ChevronDown, Settings, Paperclip, Wrench, Eye, Package, Layers,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Grouped Capability Selector ────────────────────────────────
const CAPABILITY_GROUPS = [
  {
    label: 'Chat & Reasoning',
    items: [
      { v: 'chat', label: 'Chat', icon: MessageSquare },
      { v: 'reasoning', label: 'Reasoning', icon: Code2 },
      { v: 'code', label: 'Code', icon: Code2 },
      { v: 'research', label: 'Research', icon: Globe },
    ],
  },
  {
    label: 'Image',
    items: [
      { v: 'image', label: 'Image generation', icon: ImageIcon },
      { v: 'image_edit', label: 'Image editing', icon: ImageIcon },
    ],
  },
  {
    label: 'Video',
    items: [
      { v: 'video', label: 'Short video', icon: Video },
      { v: 'longvideo', label: 'Long-form video', icon: Film },
      { v: 'image_to_video', label: 'Image-to-video', icon: Film },
      { v: 'video_edit', label: 'Video edit / remix', icon: Video },
    ],
  },
  {
    label: 'Audio',
    items: [
      { v: 'music', label: 'Music / Song', icon: Music },
      { v: 'voice', label: 'Voice / TTS', icon: Mic },
      { v: 'voice_stt', label: 'Speech-to-text', icon: Mic },
    ],
  },
  {
    label: 'Avatar',
    items: [
      { v: 'avatar', label: 'Avatar generation', icon: User },
      { v: 'talking_avatar', label: 'Talking avatar', icon: User },
      { v: 'lip_sync', label: 'Lip-sync avatar', icon: User },
    ],
  },
  {
    label: 'Brand & Marketing',
    items: [
      { v: 'scrape', label: 'Website scrape / BrandPack', icon: Globe },
      { v: 'campaign', label: 'Campaign content', icon: Layers },
      { v: 'social_reel', label: 'Social / reel pack', icon: Film },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { v: 'rag', label: 'RAG ingest', icon: Database },
      { v: 'rag_search', label: 'RAG search', icon: Database },
    ],
  },
  {
    label: 'Apps & Agents',
    items: [
      { v: 'app_request', label: 'App request', icon: Zap },
      { v: 'agent_task', label: 'Agent task', icon: Layers },
      { v: 'workflow', label: 'Workflow automation', icon: Wrench },
    ],
  },
  {
    label: 'Gated',
    items: [
      { v: 'uncensored', label: 'DeepInfra gated text', icon: ShieldAlert },
    ],
  },
]

function CapabilitySelector({ value, onChange }) {
  const allItems = CAPABILITY_GROUPS.flatMap((g) => g.items)
  const current = allItems.find((item) => item.v === value) || allItems[0]
  const Icon = current.icon
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredGroups = CAPABILITY_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      group.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="relative">
      <Select value={value} onOpenChange={setOpen} onValueChange={(v) => { onChange(v); setSearch('') }}>
        <SelectTrigger className="h-9 w-auto min-w-[200px] gap-2 border-white/[0.08] bg-white/[0.04] text-xs">
          <Icon className="h-3.5 w-3.5 text-cyan-400" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-2 py-1.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search capabilities..."
              className="h-7 border-0 bg-white/[0.04] text-xs focus-visible:ring-0"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
              {group.items.map((item) => (
                <SelectItem key={item.v} value={item.v}>
                  <div className="flex items-center gap-2">
                    <item.icon className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{item.label}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No capabilities found</div>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Mode metadata ──────────────────────────────────────────────
// Maps UI mode keys to backend capabilities and labels.
const MODE_META = {
  chat: { capability: 'text.chat', label: 'Chat' },
  reasoning: { capability: 'text.reasoning', label: 'Reasoning' },
  code: { capability: 'text.code', label: 'Code' },
  research: { capability: 'research', label: 'Research' },
  image: { capability: 'image.generate', label: 'Image generation' },
  image_edit: { capability: 'image.edit', label: 'Image editing' },
  video: { capability: 'video.generate', label: 'Short video' },
  longvideo: { capability: 'video.longform', label: 'Long-form video' },
  image_to_video: { capability: 'video.image_to_video', label: 'Image-to-video' },
  video_edit: { capability: 'video.edit', label: 'Video edit / remix' },
  music: { capability: 'music.generate', label: 'Music / Song' },
  voice: { capability: 'voice.tts', label: 'Voice / TTS' },
  voice_stt: { capability: 'voice.stt', label: 'Speech-to-text' },
  avatar: { capability: 'avatar.generate', label: 'Avatar generation' },
  talking_avatar: { capability: 'avatar.generate', label: 'Talking avatar' },
  lip_sync: { capability: 'avatar.generate', label: 'Lip-sync avatar' },
  scrape: { capability: 'scrape.crawl', label: 'Website scrape' },
  campaign: { capability: 'campaign.generate', label: 'Campaign content' },
  social_reel: { capability: 'social.reel_pack', label: 'Social / reel pack' },
  rag: { capability: 'rag.ingest', label: 'RAG ingest' },
  rag_search: { capability: 'rag.query', label: 'RAG search' },
  app_request: { capability: 'app.request', label: 'App request' },
  agent_task: { capability: 'agent.task', label: 'Agent task' },
  workflow: { capability: 'workflow.automation', label: 'Workflow automation' },
  uncensored: { capability: 'uncensored.text', label: 'DeepInfra gated', gated: true },
}

// Modes that share a schema should use the schema of the primary mode
const SCHEMA_MAP = {
  talking_avatar: 'avatar',
  lip_sync: 'avatar',
}

// ─── Director Block ─────────────────────────────────────────────
function DirectorBlock({ mode, onModeChange }) {
  const { chatHistory, appendBackendPendingChatNotice, generating } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatHistory])

  const send = () => {
    if (!input.trim()) return
    appendBackendPendingChatNotice(input)
    setInput('')
  }

  const meta = MODE_META[mode]

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
      {/* Director header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <MessageSquare className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Director</div>
            <div className="text-[10px] text-muted-foreground">Describe what you want to create</div>
          </div>
        </div>
        <CapabilitySelector value={mode} onChange={onModeChange} />
      </div>

      {/* Chat history */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {chatHistory.map((message, index) => (
          <div key={`${message.timestamp}-${index}`} className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${message.role === 'user' ? 'ml-10 bg-cyan-500/10 text-cyan-100' : 'mr-10 bg-white/[0.04] text-foreground/80'}`}>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
        {generating.chat && (
          <div className="mr-10 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-foreground/80">
            <span className="inline-block h-3 w-px animate-pulse bg-cyan-400" />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex gap-2">
          <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition hover:text-foreground">
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={`Describe your ${meta.label.toLowerCase()} request...`}
              className="h-9 bg-white/[0.04] pr-10 text-sm"
            />
          </div>
          <Button
            onClick={send}
            disabled={!input.trim() || generating.chat}
            className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 p-0 text-black"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Runtime selected</span>
          {meta.gated && <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">DeepInfra gated lane</Badge>}
        </div>
      </div>
    </div>
  )
}

// ─── Right Block: Options / Preview / Assets / Advanced ─────────
function OptionsBlock({ mode, uxMode }) {
  const [activeTab, setActiveTab] = useState('options')
  const meta = MODE_META[mode]
  const schemaKey = SCHEMA_MAP[mode] || mode
  const schema = CAPABILITY_SCHEMAS[schemaKey] || {}
  const backend = getBackendCapability(meta.capability)
  const [values, setValues] = useState({})

  const payload = useMemo(() => ({
    capability: meta.capability,
    backendKey: backend.backendCapability || backend.expectedBackendKey || backend.plannedBackendKey || 'planned',
    route: backend.missing ? 'capability_missing' : 'route_pending',
    status: meta.gated ? 'gated_backend_pending' : 'backend_pending',
    controls: values,
  }), [meta, backend, values])

  const tabs = [
    { key: 'options', label: 'Options', icon: Settings },
    { key: 'preview', label: 'Preview', icon: Eye },
    { key: 'assets', label: 'Assets', icon: Package },
    { key: 'advanced', label: 'Advanced', icon: Wrench },
  ]

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
      {/* Header with tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${activeTab === tab.key ? 'bg-cyan-500/10 text-cyan-300' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
        <div className="ml-auto">
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">{meta.label}</Badge>
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Options tab */}
        {activeTab === 'options' && (
          <div className="p-4">
            <DynamicFormRenderer schema={schema} values={values} onChange={setValues} mode={uxMode} capability={schemaKey} />
          </div>
        )}

        {/* Preview tab */}
        {activeTab === 'preview' && (
          <div className="flex h-full min-h-[300px] items-center justify-center p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
                <Eye className="h-6 w-6 opacity-20" />
              </div>
              <p className="text-sm font-medium text-foreground">Preview area</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Output will appear here after backend integration.</p>
            </div>
          </div>
        )}

        {/* Assets tab */}
        {activeTab === 'assets' && (
          <div className="flex h-full min-h-[300px] items-center justify-center p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
                <Package className="h-6 w-6 opacity-20" />
              </div>
              <p className="text-sm font-medium text-foreground">Asset library</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Generated assets will appear here after backend integration.</p>
            </div>
          </div>
        )}

        {/* Advanced tab - Developer details collapsed by default */}
        {activeTab === 'advanced' && (
          <div className="p-4">
            <Accordion type="multiple" className="space-y-2">
              <AccordionItem value="contract" className="rounded-lg border border-white/[0.06] px-4">
                <AccordionTrigger className="text-xs py-3">Backend contract</AccordionTrigger>
                <AccordionContent>
                  <pre className="overflow-auto rounded-md bg-black/30 p-3 text-[10px] text-muted-foreground">{JSON.stringify(payload, null, 2)}</pre>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="provider" className="rounded-lg border border-white/[0.06] px-4">
                <AccordionTrigger className="text-xs py-3">Provider routing</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Backend key</span><span className="font-mono">{payload.backendKey}</span></div>
                    <div className="flex justify-between"><span>Route status</span><span>{payload.route}</span></div>
                    <div className="flex justify-between"><span>Execution</span><span>{payload.status}</span></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="proof" className="rounded-lg border border-white/[0.06] px-4">
                <AccordionTrigger className="text-xs py-3">Artifact & proof status</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Preview</span><span>backend_pending</span></div>
                    <div className="flex justify-between"><span>Artifact</span><span>backend_pending</span></div>
                    <div className="flex justify-between"><span>Signed URL</span><span>backend_pending</span></div>
                    <div className="flex justify-between"><span>Proof</span><span>live_proof_required</span></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Studio Page ───────────────────────────────────────────
export default function Studio() {
  const [mode, setMode] = useState('chat')
  const [uxMode, setUxMode] = useState('creator')

  const handleModeChange = (newMode) => {
    setMode(newMode)
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Minimal header */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Zap className="h-3 w-3" />
          </div>
          <span className="text-xs font-semibold">AmarktAI Studio</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Creator</span>
          <Switch checked={uxMode === 'pro'} onCheckedChange={(checked) => setUxMode(checked ? 'pro' : 'creator')} className="scale-75" />
          <span>Pro</span>
        </div>
      </header>

      {/* Two-block layout */}
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(320px,0.45fr)_1fr]">
        <DirectorBlock mode={mode} onModeChange={handleModeChange} />
        <OptionsBlock mode={mode} uxMode={uxMode} />
      </div>
    </div>
  )
}
