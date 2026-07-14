'use client'

import { useEffect, useRef, useState } from 'react'
import { useStudioStore } from '@/lib/useStudioStore'
import { CAPABILITY_SCHEMAS } from '@/lib/studio-capability-schemas'
import { getBackendCapability } from '@/lib/capability-map'
import { TARGET_CAPABILITY_CATALOG, groupedCapabilities } from '@/lib/capability-catalog'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import {
  getRuntimeCapabilityProof,
  runtimeProofStatusClasses,
  runtimeProofStatusLabel,
} from '@/lib/runtime-proof-status'
import DynamicFormRenderer from '@/components/amarkt/DynamicFormRenderer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  MessageSquare, Image as ImageIcon, Video, Music, User, Globe, Database,
  Send, Zap, ShieldAlert, Settings, Paperclip, Wrench, Eye, Package, Layers, Lock, FileText,
} from 'lucide-react'

const STUDIO_ICON_BY_FAMILY = {
  Language: MessageSquare,
  Intelligence: Globe,
  Image: ImageIcon,
  Video,
  Audio: Music,
  Avatar: User,
  Knowledge: Database,
  Document: FileText,
  Marketing: Layers,
  Multimodal: Zap,
  'Adult Governed': ShieldAlert,
}

const CAPABILITY_GROUPS = groupedCapabilities().map((group) => ({
  label: group.family,
  items: group.items.map((item) => ({
    v: item.studioMode,
    label: item.label,
    icon: STUDIO_ICON_BY_FAMILY[item.family] ?? Wrench,
  })),
}))

const MODE_META = Object.fromEntries(TARGET_CAPABILITY_CATALOG.map((item) => [
  item.studioMode,
  {
    capability: item.dashboardType,
    label: item.label,
    schemaKey: item.schemaKey,
    outputType: item.outputType,
    artifactRequired: item.artifactRequired,
    gated: item.policyRequirement !== 'standard',
  },
]))

const PREVIEW_LABELS = Object.fromEntries(TARGET_CAPABILITY_CATALOG.map((item) => [
  item.studioMode,
  `No ${item.label.toLowerCase()} output for this run`,
]))

const ASSETS_LABELS = Object.fromEntries(TARGET_CAPABILITY_CATALOG.map((item) => [
  item.studioMode,
  item.artifactRequired ? `${item.label} assets and artifacts` : `${item.label} context`,
]))

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function artifactErrorMessage(status) {
  if (status === 401) return 'Unauthorized'
  if (status === 404) return 'Artifact file not found'
  if (status === 409) return 'Artifact is not ready'
  if (status === 502) return 'Backend unavailable'
  return 'Artifact preview unavailable'
}

function getModeProof(runtimeProofStatus, mode) {
  const meta = MODE_META[mode] ?? MODE_META.chat
  const backend = getBackendCapability(meta.capability)
  return getRuntimeCapabilityProof(runtimeProofStatus, backend.backendCapability || backend.plannedBackendKey || meta.capability)
}

