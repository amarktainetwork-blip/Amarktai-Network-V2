'use client'
import { useEffect, useState } from 'react'
import { PageHeader, PageTransition } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { getAdminToken } from '@/lib/admin-session'

export default function OverviewPage() {
  const [truth, setTruth] = useState(null); const [error, setError] = useState('')
  useEffect(() => { fetch('/api/admin/truth', { headers: { Authorization: `Bearer ${getAdminToken()}` }, cache: 'no-store' }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.message); setTruth(data.truth) }).catch((e) => setError(e.message || 'Platform status unavailable')) }, [])
  const metrics = truth?.metrics ?? {}
  const cards = [
    ['Active apps', truth?.appCount ?? '—'], ['Atomic capabilities', metrics.atomicCapabilityCount], ['Composite capabilities', metrics.compositeCapabilityCount],
    ['Live-proven capabilities', (metrics.liveProvenAtomicCapabilityCount ?? 0) + (metrics.liveProvenCompositeCapabilityCount ?? 0)],
    ['Discovered models', metrics.discoveredModelCount], ['Executable routes', metrics.executableRouteCount], ['Live-proven routes', metrics.liveProvenRouteCount],
  ]
  return <PageTransition className="space-y-6"><PageHeader title="Platform overview" subtitle="Apps, outcomes, routes and proof state from one canonical backend projection." />
    {error && <div role="alert" className="rounded-lg border border-rose-500/30 p-3 text-sm text-rose-200">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <Card key={label} className="border-white/[.07] bg-white/[.02] p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value ?? '—'}</div></Card>)}</div>
    <Card className="border-white/[.07] bg-white/[.02] p-5"><h2 className="text-sm font-semibold">Important alerts</h2><p className="mt-2 text-xs text-muted-foreground">{truth?.evidenceAvailable === false ? 'Runtime evidence storage is unavailable.' : truth?.capabilities?.some((c) => c.operationalState === 'provider_temporarily_unavailable') ? 'One or more provider routes need attention.' : 'No critical platform alert in the current truth snapshot.'}</p></Card>
  </PageTransition>
}
