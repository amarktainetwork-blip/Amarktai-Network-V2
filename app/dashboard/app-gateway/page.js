'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Check, Loader2, Plug, RefreshCw, Settings } from 'lucide-react'

const EMPTY_DRAFT = { appName: '', appSlug: '', dailyBudgetCents: '0', allowedCapabilities: [] }

function tokenHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('amarktai_token') : null
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export default function AppGatewayPage() {
  const [connections, setConnections] = useState([])
  const [releaseCapabilities, setReleaseCapabilities] = useState([])
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [connectionsResponse, truthResponse] = await Promise.all([
        fetch('/api/admin/app-connections', { headers: tokenHeaders(), cache: 'no-store' }),
        fetch('/api/admin/truth', { headers: tokenHeaders(), cache: 'no-store' }),
      ])
      const [connectionsData, truthData] = await Promise.all([
        connectionsResponse.json(),
        truthResponse.json(),
      ])
      if (!connectionsResponse.ok) throw new Error(connectionsData.message || 'App connections could not be loaded')
      if (!truthResponse.ok) throw new Error(truthData.message || 'Canonical release capabilities could not be loaded')
      setConnections(connectionsData.connections ?? [])
      setReleaseCapabilities(truthData.truth?.releaseCandidateCapabilities ?? [])
    } catch (loadError) {
      setError(loadError.message || 'App connections could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const sortedConnections = useMemo(
    () => [...connections].sort((a, b) => a.appName.localeCompare(b.appName)),
    [connections],
  )

  const setName = (appName) => setDraft((previous) => ({
    ...previous,
    appName,
    appSlug: slugEdited ? previous.appSlug : appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  }))

  const toggleCapability = (capability) => setDraft((previous) => ({
    ...previous,
    allowedCapabilities: previous.allowedCapabilities.includes(capability)
      ? previous.allowedCapabilities.filter((item) => item !== capability)
      : [...previous.allowedCapabilities, capability],
  }))

  const createConnection = async (event) => {
    event.preventDefault()
    if (!draft.appName.trim() || !draft.appSlug.trim() || creating) return
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/admin/app-connections', {
        method: 'POST',
        headers: tokenHeaders(true),
        body: JSON.stringify({
          appName: draft.appName.trim(),
          appSlug: draft.appSlug.trim(),
          dailyBudgetCents: Math.max(0, Number.parseInt(draft.dailyBudgetCents || '0', 10) || 0),
          allowedCapabilities: draft.allowedCapabilities,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'App connection could not be created')
      setDraft(EMPTY_DRAFT)
      setSlugEdited(false)
      await load()
    } catch (createError) {
      setError(createError.message || 'App connection could not be created')
    } finally {
      setCreating(false)
    }
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Apps" subtitle="Real scoped app connections from the authenticated platform API.">
        <Button onClick={() => void load()} disabled={loading} variant="outline" className="border-white/10 text-xs">
          <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </PageHeader>

      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/[0.05] p-3 text-xs text-rose-200">{error}</div>}

      {loading ? (
        <Card className="flex items-center justify-center border-white/[0.07] bg-white/[0.02] p-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading app connections
        </Card>
      ) : sortedConnections.length === 0 ? (
        <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <Plug className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold">No app connections</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create a scoped connection below. Empty capability grants deny execution by default.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedConnections.map((connection) => (
            <Card key={connection.id} className="border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{connection.appName}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{connection.appSlug}</div>
                </div>
                <Badge variant="outline" className={connection.status === 'active' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}>{connection.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div>Capability grants <span className="text-foreground">{connection.allowedCapabilities?.length ?? 0}</span></div>
                <div>API keys <span className="text-foreground">{connection.apiKeyCount ?? 0}</span></div>
                <div>Daily budget <span className="text-foreground">{connection.dailyBudgetCents ?? 0}c</span></div>
                <div>Token balance <span className="text-foreground">{connection.tokenBalance ?? 0}</span></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Accordion type="single" collapsible>
        <AccordionItem value="create" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="py-3 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Create scoped app connection</span></AccordionTrigger>
          <AccordionContent>
            <form onSubmit={createConnection} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="App name"><Input required value={draft.appName} onChange={(event) => setName(event.target.value)} className="bg-black/20" /></Field>
                <Field label="Immutable slug"><Input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.appSlug} onChange={(event) => { setSlugEdited(true); setDraft((previous) => ({ ...previous, appSlug: event.target.value.toLowerCase() })) }} className="bg-black/20 font-mono" /></Field>
                <Field label="Daily budget (cents)"><Input min="0" type="number" value={draft.dailyBudgetCents} onChange={(event) => setDraft((previous) => ({ ...previous, dailyBudgetCents: event.target.value }))} className="bg-black/20" /></Field>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold">Release-candidate capability grants</div>
                <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  {releaseCapabilities.map((capability) => {
                    const selected = draft.allowedCapabilities.includes(capability)
                    return (
                      <button key={capability} type="button" onClick={() => toggleCapability(capability)} aria-pressed={selected} className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] ${selected ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/[0.08] text-muted-foreground'}`}>
                        {selected && <Check className="mr-1 h-2.5 w-2.5" />}{capability}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Button type="submit" disabled={creating || !draft.appName.trim() || !draft.appSlug.trim()} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-xs text-black">
                {creating && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Create connection
              </Button>
            </form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
