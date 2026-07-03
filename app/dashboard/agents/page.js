'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DropZone } from '@/components/amarkt/StudioComponents'
import {
  Bot, ShieldCheck, Clock, Activity, AlertTriangle, CheckCircle2, Settings, Zap, BookOpen,
  Plus, Trash2, Upload, Database, FileText, Globe, MessageSquare, Image as ImageIcon,
  Video, Music, Mic, Play, Loader2, Eye, Edit3, ChevronRight, Palette, X,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Mock Agent Data ───────────────────────────────────────────
const MOCK_AGENTS = [
  { id: 'agent-1', name: 'Horse Agent', description: 'Specialized in equestrian content and horse breed knowledge.', status: 'active', knowledge: 12, tasks: 48, avatar: '🐴', capabilities: ['text.chat', 'image.generate', 'brand.scrape'] },
  { id: 'agent-2', name: 'Religious Agent', description: 'Handles religious content with sensitivity and doctrinal accuracy.', status: 'active', knowledge: 24, tasks: 156, avatar: '🕊️', capabilities: ['text.chat', 'rag.search'] },
  { id: 'agent-3', name: 'Code Assistant', description: 'Full-stack coding agent with repo awareness.', status: 'paused', knowledge: 8, tasks: 312, avatar: '💻', capabilities: ['text.chat', 'text.code'] },
  { id: 'agent-4', name: 'Brand Scout', description: 'Automated brand monitoring and competitive intelligence.', status: 'active', knowledge: 6, tasks: 89, avatar: '🔍', capabilities: ['brand.scrape', 'image.generate'] },
]

const ALL_CAPABILITIES = [
  'text.chat', 'text.reasoning', 'text.code', 'image.generate', 'image.edit',
  'video.generate', 'video.longform', 'music.generate', 'voice.tts', 'voice.stt',
  'avatar.generate', 'brand.scrape', 'rag.ingest', 'rag.search',
]

// ─── Knowledge File Item ───────────────────────────────────────
function KnowledgeFile({ file, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
      <FileText className="h-4 w-4 text-cyan-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{file.name}</div>
        <div className="text-[10px] text-muted-foreground">{file.size} · {file.type}</div>
      </div>
      <Badge variant="outline" className={`text-[9px] ${file.status === 'ready' ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}`}>
        {file.status === 'ready' ? 'Ready' : 'Processing…'}
      </Badge>
      <button onClick={onRemove} className="text-muted-foreground hover:text-rose-400 transition"><Trash2 className="h-3 w-3" /></button>
    </div>
  )
}

// ─── Agent Card ────────────────────────────────────────────────
function AgentCard({ agent, selected, onSelect }) {
  return (
    <button onClick={() => onSelect(agent)}
      className={`w-full text-left rounded-xl border p-4 transition-all ${selected ? 'border-cyan-500/40 bg-cyan-500/[0.06] shadow-[0_0_20px_rgba(34,211,238,0.08)]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'}`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">{agent.avatar}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{agent.name}</span>
            <Badge variant="outline" className={`text-[9px] ${agent.status === 'active' ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}`}>
              {agent.status}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{agent.description}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Database className="h-2.5 w-2.5" /> {agent.knowledge} docs</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> {agent.tasks} tasks</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Agent Editor ──────────────────────────────────────────────
function AgentEditor({ agent, onBack }) {
  const [name, setName] = useState(agent?.name || '')
  const [description, setDescription] = useState(agent?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(agent ? `You are ${agent.name}. ${agent.description}` : '')
  const [capabilities, setCapabilities] = useState(agent?.capabilities || [])
  const [knowledgeFiles, setKnowledgeFiles] = useState([])
  const [brandVaultFiles, setBrandVaultFiles] = useState(agent?.brandVault || [])
  const [crossAppAccess, setCrossAppAccess] = useState(agent?.crossAppAccess || false)
  const [autoLearn, setAutoLearn] = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(true)
  const [activeTab, setActiveTab] = useState('knowledge')

  const toggleCapability = (cap) => {
    setCapabilities((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap])
  }

  const handleFileDrop = (file) => {
    if (!file) return
    const newFile = { id: `kf-${Date.now()}`, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type || 'document', status: 'processing' }
    setKnowledgeFiles((prev) => [...prev, newFile])
    setTimeout(() => setKnowledgeFiles((prev) => prev.map((f) => f.id === newFile.id ? { ...f, status: 'ready' } : f)), 2000)
    toast.success('File added', { description: `${file.name} is being processed` })
  }

  const handleBrandDrop = (file) => {
    if (!file) return
    const newFile = { id: `bv-${Date.now()}`, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type || 'document' }
    setBrandVaultFiles((prev) => [...prev, newFile])
    toast.success('Added to Brand Vault', { description: file.name })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition text-xs flex items-center gap-1">
          <ChevronRight className="h-3 w-3 rotate-180" /> Back
        </button>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-sm font-medium">{agent ? `Edit ${agent.name}` : 'Create Agent'}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /> Profile</h3>
          <div className="space-y-3">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" className="bg-black/20" /></Field>
            <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" className="bg-black/20 min-h-[60px]" /></Field>
          </div>
        </Card>

        {/* Core Directives */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Edit3 className="h-4 w-4 text-violet-300" /> Core Directives</h3>
          <Field label="System Prompt (Personality, Rules, Do-Not-Say)">
            <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant that…" className="bg-black/20 min-h-[120px] font-mono text-xs" />
          </Field>
        </Card>

        {/* Knowledge & Brand Vault (Tabbed) */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5 lg:col-span-2">
          <div className="flex items-center gap-1 mb-4">
            <button onClick={() => setActiveTab('knowledge')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === 'knowledge' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Database className="h-3 w-3" /> Knowledge & Memory
            </button>
            <button onClick={() => setActiveTab('brandvault')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === 'brandvault' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Palette className="h-3 w-3" /> Brand Vault
            </button>
          </div>

          {activeTab === 'knowledge' && (
            <div className="space-y-3">
              <DropZone accept=".pdf,.json,.csv,.txt,.md,.js,.ts,.py" label="Drop PDF, JSON, CSV, Code, or Text files" kind="documents" onFile={handleFileDrop} compact />
              {knowledgeFiles.length > 0 && (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {knowledgeFiles.map((f) => <KnowledgeFile key={f.id} file={f} onRemove={() => setKnowledgeFiles((p) => p.filter((x) => x.id !== f.id))} />)}
                </div>
              )}
              {knowledgeFiles.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">No knowledge files. Drop documents above to give this agent memory.</p>
              )}
            </div>
          )}

          {activeTab === 'brandvault' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">Logos, fonts, brand guidelines uploaded during Workspace Onboarding.</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Cross-App Access</span>
                  <Switch checked={crossAppAccess} onCheckedChange={setCrossAppAccess} />
                </div>
              </div>
              <DropZone accept="image/*,.pdf,.json,.csv,.txt" label="Drop Logos, Fonts, Brand Guidelines" kind="brand assets" onFile={handleBrandDrop} compact />
              {brandVaultFiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {brandVaultFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{f.name}</div>
                        <div className="text-[10px] text-muted-foreground">{f.size}</div>
                      </div>
                      <button onClick={() => setBrandVaultFiles((p) => p.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-rose-400"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              {brandVaultFiles.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">No brand assets. Upload logos, fonts, and guidelines above.</p>
              )}
            </div>
          )}
        </Card>

        {/* Allowed Capabilities */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-amber-300" /> Allowed Capabilities</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_CAPABILITIES.map((cap) => (
              <label key={cap} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition ${capabilities.includes(cap) ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-200' : 'border border-white/[0.06] bg-black/20 text-muted-foreground hover:text-foreground'}`}>
                <input type="checkbox" checked={capabilities.includes(cap)} onChange={() => toggleCapability(cap)} className="sr-only" />
                <div className={`h-3 w-3 rounded border flex items-center justify-center shrink-0 ${capabilities.includes(cap) ? 'border-cyan-400 bg-cyan-400' : 'border-white/20'}`}>
                  {capabilities.includes(cap) && <CheckCircle2 className="h-2 w-2 text-black" />}
                </div>
                <span className="truncate">{cap}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Safety Controls */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Safety & Learning</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <div><span className="text-xs">Auto-Learning</span><p className="text-[10px] text-muted-foreground">Learn from interactions</p></div>
              <Switch checked={autoLearn} onCheckedChange={setAutoLearn} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
              <div><span className="text-xs">Approval Required</span><p className="text-[10px] text-muted-foreground">Human approval before execution</p></div>
              <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
            </div>
          </div>
        </Card>

        {/* Automations */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-300" /> Automations</h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Weekly Content Generation</span>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[9px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">Every Monday 8:00 AM → Generate content → Webhook to app</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10"><Play className="h-2.5 w-2.5 mr-1" /> Run Now</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10"><Edit3 className="h-2.5 w-2.5 mr-1" /> Edit</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full border-white/10 text-[10px]"><Plus className="mr-1 h-3 w-3" /> Add Automation</Button>
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-white/[0.06]">
        <Button variant="outline" onClick={onBack} className="border-white/10 text-xs">Cancel</Button>
        <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs" onClick={() => { toast.success('Agent saved'); onBack() }}>
          <CheckCircle2 className="mr-1 h-3 w-3" /> Save Agent
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents] = useState(MOCK_AGENTS)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)

  const handleSelect = (agent) => { setSelected(agent); setCreating(false) }
  const handleCreate = () => { setSelected(null); setCreating(true) }
  const handleBack = () => { setSelected(null); setCreating(false) }

  if (selected || creating) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader title={creating ? 'Create Agent' : `Edit: ${selected?.name}`} subtitle="Configure agent behavior, knowledge, and safety controls." />
        <AgentEditor agent={selected} onBack={handleBack} />
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Agents & Learning" subtitle="Create and manage autonomous AI agents with scoped knowledge and capabilities.">
        <Button onClick={handleCreate} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
          <Plus className="mr-1 h-3 w-3" /> Create Agent
        </Button>
      </PageHeader>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/90">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-xs">Agents are in controlled mode.</div>
          <div className="text-[10px] text-amber-300/70 mt-0.5">No uncontrolled self-learning. All agent actions require approval by default.</div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} selected={selected?.id === agent.id} onSelect={handleSelect} />
        ))}
      </div>
    </PageTransition>
  )
}
