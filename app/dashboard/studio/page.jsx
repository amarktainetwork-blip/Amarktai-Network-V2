'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/studio-capability-schemas'
import { PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'
import { getBackendCapability } from '@/lib/capability-map'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  MessageSquare, Image as ImageIcon, Video, Film, Music, Mic, User, Globe, Database,
  Sparkles, Send, X, Zap, Code2, ShieldAlert, ClipboardList, Package, Layers, Lock,
} from 'lucide-react'
import { toast } from 'sonner'

const MODES = [
  { v: 'chat', label: 'Chat', icon: MessageSquare, capability: 'text.chat', provider: 'groq' },
  { v: 'image', label: 'Image', icon: ImageIcon, capability: 'image.generate', provider: 'together' },
  { v: 'video', label: 'Video', icon: Video, capability: 'video.generate', provider: 'genx' },
  { v: 'longvideo', label: 'Long-form', icon: Film, capability: 'video.longform', provider: 'genx' },
  { v: 'music', label: 'Music', icon: Music, capability: 'music.generate', provider: 'genx' },
  { v: 'voice', label: 'Voice', icon: Mic, capability: 'voice.tts', provider: 'groq' },
  { v: 'avatar', label: 'Avatar', icon: User, capability: 'avatar.generate', provider: 'genx' },
  { v: 'scrape', label: 'Scrape', icon: Globe, capability: 'scrape.crawl', provider: 'local_tool' },
  { v: 'rag', label: 'RAG', icon: Database, capability: 'rag.ingest', provider: 'together' },
  { v: 'code', label: 'Code', icon: Code2, capability: 'text.code', provider: 'mimo' },
  { v: 'uncensored', label: 'Gated', icon: ShieldAlert, capability: 'uncensored.text', provider: 'deepinfra', gated: true },
]

const CHIP_KEYS = {
  chat: ['purpose', 'tone', 'language'],
  image: ['style', 'aspect_ratio', 'quality'],
  video: ['mode', 'duration', 'camera_movement'],
  longvideo: ['source', 'target_duration', 'scene_count'],
  music: ['genre', 'vocal_style', 'target_duration'],
  voice: ['mode', 'gender', 'accent'],
  avatar: ['avatar_library', 'voice_source', 'background'],
  scrape: ['crawl_depth', 'extract_logo', 'extract_colors'],
  rag: ['top_k', 'embedding_provider', 'citations_required'],
  code: ['language_framework', 'reasoning_depth', 'output_format'],
  uncensored: ['provider', 'backend_gating', 'safe_flow_exposure'],
}

function firstOption(def) {
  if (!def) return ''
  if (def.type === 'boolean') return false
  if (def.type === 'number') return def.min ?? 0
  if (Array.isArray(def.options)) {
    const option = def.options[0]
    return typeof option === 'string' ? option : option?.value
  }
  return ''
}

