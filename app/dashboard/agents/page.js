'use client'
import { useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropZone } from '@/components/amarkt/StudioComponents'
import {
  Bot, ShieldCheck, Clock, Activity, AlertTriangle, CheckCircle2, Settings, Zap, BookOpen,
  Plus, Trash2, Upload, Database, FileText, Globe, MessageSquare, Image as ImageIcon,
  Video, Music, Mic, Play, Loader2, Eye, Edit3, ChevronRight, Palette, X,
  BarChart3, Calendar, ArrowLeft, Copy, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Mock Agent Data ───────────────────────────────────────────
const MOCK_AGENTS = [
  { id: 'agent-1', name: 'Horse Agent', description: 'Specialized in equestrian content and horse breed knowledge.', status: 'active', knowledge: 12, tasks: 48, avatar: '🐴', capabilities: ['text.chat', 'image.generate', 'brand.scrape'], appSlug: 'horse-app', createdAt: '2026-06-15', lastActive: '2 hours ago' },
  { id: 'agent-2', name: 'Religious Agent', description: 'Handles religious content with sensitivity and doctrinal accuracy.', status: 'active', knowledge: 24, tasks: 156, avatar: '🕊️', capabilities: ['text.chat', 'rag.search'], appSlug: 'faith-app', createdAt: '2026-05-20', lastActive: '1 hour ago' },
  { id: 'agent-3', name: 'Code Assistant', description: 'Full-stack coding agent with repo awareness.', status: 'paused', knowledge: 8, tasks: 312, avatar: '💻', capabilities: ['text.chat', 'text.code'], appSlug: 'dev-tools', createdAt: '2026-04-10', lastActive: '3 days ago' },
  { id: 'agent-4', name: 'Brand Scout', description: 'Automated brand monitoring and competitive intelligence.', status: 'active', knowledge: 6, tasks: 89, avatar: '🔍', capabilities: ['brand.scrape', 'image.generate'], appSlug: 'marketing', createdAt: '2026-06-01', lastActive: '5 hours ago' },
]

const ALL_CAPABILITIES = [
  'text.chat', 'text.reasoning', 'text.code', 'image.generate', 'image.edit',
  'video.generate', 'video.longform', 'music.generate', 'voice.tts', 'voice.stt',
  'avatar.generate', 'brand.scrape', 'rag.ingest', 'rag.search',
]

const MOCK_ACTIVITY = [
  { id: 1, timestamp: '2026-07-02 14:32', capability: 'image.generate', status: 'completed', duration: '2.4s', cost: '$0.003' },
  { id: 2, timestamp: '2026-07-02 13:15', capability: 'text.chat', status: 'completed', duration: '1.1s', cost: '$0.001' },
  { id: 3, timestamp: '2026-07-02 11:48', capability: 'brand.scrape', status: 'failed', duration: '8.2s', cost: '$0.00' },
  { id: 4, timestamp: '2026-07-01 22:10', capability: 'image.generate', status: 'completed', duration: '3.1s', cost: '$0.003' },
  { id: 5, timestamp: '2026-07-01 19:33', capability: 'text.chat', status: 'completed', duration: '0.8s', cost: '$0.001' },
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
function AgentCard({ agent, onSelect }) {
  return (
    <button onClick={() => onSelect(agent)}
      className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/15 hover:bg-white/[0.04]">
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
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {agent.lastActive}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Agent Profile View ────────────────────────────────────────
function AgentProfile({ agent, onBack }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [systemPrompt, setSystemPrompt] = useState(`You are ${agent.name}. ${agent.description}`)
  const [capabilities, setCapabilities] = useState(agent.capabilities || [])
  const [knowledgeFiles, setKnowledgeFiles] = useState([])
  const [brandVaultFiles, setBrandVaultFiles] = useState([])
  const [crossAppAccess, setCrossAppAccess] = useState(false)
  const [autoLearn, setAutoLearn] = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(true)

  const toggleCapability = (cap) => {
    setCapabilities((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap])
  }

  const handleKnowledgeDrop = (file) => {
    if (!file) return
    const newFile = { id: `kf-${Date.now()}`, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type || 'document', status: 'processing' }
    setKnowledgeFiles((prev) => [...prev, newFile])
    setTimeout(() => setKnowledgeFiles((prev) => prev.map((f) => f.id === newFile.id ? { ...f, status: 'ready' } : f)), 2000)
    toast.success('File added', { description: `${file.name} is being processed` })
  }

  const handleBrandDrop = (file) => {
    if (!file) return
    setBrandVaultFiles((prev) => [...prev, { id: `bv-${Date.now()}`, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type || 'document' }])
    toast.success('Added to Brand Vault', { description: file.name })
  }

  const TABS = [
    { v: 'overview', label: 'Overview', icon: Bot },
    { v: 'knowledge', label: 'Knowledge', icon: Database },
    { v: 'directives', label: 'Core Directives', icon: Edit3 },
    { v: 'automations', label: 'Automations', icon: Clock },
    { v: 'brandvault', label: 'Brand Vault', icon: Palette },
    { v: 'activity', label: 'Activity Logs', icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition"><ArrowLeft className="h-4 w-4" /></button>
        <div className="text-2xl">{agent.avatar}</div>
        <div>
          <div className="text-lg font-semibold">{agent.name}</div>
          <div className="text-xs text-muted-foreground">{agent.appSlug} · {agent.status}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto hide-scrollbar">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setActiveTab(t.v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition border-b-2 ${activeTab === t.v ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="text-sm font-semibold mb-4">Profile</h3>
            <div className="space-y-3">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-black/20" /></Field>
              <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-black/20 min-h-[60px]" /></Field>
            </div>
          </Card>
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="text-sm font-semibold mb-4">Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{agent.createdAt}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Active</span><span>{agent.lastActive}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">App Slug</span><span className="font-mono text-xs">{agent.appSlug}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Knowledge Docs</span><span>{agent.knowledge}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tasks Run</span><span>{agent.tasks}</span></div>
            </div>
          </Card>
          <Card className="border-white/[0.07] bg-white/[0.02] p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4">Allowed Capabilities</h3>
            <div className="flex flex-wrap gap-1.5">
              {capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">{cap}</Badge>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Database className="h-4 w-4 text-emerald-300" /> Knowledge & Memory</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Upload documents, data, or code to teach this Agent. Each file is tagged with this agent's ID for isolation.</p>
          <DropZone accept=".pdf,.doc,.docx,.txt,.json,.csv,.md,.js,.ts,.py" label="Drop PDF, DOCX, JSON, CSV, Code, or Text files" kind="documents" onFile={handleKnowledgeDrop} compact />
          {knowledgeFiles.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[300px] overflow-y-auto">
              {knowledgeFiles.map((f) => <KnowledgeFile key={f.id} file={f} onRemove={() => setKnowledgeFiles((p) => p.filter((x) => x.id !== f.id))} />)}
            </div>
          )}
          {knowledgeFiles.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">No knowledge files. Drop documents above to give this agent memory.</p>
          )}
        </Card>
      )}

      {activeTab === 'directives' && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Edit3 className="h-4 w-4 text-violet-300" /> Core Directives</h3>
          <Field label="System Prompt (Personality, Rules, Do-Not-Say)">
            <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant that…" className="bg-black/20 min-h-[200px] font-mono text-xs" />
          </Field>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{systemPrompt.length} characters</span>
            <Button size="sm" className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs" onClick={() => toast.success('Directives saved')}>Save</Button>
          </div>
        </Card>
      )}

      {activeTab === 'automations' && (
        <div className="space-y-4">
          <Card className="border-white/[0.07] bg-white/[0.02] p-5">
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
              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Daily Brand Monitoring</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[9px]">Active</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">Every day 6:00 AM → Scrape competitor sites → Update brand vault</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10"><Play className="h-2.5 w-2.5 mr-1" /> Run Now</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10"><Edit3 className="h-2.5 w-2.5 mr-1" /> Edit</Button>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full border-white/10 text-[10px] mt-3"><Plus className="mr-1 h-3 w-3" /> Add Automation</Button>
          </Card>
        </div>
      )}

      {activeTab === 'brandvault' && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Palette className="h-4 w-4 text-violet-300" /> Brand Vault</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Cross-App Access</span>
              <Switch checked={crossAppAccess} onCheckedChange={setCrossAppAccess} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">Logos, fonts, brand guidelines uploaded during Workspace Onboarding. Enable Cross-App Access to share with other agents.</p>
          <DropZone accept="image/*,.pdf,.json,.csv,.txt" label="Drop Logos, Fonts, Brand Guidelines" kind="brand assets" onFile={handleBrandDrop} compact />
          {brandVaultFiles.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
            <p className="text-[10px] text-muted-foreground text-center py-6">No brand assets uploaded yet.</p>
          )}
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-300" /> Activity Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Capability</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Duration</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ACTIVITY.map((row) => (
                  <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition">
                    <td className="px-3 py-2 text-xs">{row.timestamp}</td>
                    <td className="px-3 py-2 text-xs font-mono">{row.capability}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[9px] ${row.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{row.duration}</td>
                    <td className="px-3 py-2 text-xs">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Save Button */}
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

  if (selected) {
    return (
      <PageTransition className="space-y-6">
        <AgentProfile agent={selected} onBack={handleBack} />
      </PageTransition>
    )
  }

  if (creating) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader title="Create Agent" subtitle="Provision a new agent with knowledge, directives, and capabilities." />
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <p className="text-sm text-muted-foreground text-center py-8">Use the Workspace Wizard in App Gateway to create a new App + Agent + Brand Vault together.</p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard/app-gateway"><Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"><Plus className="mr-1 h-3 w-3" /> Open Workspace Wizard</Button></Link>
            <Button variant="outline" onClick={handleBack} className="border-white/10 text-xs">Cancel</Button>
          </div>
        </Card>
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
          <AgentCard key={agent.id} agent={agent} onSelect={handleSelect} />
        ))}
      </div>
    </PageTransition>
  )
}
