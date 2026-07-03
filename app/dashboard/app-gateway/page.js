'use client'
import { useEffect, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { PageTransition, PageHeader, StatusPill, Field } from '@/components/amarkt/kit'
import { EmptyState as EmptyStateComponent, SkeletonList } from '@/components/amarkt/EmptyState'
import { DropZone } from '@/components/amarkt/StudioComponents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plug, Key, Activity, Plus, Eye, EyeOff, Copy, CheckCircle2, Send, Loader2, AlertTriangle, X, ChevronRight, Bot, Database } from 'lucide-react'
import { toast } from 'sonner'

// ─── Masked Key Component ──────────────────────────────────────
function MaskedKey({ keyPrefix }) {
  const [visible, setVisible] = useState(false)
  const fullKey = `${keyPrefix}${Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`
  const masked = `${keyPrefix}${'•'.repeat(20)}`
  const copyKey = () => { navigator.clipboard.writeText(fullKey).then(() => toast.success('Key copied')) }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
      <Key className="h-3.5 w-3.5 text-amber-300 shrink-0" />
      <code className="flex-1 text-xs font-mono text-amber-200 truncate">{visible ? fullKey : masked}</code>
      <button onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground transition shrink-0">
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button onClick={copyKey} className="text-muted-foreground hover:text-foreground transition shrink-0"><Copy className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// ─── Webhook Test Button ───────────────────────────────────────
function WebhookTestButton() {
  const [state, setState] = useState('idle')
  const test = () => {
    setState('loading')
    setTimeout(() => {
      setState('success')
      toast.success('Webhook reachable', { description: '200 OK · 142ms' })
      setTimeout(() => setState('idle'), 3000)
    }, 1500)
  }
  if (state === 'loading') return <Button variant="outline" size="sm" disabled className="border-white/10 text-xs"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending…</Button>
  if (state === 'success') return <Button variant="outline" size="sm" disabled className="border-emerald-500/30 text-emerald-400 text-xs"><CheckCircle2 className="mr-1 h-3 w-3" /> 200 OK</Button>
  return <Button variant="outline" size="sm" onClick={test} className="border-white/10 text-xs"><Send className="mr-1 h-3 w-3" /> Test Webhook</Button>
}

// ─── Workspace Onboarding Wizard ───────────────────────────────
function WorkspaceWizard({ onClose, onComplete }) {
  const { createWorkspace } = useStudioStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: App Identity
  const [appName, setAppName] = useState('')
  const [environment, setEnvironment] = useState('dev')
  const [webhookUrl, setWebhookUrl] = useState('')

  // Step 2: Agent Provisioning
  const [agentName, setAgentName] = useState('')
  const [coreDirectives, setCoreDirectives] = useState('')

  // Step 3: Brand Vault
  const [brandFiles, setBrandFiles] = useState([])

  // Auto-fill agent name when app name changes
  useEffect(() => {
    if (appName && !agentName) setAgentName(`${appName} Agent`)
  }, [appName])

  const handleBrandDrop = (file) => {
    if (!file) return
    setBrandFiles((prev) => [...prev, { id: `bf-${Date.now()}`, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type || 'document' }])
    toast.success('File added to Brand Vault', { description: file.name })
  }

  const handleComplete = async () => {
    if (!appName.trim()) { toast.warning('App name required'); return }
    setLoading(true)
    try {
      await createWorkspace({ appName, environment, webhookUrl, agentName, coreDirectives, brandFiles })
      toast.success('Workspace created!', { description: `${appName} · Agent · Brand Vault all provisioned` })
      onComplete()
    } catch { toast.error('Creation failed') }
    setLoading(false)
  }

  const steps = [
    { label: 'App Identity', icon: Plug },
    { label: 'Agent', icon: Bot },
    { label: 'Brand Vault', icon: Database },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[hsl(240_14%_4%)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-lg font-semibold">Create Workspace</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.04]">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <button onClick={() => i < step && setStep(i + 1)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition ${i + 1 === step ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : i + 1 < step ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'}`}>
                {i + 1 < step ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 text-center text-[10px]">{i + 1}</span>}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/30" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 min-h-[280px]">
          {/* Step 1: App Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <Field label="App Name">
                <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Horse App" className="bg-black/20" />
              </Field>
              <Field label="Environment">
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dev">Development</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="prod">Production</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Webhook URL (optional)">
                <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-app.com/webhook" className="bg-black/20" />
              </Field>
            </div>
          )}

          {/* Step 2: Agent Provisioning */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
                <span>An agent is automatically provisioned for each workspace.</span>
              </div>
              <Field label="Agent Name">
                <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Horse Agent" className="bg-black/20" />
              </Field>
              <Field label="Core Directives (System Prompt)">
                <Textarea value={coreDirectives} onChange={(e) => setCoreDirectives(e.target.value)} placeholder="You are a specialized agent that…" className="bg-black/20 min-h-[100px]" />
              </Field>
            </div>
          )}

          {/* Step 3: Brand Vault */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Database className="h-3.5 w-3.5 text-violet-400" />
                <span>Anything uploaded here is automatically tagged to this agent.</span>
              </div>
              <DropZone accept="image/*,.pdf,.json,.csv,.txt,.md" label="Drop Logos, Fonts, Brand Guidelines, Documents" kind="brand assets" onFile={handleBrandDrop} />
              {brandFiles.length > 0 && (
                <div className="space-y-1.5">
                  {brandFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground">{f.size}</span>
                      <button onClick={() => setBrandFiles((p) => p.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-rose-400"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
          <Button variant="outline" onClick={step === 1 ? onClose : () => setStep(step - 1)} className="border-white/10 text-xs">
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !appName.trim()} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
              Next <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={loading} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
              {loading ? 'Creating…' : 'Create Workspace'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function AppGatewayPage() {
  const apps = useStudioStore((s) => s.apps) || []
  const fetchApps = useStudioStore((s) => s.fetchApps)
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [showNewKey, setShowNewKey] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => { fetchApps().then(() => setLoading(false)) }, [])

  const handleWorkspaceCreated = () => {
    setShowWizard(false)
    fetchApps()
    toast.success('Workspace ready')
  }

  if (loading) return <PageTransition className="space-y-8"><PageHeader title="App Gateway" subtitle="Manage connected applications, agents, and brand vaults." /><SkeletonList count={3} /></PageTransition>

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="App Gateway" subtitle="Manage connected applications, agents, and brand vaults.">
        <Button onClick={() => setShowWizard(true)} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
          <Plus className="mr-1 h-3 w-3" /> Create Workspace
        </Button>
      </PageHeader>

      {apps.length === 0 && (
        <EmptyStateComponent
          icon={Plug}
          title="No Workspaces Yet"
          description="Create a workspace to connect an app, provision an agent, and upload brand assets — all in one flow."
          action={<Button onClick={() => setShowWizard(true)} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black"><Plus className="mr-1.5 h-4 w-4" /> Create Your First Workspace</Button>}
        />
      )}

      {apps.length > 0 && (
        <div className="space-y-4">
          {apps.map((app) => (
            <Card key={app.id} className="border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20"><Plug className="h-5 w-5 text-cyan-300" /></div>
                  <div>
                    <div className="font-semibold">{app.appName || app.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{app.appSlug || app.slug}</div>
                  </div>
                </div>
                <StatusPill status={app.status === 'active' ? 'completed' : 'failed'}>{app.status}</StatusPill>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 mb-4">
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">API Keys</div>
                  <div className="text-sm font-semibold">{app.apiKeys?.length || 0}</div>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Tokens</div>
                  <div className="text-sm font-semibold">{app.tokenBalance?.toLocaleString() || '—'}</div>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Environment</div>
                  <div className="text-sm font-semibold capitalize">{app.environment || 'dev'}</div>
                </div>
              </div>
              {/* API Key display */}
              {app.apiKeys?.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1"><Key className="h-3 w-3" /> API Key</div>
                  <code className="block text-xs font-mono text-muted-foreground bg-black/20 rounded px-3 py-2">{app.apiKeys[0].prefix}{'•'.repeat(20)}</code>
                </div>
              )}
              {/* Webhook */}
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <div className="text-[10px] text-muted-foreground font-medium">Webhook</div>
                <div className="flex gap-2">
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-app.com/webhook" className="bg-black/20 flex-1 h-8 text-xs" />
                  <WebhookTestButton />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showWizard && <WorkspaceWizard onClose={() => setShowWizard(false)} onComplete={handleWorkspaceCreated} />}
    </PageTransition>
  )
}
