'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, Save, ShieldCheck, TestTube2, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  buildProviderUpdatePayload,
  getCredentialSourceLabel,
  getHealthStatusClasses,
  getHealthStatusLabel,
  makeProviderDraft,
  normalizeProviderStatus,
  normalizeProviderStatuses,
} from '@/lib/provider-settings-contract'

function getAdminToken() {
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

function authMessage(status) {
  if (status === 401) return 'Admin sign-in required. Provider settings were not loaded.'
  if (status === 403) return 'Admin access required. Provider settings were not loaded.'
  return ''
}

export function ProviderSettingsPanel() {
  const [providers, setProviders] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState('')
  const [testingProvider, setTestingProvider] = useState('')
  const [clearingProvider, setClearingProvider] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const sortedProviders = useMemo(() => normalizeProviderStatuses(providers), [providers])

  const setProviderDrafts = useCallback((nextProviders) => {
    setDrafts(() => {
      const nextDrafts = {}
      for (const provider of nextProviders) {
        const providerKey = provider.providerKey
        nextDrafts[providerKey] = {
          ...makeProviderDraft(provider),
          apiKey: '',
        }
      }
      return nextDrafts
    })
  }, [])

  const loadProviders = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotice('')

    const token = getAdminToken()
    if (!token) {
      setProviders([])
      setError('Admin sign-in required. Provider settings were not loaded.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/providers', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readSafeJson(response)

      if (!response.ok) {
        setProviders([])
        setError(authMessage(response.status) || data.message || 'Backend unavailable. Provider settings were not loaded.')
        return
      }

      const safeProviders = normalizeProviderStatuses(data.providers ?? [])
      setProviders(safeProviders)
      setProviderDrafts(safeProviders)
    } catch {
      setProviders([])
      setError('Backend unavailable. Provider settings were not loaded.')
    } finally {
      setLoading(false)
    }
  }, [setProviderDrafts])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const updateDraft = (providerKey, patch) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [providerKey]: {
        ...(currentDrafts[providerKey] ?? {}),
        ...patch,
      },
    }))
  }

  const updateProviderStatus = (provider) => {
    const safeProvider = normalizeProviderStatus(provider)
    setProviders((currentProviders) => normalizeProviderStatuses([
      ...currentProviders.filter((item) => item.providerKey !== safeProvider.providerKey),
      safeProvider,
    ]))
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [safeProvider.providerKey]: {
        ...makeProviderDraft(safeProvider),
        apiKey: '',
      },
    }))
  }

  const saveProvider = async (providerKey) => {
    setSavingProvider(providerKey)
    setError('')
    setNotice('')

    const token = getAdminToken()
    if (!token) {
      setError('Admin sign-in required. Provider settings were not saved.')
      setSavingProvider('')
      return
    }

    try {
      const response = await fetch(`/api/admin/providers/${providerKey}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildProviderUpdatePayload(drafts[providerKey] ?? {})),
      })
      const data = await readSafeJson(response)

      if (!response.ok) {
        setError(authMessage(response.status) || data.message || 'Backend unavailable. Provider settings were not saved.')
        return
      }

      updateProviderStatus(data.provider)
      setNotice(`${data.provider?.displayName ?? providerKey} settings saved. Password input cleared.`)
    } catch {
      setError('Backend unavailable. Provider settings were not saved.')
    } finally {
      setSavingProvider('')
    }
  }

  const clearProviderKey = async (provider) => {
    const providerKey = provider.providerKey
    const confirmed = window.confirm(`Clear the stored key for ${provider.displayName}? This disables the provider until an admin re-enables it.`)
    if (!confirmed) return

    setClearingProvider(providerKey)
    setError('')
    setNotice('')

    const token = getAdminToken()
    if (!token) {
      setError('Admin sign-in required. Provider key was not cleared.')
      setClearingProvider('')
      return
    }

    try {
      const response = await fetch(`/api/admin/providers/${providerKey}/key`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readSafeJson(response)

      if (!response.ok) {
        setError(authMessage(response.status) || data.message || 'Backend unavailable. Provider key was not cleared.')
        return
      }

      updateProviderStatus(data.provider)
      setNotice(`${data.provider?.displayName ?? providerKey} key cleared. Runtime env fallback remains blocked by the disabled database row.`)
    } catch {
      setError('Backend unavailable. Provider key was not cleared.')
    } finally {
      setClearingProvider('')
    }
  }

  const testProvider = async (providerKey) => {
    setTestingProvider(providerKey)
    setError('')
    setNotice('')

    const token = getAdminToken()
    if (!token) {
      setError('Admin sign-in required. Provider key was not tested.')
      setTestingProvider('')
      return
    }

    try {
      const response = await fetch(`/api/admin/providers/${providerKey}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readSafeJson(response)

      if (!response.ok) {
        setError(authMessage(response.status) || data.message || 'Backend unavailable. Provider key was not tested.')
        return
      }

      updateProviderStatus(data.provider)
      const status = data.provider?.healthStatus === 'live' ? 'live-tested' : data.provider?.healthStatus || 'updated'
      setNotice(`${data.provider?.displayName ?? providerKey} test finished: ${status}.`)
    } catch {
      setError('Backend unavailable. Provider key was not tested.')
    } finally {
      setTestingProvider('')
    }
  }

  return (
    <Card className="border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-cyan-300" />
            Provider Keys
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Backend provider status is the source of truth. Configured means a credential exists; Live tested means the Test Key action received a real provider response.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="border-white/10 text-xs" onClick={loadProviders} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 border-rose-500/30 bg-rose-500/[0.05]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Provider settings unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="mb-4 border-emerald-500/20 bg-emerald-500/[0.04]">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <AlertTitle>Provider settings updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-md border border-white/[0.06] bg-black/20 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading backend provider settings...
        </div>
      ) : (
        <div className="space-y-4">
          {sortedProviders.map((provider) => {
            const draft = drafts[provider.providerKey] ?? makeProviderDraft(provider)
            const isSaving = savingProvider === provider.providerKey
            const isTesting = testingProvider === provider.providerKey
            const isClearing = clearingProvider === provider.providerKey
            const isDeepInfra = provider.providerKey === 'deepinfra'

            return (
              <div key={provider.providerKey} className="rounded-md border border-white/[0.06] bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold">{provider.displayName}</h4>
                      <Badge variant="outline" className="border-white/10 font-mono text-[10px]">{provider.providerKey}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${getHealthStatusClasses(provider.healthStatus)}`}>
                        {getHealthStatusLabel(provider.healthStatus)}
                      </Badge>
                      {isDeepInfra && (
                        <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-300">Gated uncensored lane</Badge>
                      )}
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="text-foreground/70">Credential source: </span>
                        {getCredentialSourceLabel(provider.source)}
                      </div>
                      <div>
                        <span className="text-foreground/70">Saved key configured: </span>
                        {provider.configured ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <span className="text-foreground/70">Masked preview: </span>
                        <span className="font-mono">{provider.maskedPreview || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-foreground/70">Last checked: </span>
                        {provider.lastCheckedAt ? new Date(provider.lastCheckedAt).toLocaleString() : 'Not checked'}
                      </div>
                    </div>
                    {provider.healthMessage && <p className="mt-2 text-xs text-muted-foreground">{provider.healthMessage}</p>}
                    {isDeepInfra && <p className="mt-2 text-xs text-amber-200/80">DeepInfra remains gated and backend controlled; this page does not activate execution.</p>}
                  </div>
                  <label className="flex items-center gap-2 self-start rounded-md border border-white/[0.06] px-3 py-2 text-xs">
                    <span>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(enabled) => updateDraft(provider.providerKey, { enabled })}
                      aria-label={`Enable ${provider.displayName}`}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <label className="space-y-1.5 text-xs">
                    <span className="text-muted-foreground">New API key</span>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={draft.apiKey}
                      onChange={(event) => updateDraft(provider.providerKey, { apiKey: event.target.value })}
                      placeholder="Paste a provider key to replace the stored credential"
                      className="border-white/[0.08] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="text-muted-foreground">Base URL metadata</span>
                    <Input
                      value={draft.baseUrl}
                      onChange={(event) => updateDraft(provider.providerKey, { baseUrl: event.target.value })}
                      placeholder="Internal runtime default, optional"
                      className="border-white/[0.08] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="text-muted-foreground">Default model metadata</span>
                    <Input
                      value={draft.defaultModel}
                      onChange={(event) => updateDraft(provider.providerKey, { defaultModel: event.target.value })}
                      placeholder="Internal runtime default, optional"
                      className="border-white/[0.08] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="text-muted-foreground">Fallback model metadata</span>
                    <Input
                      value={draft.fallbackModel}
                      onChange={(event) => updateDraft(provider.providerKey, { fallbackModel: event.target.value })}
                      placeholder="Internal runtime fallback, optional"
                      className="border-white/[0.08] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs lg:col-span-2">
                    <span className="text-muted-foreground">Admin notes</span>
                    <Textarea
                      value={draft.notes}
                      onChange={(event) => updateDraft(provider.providerKey, { notes: event.target.value })}
                      placeholder="Internal provider configuration notes"
                      className="min-h-20 border-white/[0.08] bg-white/[0.03] text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-rose-500/30 text-xs text-rose-200 hover:bg-rose-500/10"
                    onClick={() => clearProviderKey(provider)}
                    disabled={isSaving || isTesting || isClearing}
                  >
                    {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Clear key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-cyan-500/30 text-xs text-cyan-100 hover:bg-cyan-500/10"
                    onClick={() => testProvider(provider.providerKey)}
                    disabled={isSaving || isTesting || isClearing || !provider.configured}
                  >
                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
                    Test Key
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="text-xs"
                    onClick={() => saveProvider(provider.providerKey)}
                    disabled={isSaving || isTesting || isClearing}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Key
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2 text-xs text-cyan-100/80">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <p>Apps and Studio do not choose providers or models. These fields are admin metadata and credentials for backend-controlled runtime decisions.</p>
      </div>
    </Card>
  )
}
