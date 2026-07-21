'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Boxes, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  EMPTY_RUNTIME_PROOF_STATUS,
  RUNTIME_PROOF_SOURCE,
  normalizeRuntimeProofStatus,
  projectRuntimeProofStatusFromTruth,
} from '@/lib/runtime-proof-status'

export function getAdminToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem('amarktai_token') ?? ''
}

async function readSafeJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export function useRuntimeProofStatus() {
  const [status, setStatus] = useState(EMPTY_RUNTIME_PROOF_STATUS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRuntimeProofs = useCallback(async () => {
    setLoading(true)
    setError('')

    const token = getAdminToken()
    if (!token) {
      setStatus(EMPTY_RUNTIME_PROOF_STATUS)
      setError('Admin sign-in required. Runtime proof status was not loaded.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/truth', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readSafeJson(response)

      if (!response.ok) {
        setStatus(EMPTY_RUNTIME_PROOF_STATUS)
        setError(data.message || 'Backend unavailable. Runtime proof status was not loaded.')
        return
      }

      setStatus(projectRuntimeProofStatusFromTruth(data))
    } catch {
      setStatus(EMPTY_RUNTIME_PROOF_STATUS)
      setError('Backend unavailable. Runtime proof status was not loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRuntimeProofs()
  }, [loadRuntimeProofs])

  return { status, loading, error, refresh: loadRuntimeProofs }
}

export function RuntimeProofSummary({ compact = false }) {
  const { status, loading, error, refresh } = useRuntimeProofStatus()
  const summary = useMemo(() => normalizeRuntimeProofStatus(status).summary, [status])
  const unprovenCount = status.unprovenCapabilities.length

  return (
    <Card className="border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Runtime Proof Status
          </h3>
          {!compact && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Dashboard capability readiness comes from the backend runtime proof endpoint, not static provider plans.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" className="border-white/10 text-xs" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 border-rose-500/30 bg-rose-500/[0.05]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Runtime proof status unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">Approved providers</div>
          <div className="mt-1 text-lg font-semibold">{summary.providerCount}</div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
          <div className="text-[10px] text-muted-foreground">Proven capabilities</div>
          <div className="mt-1 text-lg font-semibold text-emerald-200">{summary.provenCount}</div>
        </div>
        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
          <div className="text-[10px] text-muted-foreground">Unproven capabilities</div>
          <div className="mt-1 text-lg font-semibold text-amber-200">{unprovenCount}</div>
        </div>
        <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">Backend proof source</div>
          <Badge variant="outline" className="mt-1 border-cyan-500/30 font-mono text-[9px] text-cyan-300">
            {summary.source || RUNTIME_PROOF_SOURCE}
          </Badge>
        </div>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />
          Loading backend runtime proof status...
        </div>
      )}
    </Card>
  )
}
