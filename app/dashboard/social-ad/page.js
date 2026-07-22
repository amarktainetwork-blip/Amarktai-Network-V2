'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Film, Loader2, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { PageHeader, PageTransition } from '@/components/amarkt/kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const CHANNELS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x']
const RATIOS = ['16:9', '9:16', '1:1']
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function authHeaders(appSlug, json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : ''
  return {
    Authorization: token ? `Bearer ${token}` : '',
    ...(appSlug ? { 'x-amarktai-app-slug': appSlug } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.code || `Request failed (${response.status})`)
  return body
}

export default function SocialAdWorkspacePage() {
  const [contexts, setContexts] = useState([])
  const [appSlug, setAppSlug] = useState('')
  const [brandProfileId, setBrandProfileId] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [offeringId, setOfferingId] = useState('')
  const [productArtifactId, setProductArtifactId] = useState('')
  const [logoArtifactIds, setLogoArtifactIds] = useState([])
  const [audienceId, setAudienceId] = useState('')
  const [objective, setObjective] = useState('Launch the approved product with a clear, credible social story.')
  const [brief, setBrief] = useState('Present the approved product inside a social post card, then create a visible frame-boundary breakout with controlled motion and strong product identity preservation.')
  const [cta, setCta] = useState('Learn more')
  const [channels, setChannels] = useState([...CHANNELS])
  const [ratios, setRatios] = useState([...RATIOS])
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [candidateCount, setCandidateCount] = useState(3)
  const [qualityProfile, setQualityProfile] = useState('premium')
  const [maxCredits, setMaxCredits] = useState(100)
  const [includeCaptions, setIncludeCaptions] = useState(true)
  const [includeSubtitles, setIncludeSubtitles] = useState(true)
  const [includeThumbnail, setIncludeThumbnail] = useState(true)
  const [includeSocialCopy, setIncludeSocialCopy] = useState(true)
  const [plan, setPlan] = useState(null)
  const [execution, setExecution] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const context = contexts.find((item) => item.appSlug === appSlug) ?? null
  const profile = context?.profiles?.find((item) => item.brandProfileId === brandProfileId) ?? null
  const campaignRecord = context?.campaigns?.find((item) => item.id === campaignId) ?? null
  const campaign = campaignRecord?.brief ?? null
  const offering = profile?.offerings?.find((item) => item.offeringId === offeringId) ?? null
  const productAssets = profile?.visual?.assets?.filter((asset) => ['product', 'offering'].includes(asset.role) && asset.approved && asset.rightsVerified && asset.offeringIds?.includes(offeringId)) ?? []
  const logoAssets = profile?.visual?.assets?.filter((asset) => ['primary_logo', 'secondary_logo', 'icon'].includes(asset.role) && asset.approved && asset.rightsVerified) ?? []

  const loadContext = useCallback(async () => {
    setBusy('context')
    setError('')
    try {
      const body = await readJson(await fetch('/api/admin/marketing/context', { headers: authHeaders(''), cache: 'no-store' }))
      setContexts(body.contexts ?? [])
      const first = body.contexts?.[0]
      if (first) setAppSlug((current) => current || first.appSlug)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Marketing context failed')
    } finally {
      setBusy('')
    }
  }, [])

  useEffect(() => { void loadContext() }, [loadContext])
  useEffect(() => {
    const first = context?.profiles?.[0]
    if (first && !context.profiles.some((item) => item.brandProfileId === brandProfileId)) setBrandProfileId(first.brandProfileId)
  }, [context, brandProfileId])
  useEffect(() => {
    const first = context?.campaigns?.[0]
    if (first && !context.campaigns.some((item) => item.id === campaignId)) setCampaignId(first.id)
  }, [context, campaignId])
  useEffect(() => {
    const allowed = profile?.offerings?.filter((item) => campaign?.offeringIds?.includes(item.offeringId)) ?? []
    if (allowed[0] && !allowed.some((item) => item.offeringId === offeringId)) setOfferingId(allowed[0].offeringId)
  }, [profile, campaign, offeringId])
  useEffect(() => {
    if (productAssets[0] && !productAssets.some((item) => item.artifactId === productArtifactId)) setProductArtifactId(productAssets[0].artifactId)
  }, [productAssets, productArtifactId])
  useEffect(() => {
    const firstAudience = profile?.audiences?.find((item) => campaign?.audienceIds?.includes(item.audienceId))
    if (firstAudience && !profile.audiences.some((item) => item.audienceId === audienceId)) setAudienceId(firstAudience.audienceId)
    if (campaign?.objective) setObjective(campaign.objective)
    if (campaign?.callToAction) setCta(campaign.callToAction)
    if (campaign?.channels?.length) setChannels(campaign.channels.filter((item) => CHANNELS.includes(item)))
  }, [profile, campaign, audienceId])

  const payload = useMemo(() => {
    if (!profile || !campaign || !offering) return null
    return {
      request: {
        brandProfileId,
        campaignId,
        mode: 'product_breakout',
        prompt: brief,
        objective,
        audienceId,
        offeringId,
        productArtifactId,
        logoArtifactIds,
        callToAction: cta,
        sourceArtifactIds: [],
        aspectRatios: ratios,
        durationSeconds,
        candidateCount,
        includeCaptions,
        includeSubtitleFiles: includeSubtitles,
        includeThumbnail,
        includeSocialCopy,
        qualityProfile,
        approvalRequired: true,
        maxCredits,
      },
      campaign: {
        ...campaign,
        objective,
        audienceIds: [audienceId],
        offeringIds: [offeringId],
        channels,
        callToAction: cta,
      },
    }
  }, [profile, campaign, offering, brandProfileId, campaignId, brief, objective, audienceId, offeringId, productArtifactId, logoArtifactIds, cta, ratios, durationSeconds, candidateCount, includeCaptions, includeSubtitles, includeThumbnail, includeSocialCopy, qualityProfile, maxCredits, channels])

  const call = useCallback(async (path, method = 'POST', body) => {
    setBusy(path)
    setError('')
    try {
      return await readJson(await fetch(`/api/admin/marketing${path}`, {
        method,
        headers: authHeaders(appSlug, body !== undefined),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Marketing workflow request failed')
      throw cause
    } finally {
      setBusy('')
    }
  }, [appSlug])

  const poll = useCallback(async (id) => {
    const body = await call(`/social-ad-video/executions/${encodeURIComponent(id)}`, 'GET')
    setExecution(body)
    return body
  }, [call])

  useEffect(() => {
    if (!execution?.executionId || TERMINAL.has(execution.status) || ['human_approval_pending', 'assembly_pending', 'final_approval_pending', 'revision_required', 'final_revision_required'].includes(execution.phase)) return
    const timer = window.setInterval(() => { void poll(execution.executionId).catch(() => {}) }, 2500)
    return () => window.clearInterval(timer)
  }, [execution?.executionId, execution?.status, execution?.phase, poll])

  const planOnly = async () => {
    if (!payload) return
    const body = await call('/social-ad-video/plan', 'POST', payload)
    setPlan(body.plan)
  }
  const execute = async () => {
    if (!payload) return
    const body = await call('/social-ad-video/executions', 'POST', { ...payload, idempotencyKey: `dashboard-product-breakout-${Date.now()}` })
    setExecution(body)
  }
  const decide = async (stage, decision) => {
    const suffix = stage === 'final' ? '/final-approval' : '/approval'
    await call(`/social-ad-video/executions/${encodeURIComponent(execution.executionId)}${suffix}`, 'POST', { decision, notes: `${stage} decision from the governed dashboard workspace.` })
    await poll(execution.executionId)
  }
  const assemble = async () => {
    await call(`/social-ad-video/executions/${encodeURIComponent(execution.executionId)}/assemble`, 'POST')
    await poll(execution.executionId)
  }
  const resume = async () => {
    await call(`/social-ad-video/executions/${encodeURIComponent(execution.executionId)}/resume`, 'POST')
    await poll(execution.executionId)
  }
  const retry = async (jobId) => {
    await call(`/social-ad-video/executions/${encodeURIComponent(execution.executionId)}/candidates/${encodeURIComponent(jobId)}/retry`, 'POST')
    await poll(execution.executionId)
  }
  const regenerate = async () => {
    await call(`/social-ad-video/executions/${encodeURIComponent(execution.executionId)}/regenerate`, 'POST', { notes: 'Regenerate from the immutable dashboard revision decision.' })
    await poll(execution.executionId)
  }

  const finalArtifacts = useMemo(() => {
    if (!execution) return []
    const rows = [
      { id: execution.assembly?.masterVideoArtifactId ?? execution.assembly?.primaryArtifactId, label: 'Master video', mime: 'video' },
      ...(execution.assembly?.deliveryVariants ?? []).map((item) => ({ id: item.artifactId, label: `${item.aspectRatio} video`, mime: 'video' })),
      ...(execution.assembly?.subtitleArtifactIds ?? []).map((id, index) => ({ id, label: `Subtitle file ${index + 1}`, mime: 'document' })),
      { id: execution.assembly?.thumbnailArtifactId, label: 'Thumbnail', mime: 'image' },
      { id: execution.socialCopy?.artifactId, label: 'Social copy', mime: 'document' },
      { id: execution.assembly?.reportArtifactId, label: 'Execution evidence', mime: 'document' },
      { id: execution.assembly?.finalQualityReportArtifactId, label: 'Final quality report', mime: 'document' },
    ]
    return rows.filter((item) => item.id)
  }, [execution])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Product-Breakout Social Ads" subtitle="Plan, execute, evaluate, approve and assemble an app-isolated multi-candidate social delivery pack. Orchestra owns every provider and model decision." />
      {error && <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5 xl:col-span-2">
          <div className="flex items-center gap-2"><Film className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-semibold">Authorised campaign inputs</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="App" value={appSlug} onChange={setAppSlug} options={contexts.map((item) => [item.appSlug, item.appName])} />
            <Select label="Verified Brand Profile" value={brandProfileId} onChange={setBrandProfileId} options={(context?.profiles ?? []).map((item) => [item.brandProfileId, item.displayName])} />
            <Select label="Campaign" value={campaignId} onChange={setCampaignId} options={(context?.campaigns ?? []).map((item) => [item.id, item.name])} />
            <Select label="Offering" value={offeringId} onChange={setOfferingId} options={(profile?.offerings ?? []).filter((item) => campaign?.offeringIds?.includes(item.offeringId)).map((item) => [item.offeringId, item.name])} />
            <Select label="Approved product asset" value={productArtifactId} onChange={setProductArtifactId} options={productAssets.map((item) => [item.artifactId, `${item.role}: ${item.artifactId}`])} />
            <Select label="Optional approved logo" value={logoArtifactIds[0] ?? ''} onChange={(value) => setLogoArtifactIds(value ? [value] : [])} options={[['', 'No deterministic logo overlay'], ...logoAssets.map((item) => [item.artifactId, `${item.role}: ${item.artifactId}`])]} />
            <Select label="Audience" value={audienceId} onChange={setAudienceId} options={(profile?.audiences ?? []).filter((item) => campaign?.audienceIds?.includes(item.audienceId)).map((item) => [item.audienceId, item.name])} />
            <label className="space-y-1 text-xs text-muted-foreground"><span>CTA</span><Input aria-label="CTA" value={cta} onChange={(event) => setCta(event.target.value)} /></label>
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground"><span>Objective</span><textarea aria-label="Objective" value={objective} onChange={(event) => setObjective(event.target.value)} className="min-h-20 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground" /></label>
          <label className="block space-y-1 text-xs text-muted-foreground"><span>Creative brief</span><textarea aria-label="Creative brief" value={brief} onChange={(event) => setBrief(event.target.value)} className="min-h-28 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground" /></label>
          <ChoiceGroup label="Channels" values={channels} choices={CHANNELS} onChange={setChannels} />
          <ChoiceGroup label="Aspect ratios" values={ratios} choices={RATIOS} onChange={setRatios} />
          <div className="grid gap-3 sm:grid-cols-4">
            <NumberField label="Duration (seconds)" value={durationSeconds} min={5} max={180} onChange={setDurationSeconds} />
            <NumberField label="Candidates" value={candidateCount} min={2} max={6} onChange={setCandidateCount} />
            <Select label="Quality profile" value={qualityProfile} onChange={setQualityProfile} options={['standard', 'premium', 'publication'].map((item) => [item, item])} />
            <NumberField label="Maximum credits" value={maxCredits} min={6} max={1000000} onChange={setMaxCredits} />
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Toggle label="Captions" checked={includeCaptions} onChange={setIncludeCaptions} />
            <Toggle label="SRT and VTT" checked={includeSubtitles} onChange={setIncludeSubtitles} />
            <Toggle label="Thumbnail" checked={includeThumbnail} onChange={setIncludeThumbnail} />
            <Toggle label="Social copy" checked={includeSocialCopy} onChange={setIncludeSocialCopy} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Button variant="outline" onClick={planOnly} disabled={!payload || Boolean(busy)}>{busy === '/social-ad-video/plan' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Plan without execution</Button><Button onClick={execute} disabled={!payload || !plan || Boolean(busy)}><Play className="mr-2 h-4 w-4" />Execute approved plan</Button></div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold">Creative contract</h2>
          {plan?.creativeContract ? <div className="mt-4 space-y-3 text-xs"><StatusRow label="Version" value={plan.creativeContract.version} /><StatusRow label="Product source" value={plan.creativeContract.productSourceArtifactId} /><StatusRow label="Treatment" value={plan.creativeContract.treatment} /><StatusRow label="Candidates" value={String(plan.creativeContract.candidateCount)} /><StatusRow label="Credit ceiling" value={String(plan.creativeContract.creditCeiling)} /><div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] p-3 text-amber-100">{plan.creativeContract.visualLimitation}</div></div> : <p className="mt-3 text-xs text-muted-foreground">Choose authorised inputs and plan to inspect the immutable contract.</p>}
        </Card>
      </div>

      {execution && <ExecutionWorkspace execution={execution} busy={busy} finalArtifacts={finalArtifacts} onPoll={() => poll(execution.executionId)} onApprove={() => decide('creative', 'approved')} onReject={() => decide('creative', 'rejected')} onRevision={() => decide('creative', 'revision_requested')} onAssemble={assemble} onResume={resume} onRetry={retry} onRegenerate={regenerate} onFinalApprove={() => decide('final', 'approved')} onFinalReject={() => decide('final', 'rejected')} />}
    </PageTransition>
  )
}

function ExecutionWorkspace({ execution, busy, finalArtifacts, onPoll, onApprove, onReject, onRevision, onAssemble, onResume, onRetry, onRegenerate, onFinalApprove, onFinalReject }) {
  const candidates = execution.generation?.candidates ?? []
  return <Card className="space-y-5 border-white/[0.07] bg-white/[0.02] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Durable execution</h2><p className="mt-1 text-xs text-muted-foreground">{execution.executionId}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{execution.phase}</Badge><Button size="sm" variant="outline" onClick={onPoll} disabled={Boolean(busy)}><RefreshCw className="h-3.5 w-3.5" /></Button></div></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{candidates.map((candidate) => <div key={candidate.jobId} className="rounded-lg border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">Candidate {candidate.candidateIndex}</span><Badge variant="outline">{candidate.status}</Badge></div>{candidate.artifactId && <video controls preload="metadata" className="mt-3 aspect-video w-full rounded-md bg-black" src={`/api/admin/artifacts/${candidate.artifactId}/file`} />}{candidate.provider && <p className="mt-2 text-[10px] text-muted-foreground">Execution evidence: {candidate.provider} / {candidate.model}</p>}{candidate.status === 'failed' && <Button size="sm" variant="outline" className="mt-3" onClick={() => onRetry(candidate.jobId)}>Retry candidate</Button>}</div>)}</div>
    {execution.quality?.ranking?.length > 0 && <div><h3 className="mb-3 text-sm font-semibold">Inspectable quality ranking</h3><div className="space-y-2">{execution.quality.ranking.map((item, index) => <div key={item.candidateJobId ?? index} className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs"><div className="flex justify-between"><span>{index + 1}. {item.candidateJobId}</span><Badge variant="outline">{item.decision?.status}</Badge></div><p className="mt-1 text-muted-foreground">Measured and model-evaluated evidence; specialist product identity, geometry, logo and breakout appearance remain human-review-required.</p></div>)}</div></div>}
    {execution.phase === 'human_approval_pending' && <div className="grid gap-2 sm:grid-cols-3"><Button onClick={onApprove}><CheckCircle2 className="mr-2 h-4 w-4" />Approve winner</Button><Button variant="outline" onClick={onRevision}>Request revision</Button><Button variant="destructive" onClick={onReject}><XCircle className="mr-2 h-4 w-4" />Reject</Button></div>}
    {execution.phase === 'assembly_pending' && <Button className="w-full" onClick={onAssemble}><Film className="mr-2 h-4 w-4" />Assemble deterministic social pack</Button>}
    {execution.phase === 'revision_required' && <Button className="w-full" variant="outline" onClick={onRegenerate}>Regenerate within budget</Button>}
    {['partial_candidate_failure', 'assembly_queue_failed', 'copy_quality_failed'].includes(execution.phase) && <Button className="w-full" variant="outline" onClick={onResume}>Resume within budget</Button>}
    {execution.phase === 'final_approval_pending' && <div className="grid gap-2 sm:grid-cols-2"><Button onClick={onFinalApprove}><CheckCircle2 className="mr-2 h-4 w-4" />Final approve delivery pack</Button><Button variant="destructive" onClick={onFinalReject}>Reject final pack</Button></div>}
    {finalArtifacts.length > 0 && <div><h3 className="mb-3 text-sm font-semibold">Final delivery pack</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{finalArtifacts.map((artifact) => <div key={artifact.id} className="rounded-lg border border-white/[0.07] bg-black/20 p-3">{artifact.mime === 'video' && <video controls preload="metadata" className="mb-3 aspect-video w-full rounded bg-black" src={`/api/admin/artifacts/${artifact.id}/file`} />}{artifact.mime === 'image' && <img alt={artifact.label} className="mb-3 aspect-video w-full rounded object-cover" src={`/api/admin/artifacts/${artifact.id}/file`} />}<div className="flex items-center justify-between gap-2 text-xs"><span>{artifact.label}</span><a aria-label={`Download ${artifact.label}`} href={`/api/admin/artifacts/${artifact.id}/file?download=1`} className="text-cyan-300"><Download className="h-4 w-4" /></a></div></div>)}</div></div>}
  </Card>
}

function Select({ label, value, onChange, options }) { return <label className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 text-sm text-foreground">{options.map(([id, name]) => <option key={id || 'empty'} value={id}>{name}</option>)}</select></label> }
function NumberField({ label, value, min, max, onChange }) { return <label className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} /></label> }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center gap-2 rounded-md border border-white/[0.07] p-3 text-xs"><input aria-label={label} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label> }
function ChoiceGroup({ label, values, choices, onChange }) { return <fieldset><legend className="mb-2 text-xs text-muted-foreground">{label}</legend><div className="flex flex-wrap gap-2">{choices.map((choice) => <label key={choice} className="flex items-center gap-2 rounded-md border border-white/[0.07] px-3 py-2 text-xs"><input aria-label={`${label} ${choice}`} type="checkbox" checked={values.includes(choice)} onChange={(event) => onChange(event.target.checked ? [...new Set([...values, choice])] : values.filter((item) => item !== choice))} />{choice}</label>)}</div></fieldset> }
function StatusRow({ label, value }) { return <div className="rounded-md border border-white/[0.06] bg-black/20 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 break-words text-xs">{value}</div></div> }