function PreviewCanvas({ mode }) {
  const current = MODES.find((item) => item.v === mode)
  const Icon = current?.icon || Zap

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.08),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent)]">
      <div className="flex max-w-lg flex-col items-center px-6 text-center text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
          <Icon className="h-7 w-7 opacity-30" />
        </div>
        <p className="text-sm font-medium text-foreground">Backend integration pending.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Real previews appear after /api/v1 jobs and artifacts are wired.
        </p>
        <div className="mt-5 grid w-full grid-cols-3 gap-2 text-left text-[10px]">
          {['jobs pending backend', 'artifacts pending backend', 'live proof required'].map((label) => (
            <div key={label} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-muted-foreground">{label}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DirectorPanel({ onClose }) {
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

  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold"><MessageSquare className="h-3.5 w-3.5 text-cyan-300" /> Director draft panel</div>
        <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {chatHistory.map((message, index) => (
          <div key={`${message.timestamp}-${index}`} className={`rounded-lg px-3 py-2 text-xs ${message.role === 'user' ? 'ml-12 bg-cyan-500/10 text-cyan-100' : 'mr-12 bg-white/[0.04] text-foreground/80'}`}>
            {message.content}
          </div>
        ))}
        {generating.chat && <div className="mr-12 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-foreground/80">Appending backend-pending notice</div>}
      </div>
      <div className="flex gap-2 border-t border-white/[0.06] px-4 py-2">
        <Input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Draft a request note..." className="h-8 flex-1 rounded-lg bg-black/20 text-xs" />
        <Button onClick={send} size="sm" className="h-8 w-8 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 p-0 text-black"><Send className="h-3 w-3" /></Button>
      </div>
    </div>
  )
}

function StatusCard({ title, icon: Icon, rows }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-cyan-300" /> {title}</div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row[0]} className="flex items-center justify-between gap-3 text-[10px]">
            <span className="text-muted-foreground">{row[0]}</span>
            <span className="text-right font-mono text-foreground/80">{row[1]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Studio() {
  const [mode, setMode] = useState('chat')
  const [uxMode, setUxMode] = useState('creator')
  const [valuesByMode, setValuesByMode] = useState({})
  const [prompt, setPrompt] = useState('')
  const [showChat, setShowChat] = useState(false)
  const currentMode = MODES.find((item) => item.v === mode) || MODES[0]
  const schema = CAPABILITY_SCHEMAS[mode] || {}
  const values = valuesByMode[mode] || {}
  const backend = getBackendCapability(currentMode.capability)
  const provider = PROVIDER_CONTRACTS.find((item) => item.id === currentMode.provider)

  const payload = useMemo(() => ({
    dashboardCapability: currentMode.capability,
    backendCapability: backend.backendCapability,
    routeStatus: backend.missing ? 'capability_missing' : 'route_pending',
    providerId: currentMode.provider,
    status: currentMode.gated ? 'gated_backend_pending' : 'backend_pending',
    controls: values,
    prompt,
  }), [backend.backendCapability, backend.missing, currentMode, prompt, values])

  const setValues = (nextValues) => setValuesByMode((previous) => ({ ...previous, [mode]: nextValues }))

  const quickChips = CHIP_KEYS[mode] || []

  const run = () => {
    if (mode === 'chat' && prompt.trim()) {
      const { appendBackendPendingChatNotice } = useStudioStore.getState()
      appendBackendPendingChatNotice(prompt)
      setPrompt('')
      setShowChat(true)
      return
    }
    toast.info('Backend integration pending', {
      description: 'Execution is disabled until /api/v1 jobs, artifacts, and provider routes are wired.',
    })
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black"><Zap className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-bold tracking-tight">AmarktAI Studio</div>
            <div className="text-[9px] text-muted-foreground">Frontend contract control room</div>
          </div>
        </div>
        <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">{currentMode.capability}</Badge>
        {currentMode.gated && <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">DeepInfra gated lane</Badge>}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>Creator</span>
          <Switch checked={uxMode === 'pro'} onCheckedChange={(checked) => setUxMode(checked ? 'pro' : 'creator')} />
          <span>Pro</span>
        </div>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden">
        <PreviewCanvas mode={mode} />
        {showChat && <DirectorPanel onClose={() => setShowChat(false)} />}
      </section>

      <section className="grid h-[360px] shrink-0 grid-cols-[minmax(320px,1fr)_minmax(380px,1.2fr)_minmax(320px,0.9fr)] border-t border-white/[0.06] bg-[hsl(240_14%_3.5%)] max-xl:grid-cols-[minmax(300px,1fr)_minmax(360px,1fr)] max-lg:h-[420px] max-lg:grid-cols-1">
        <div className="flex min-h-0 flex-col border-r border-white/[0.06] p-3 max-lg:border-r-0 max-lg:border-b">
          <div className="mb-2 grid grid-cols-5 gap-1.5">
            {MODES.map((item) => (
              <button
                key={item.v}
                onClick={() => setMode(item.v)}
                className={`flex min-h-10 items-center justify-center rounded-md border text-[10px] transition ${mode === item.v ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}
                title={item.label}
              >
                <item.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickChips.map((key) => {
              const def = schema[key]
              if (!def) return null
              const value = values[key] ?? firstOption(def)
              return <Badge key={key} variant="outline" className="border-white/10 text-[10px]">{def.label}: {String(Array.isArray(value) ? value[0] || 'draft' : value)}</Badge>
            })}
          </div>
          <div className="mt-auto space-y-2">
            <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && run()} placeholder={mode === 'chat' ? 'Ask the Director draft panel...' : `Describe ${currentMode.label.toLowerCase()} request...`} className="h-10 rounded-xl bg-black/20 text-sm" />
            <div className="flex gap-2">
              <Button onClick={run} className="h-10 flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
                {mode === 'chat' ? <Send className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                {mode === 'chat' ? 'Draft notice' : 'Backend Pending'}
              </Button>
              <Button variant="outline" onClick={() => setShowChat(true)} className="h-10 rounded-xl border-white/10"><MessageSquare className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-3">
          <DynamicFormRenderer schema={schema} values={values} onChange={setValues} mode={uxMode} capability={mode} />
        </div>

        <aside className="min-h-0 space-y-3 overflow-y-auto border-l border-white/[0.06] p-3 max-xl:col-span-2 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1">
          <StatusCard icon={ClipboardList} title="Request inspector" rows={[
            ['payload', 'draft only'],
            ['backend key', backend.backendCapability || backend.expectedBackendKey || backend.plannedBackendKey || 'planned'],
            ['route', backend.missing ? 'capability_missing' : 'route_pending'],
          ]} />
          <StatusCard icon={Layers} title="Provider candidates" rows={[
            ['primary', provider?.name || 'Local tool'],
            ['status', provider?.status || 'backend_pending'],
            ['proof', provider?.proofStatus || 'live_proof_required'],
          ]} />
          <StatusCard icon={Package} title="Artifact / proof" rows={[
            ['preview', 'backend_pending'],
            ['artifact', 'backend_pending'],
            ['signed URL', 'backend_pending'],
          ]} />
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="mb-2 text-xs font-semibold">Payload preview</div>
            <pre className="max-h-40 overflow-auto rounded-md bg-black/30 p-2 text-[10px] text-muted-foreground">{JSON.stringify(payload, null, 2)}</pre>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs">
              <div className="font-semibold">Asset bin</div>
              <p className="mt-1 text-[10px] text-muted-foreground">Draft uploads only. Real artifacts pending backend.</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs">
              <div className="font-semibold">Timeline</div>
              <p className="mt-1 text-[10px] text-muted-foreground">Assembly shell ready. Jobs route pending.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