function StudioArtifactPreview({ jobResult }) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const artifactId = jobResult?.artifactId

  useEffect(() => {
    if (!artifactId || jobResult?.status !== 'completed') {
      setPreviewUrl('')
      setPreviewError('')
      return undefined
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
    let objectUrl = ''
    let cancelled = false

    async function loadPreview() {
      try {
        let mimeType = jobResult.mimeType || ''
        if (!mimeType) {
          const detailResponse = await fetch(`/api/admin/artifacts/${artifactId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (!detailResponse.ok) {
            setPreviewError(artifactErrorMessage(detailResponse.status))
            return
          }
          const detail = await detailResponse.json()
          mimeType = detail?.mimeType || ''
        }

        if (!IMAGE_MIME_TYPES.has(mimeType)) {
          setPreviewError('Preview available from Artifacts page')
          return
        }

        const fileResponse = await fetch(`/api/admin/artifacts/${artifactId}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!fileResponse.ok) {
          setPreviewError(artifactErrorMessage(fileResponse.status))
          return
        }

        const blob = await fileResponse.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setPreviewUrl(objectUrl)
      } catch {
        if (!cancelled) setPreviewError('Backend unavailable')
      }
    }

    setPreviewUrl('')
    setPreviewError('')
    loadPreview()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [artifactId, jobResult?.mimeType, jobResult?.status])

  if (!artifactId) return null

  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-2">
      {previewUrl ? (
        <img src={previewUrl} alt="Generated artifact preview" className="max-h-72 w-full rounded-md object-contain" />
      ) : previewError ? (
        <div className="text-[10px] text-amber-200">{previewError}</div>
      ) : (
        <div className="text-[10px] text-muted-foreground">Loading artifact preview...</div>
      )}
    </div>
  )
}

function CapabilitySelector({ value, onChange, runtimeProofStatus }) {
  const allItems = CAPABILITY_GROUPS.flatMap((group) => group.items)
  const current = allItems.find((item) => item.v === value) || allItems[0]
  const Icon = current.icon
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
      <Select value={value} onValueChange={(nextMode) => { onChange(nextMode); setSearch('') }}>
        <SelectTrigger className="h-9 w-auto min-w-[220px] gap-2 border-white/[0.08] bg-white/[0.04] text-xs">
          <Icon className="h-3.5 w-3.5 text-cyan-400" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-2 py-1.5">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search capabilities..." className="h-7 border-0 bg-white/[0.04] text-xs focus-visible:ring-0" onKeyDown={(event) => event.stopPropagation()} />
          </div>
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
              {group.items.map((item) => {
                const proof = getModeProof(runtimeProofStatus, item.v)
                const ready = proof.readyForDashboardExecution === true

                return (
                  <SelectItem key={item.v} value={item.v} disabled={!ready}>
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-cyan-400" />
                      <span>{item.label}</span>
                      <span className={`ml-auto text-[9px] ${ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {ready ? 'Backend ready' : 'Not proven'}
                      </span>
                    </div>
                  </SelectItem>
                )
              })}
            </div>
          ))}
          {filteredGroups.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No capabilities found</div>}
        </SelectContent>
      </Select>
    </div>
  )
}

function DirectorBlock({ mode, onModeChange, runtimeProofStatus }) {
  const { chatHistory, submitDraft } = useStudioStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatHistory])

  const meta = MODE_META[mode] ?? MODE_META.chat
  const proof = getModeProof(runtimeProofStatus, mode)
  const backendReady = proof.readyForDashboardExecution === true

  const send = () => {
    if (!input.trim() || !backendReady) return
    submitDraft(input)
    setInput('')
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
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
        <CapabilitySelector value={mode} onChange={onModeChange} runtimeProofStatus={runtimeProofStatus} />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {chatHistory.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground/50">Draft your request below. Backend proof is required before Studio submission.</p>
          </div>
        )}
        {chatHistory.map((message, index) => (
          <div key={`${message.timestamp}-${index}`} className="ml-10 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs leading-relaxed text-cyan-100">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex gap-2">
          <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition hover:text-foreground">
            <Paperclip className="h-4 w-4" />
          </button>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && send()}
            placeholder={`Describe your ${meta.label.toLowerCase()} request...`}
            className="h-9 bg-white/[0.04] text-sm"
          />
          <Button
            onClick={send}
            disabled={!input.trim() || !backendReady}
            className="h-9 shrink-0 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-3 text-black"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Runtime selected</span>
          <Badge variant="outline" className={`text-[9px] ${runtimeProofStatusClasses(proof)}`}>
            {runtimeProofStatusLabel(proof)}
          </Badge>
          {!backendReady && <span className="text-[10px] text-muted-foreground">Disabled until backend proof passes</span>}
          {meta.gated && <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">Policy gated</Badge>}
        </div>
      </div>
    </div>
  )
}

function OptionsBlock({ mode, uxMode, values, setValues, runtimeProofStatus }) {
  const [activeTab, setActiveTab] = useState('options')
  const [submitting, setSubmitting] = useState(false)
  const [jobResult, setJobResult] = useState(null)
  const meta = MODE_META[mode] ?? MODE_META.chat
  const schemaKey = meta.schemaKey || mode
  const schema = CAPABILITY_SCHEMAS[schemaKey] || CAPABILITY_SCHEMAS.chat || {}
  const backend = getBackendCapability(meta.capability)
  const proof = getModeProof(runtimeProofStatus, mode)
  const backendReady = proof.readyForDashboardExecution === true

  const tabs = [
    { key: 'options', label: 'Options', icon: Settings },
    { key: 'preview', label: 'Preview', icon: Eye },
    { key: 'assets', label: 'Assets', icon: Package },
    { key: 'developer', label: 'Developer', icon: Wrench },
  ]

  const handleSubmit = async () => {
    if (!backendReady || submitting) return
    const backendCapability = backend.backendCapability
    if (!backendCapability) {
      setJobResult({ status: 'failed', error: 'Capability is not mapped to a backend execution key' })
      return
    }
    setSubmitting(true)
    setJobResult(null)
    try {
      const { submitJob, pollJob } = useStudioStore.getState()
      const result = await submitJob(backendCapability, values)
      if (result.ok && result.jobId) {
        // Poll until complete or timeout
        let attempts = 0
        let job = null
        while (attempts < 60) {
          job = await pollJob(result.jobId)
          if (!job || job.status === 'completed' || job.status === 'failed') break
          await new Promise((r) => setTimeout(r, 2000))
          attempts++
        }
        setJobResult(job || { status: 'timeout', error: 'Job polling timed out' })
      } else {
        setJobResult({ status: 'failed', error: result.error })
      }
    } catch (err) {
      setJobResult({ status: 'failed', error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${activeTab === tab.key ? 'bg-cyan-500/10 text-cyan-300' : 'text-muted-foreground hover:text-foreground'}`}>
            <tab.icon className="h-3 w-3" />{tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${runtimeProofStatusClasses(proof)}`}>{runtimeProofStatusLabel(proof)}</Badge>
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">{meta.label}</Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'options' && (
          <div className="p-4">
            <DynamicFormRenderer schema={schema} values={values} onChange={setValues} mode={uxMode} capability={schemaKey} />
            <div className="mt-4 flex items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={!backendReady || submitting}
                className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"
              >
                <Send className="mr-1.5 h-3 w-3" />
                {submitting ? 'Submitting...' : 'Run'}
              </Button>
              {!backendReady && <span className="text-[10px] text-muted-foreground">Disabled until backend proof passes</span>}
            </div>
            {jobResult && (
              <div className={`mt-3 rounded-lg border p-3 text-xs ${jobResult.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : jobResult.status === 'failed' ? 'border-rose-500/30 bg-rose-500/[0.04]' : 'border-amber-500/30 bg-amber-500/[0.04]'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{jobResult.status === 'completed' ? 'Job completed' : jobResult.status === 'failed' ? 'Job failed' : `Job ${jobResult.status}`}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{jobResult.id?.slice(0, 8)}...</span>
                </div>
                {jobResult.provider && <div className="mt-1">Provider: <span className="text-violet-300">{jobResult.provider}</span></div>}
                {jobResult.model && <div>Model: <span className="font-mono text-[10px]">{jobResult.model}</span></div>}
                {jobResult.output && <pre className="mt-2 overflow-auto max-h-40 text-[10px] bg-black/30 rounded p-2">{jobResult.output}</pre>}
                <StudioArtifactPreview jobResult={jobResult} />
                {jobResult.error && <div className="mt-1 text-rose-300">{jobResult.error}</div>}
                {jobResult.artifactId && (
                  <div className="mt-2 flex items-center gap-2">
                    <span>Artifact:</span>
                    <a href="/dashboard/artifacts" className="text-cyan-300 hover:underline">{jobResult.artifactId.slice(0, 8)}...</a>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <a href="/dashboard/jobs" className="text-cyan-300 hover:underline text-[10px]">View all jobs</a>
                  {jobResult.artifactId && <a href="/dashboard/artifacts" className="text-cyan-300 hover:underline text-[10px]">View artifacts</a>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="flex h-full min-h-[300px] items-center justify-center p-6">
            <div className="text-center">
              {jobResult && jobResult.status === 'completed' ? (
                <div className="space-y-3">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04]"><Eye className="h-6 w-6 text-emerald-300" /></div>
                  <p className="text-sm font-medium text-foreground">Job completed</p>
                  {jobResult.provider && <p className="text-xs text-muted-foreground">Provider: <span className="text-violet-300">{jobResult.provider}</span></p>}
                  {jobResult.model && <p className="text-xs text-muted-foreground">Model: <span className="font-mono">{jobResult.model}</span></p>}
                  {jobResult.output && <pre className="mt-2 overflow-auto max-h-40 text-[10px] bg-black/30 rounded p-2 text-left">{jobResult.output}</pre>}
                  <StudioArtifactPreview jobResult={jobResult} />
                  {jobResult.artifactId && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <a href="/dashboard/artifacts" className="text-cyan-300 hover:underline text-xs">View in Artifacts</a>
                    </div>
                  )}
                </div>
              ) : jobResult && jobResult.status === 'failed' ? (
                <div className="space-y-3">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/[0.04]"><Eye className="h-6 w-6 text-rose-300" /></div>
                  <p className="text-sm font-medium text-foreground">Job failed</p>
                  {jobResult.error && <p className="text-xs text-rose-300">{jobResult.error}</p>}
                </div>
              ) : (
                <div>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]"><Eye className="h-6 w-6 opacity-20" /></div>
                  <p className="text-sm font-medium text-foreground">{PREVIEW_LABELS[mode] || 'No output for this run'}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Run an enabled capability to populate this panel.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="flex h-full min-h-[300px] items-center justify-center p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]"><Package className="h-6 w-6 opacity-20" /></div>
              <p className="text-sm font-medium text-foreground">{ASSETS_LABELS[mode] || 'Asset library'}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Uploaded inputs and generated artifacts stay backend-controlled.</p>
            </div>
          </div>
        )}

        {activeTab === 'developer' && (
          <div className="p-4">
            <Accordion type="multiple" className="space-y-2">
              <AccordionItem value="controls" className="rounded-lg border border-white/[0.06] px-4">
                <AccordionTrigger className="text-xs py-3">Selected controls</AccordionTrigger>
                <AccordionContent>
                  <pre className="overflow-auto rounded-md bg-black/30 p-3 text-[10px] text-muted-foreground">{JSON.stringify(values, null, 2) || '{}'}</pre>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="contract" className="rounded-lg border border-white/[0.06] px-4">
                <AccordionTrigger className="text-xs py-3">Developer contract</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Dashboard key</span><span className="font-mono">{meta.capability}</span></div>
                    <div className="flex justify-between"><span>Backend key</span><span className="font-mono">{backend.backendCapability || backend.plannedBackendKey || 'planned'}</span></div>
                    <div className="flex justify-between"><span>Route</span><span className={backend.missing ? 'text-rose-300' : 'text-emerald-300'}>{backend.missing ? 'capability_missing' : 'wired'}</span></div>
                    <div className="flex justify-between"><span>Execution</span><span className={backendReady ? 'text-emerald-300' : 'text-amber-300'}>{backendReady ? 'backend_ready' : 'not_dashboard_ready'}</span></div>
                    <div className="flex justify-between"><span>Output type</span><span>{meta.outputType}</span></div>
                    <div className="flex justify-between"><span>Artifact</span><span>{meta.artifactRequired ? 'required' : 'not required'}</span></div>
                    <div className="flex justify-between"><span>Proof source</span><span>backend-runtime-proof-status</span></div>
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

export default function Studio() {
  const [mode, setMode] = useState('chat')
  const [uxMode, setUxMode] = useState('creator')
  const [valuesByMode, setValuesByMode] = useState({})
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const currentValues = valuesByMode[mode] || {}
  const setCurrentValues = (next) => setValuesByMode((prev) => ({ ...prev, [mode]: next }))

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[hsl(240_14%_4%)] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black"><Zap className="h-3 w-3" /></div>
          <span className="text-xs font-semibold">Developer Studio / Legacy</span>
          <span className="text-[9px] text-muted-foreground">Execution tester</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Creator</span>
          <Switch checked={uxMode === 'pro'} onCheckedChange={(checked) => setUxMode(checked ? 'pro' : 'creator')} className="scale-75" />
          <span>Pro</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(320px,0.45fr)_1fr]">
        <DirectorBlock mode={mode} onModeChange={setMode} runtimeProofStatus={runtimeProofStatus} />
        <OptionsBlock mode={mode} uxMode={uxMode} values={currentValues} setValues={setCurrentValues} runtimeProofStatus={runtimeProofStatus} />
      </div>
    </div>
  )
}
