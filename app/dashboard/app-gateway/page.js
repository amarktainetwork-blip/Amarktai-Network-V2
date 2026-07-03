'use client'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader, StatusPill, Field, EmptyState } from '@/components/amarkt/kit'
import { EmptyState as EmptyStateComponent } from '@/components/amarkt/EmptyState'
import { SkeletonList } from '@/components/amarkt/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plug, Key, Activity, Plus, ExternalLink, Eye, EyeOff, Copy, CheckCircle2, Send, Loader2, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

function MaskedKey({ keyPrefix }) {
  const [visible, setVisible] = useState(false)
  const fullKey = `${keyPrefix}${Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`
  const masked = `${keyPrefix}${'•'.repeat(20)}`

  const copyKey = () => {
    navigator.clipboard.writeText(fullKey).then(() => toast.success('Key copied to clipboard'))
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
      <Key className="h-3.5 w-3.5 text-amber-300 shrink-0" />
      <code className="flex-1 text-xs font-mono text-amber-200 truncate">{visible ? fullKey : masked}</code>
      <button onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground transition shrink-0" title={visible ? 'Hide' : 'Reveal'}>
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button onClick={copyKey} className="text-muted-foreground hover:text-foreground transition shrink-0" title="Copy">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function WebhookTestButton() {
  const [state, setState] = useState('idle')
  const test = () => {
    setState('loading')
    setTimeout(() => {
      setState('success')
      toast.success('Webhook endpoint reachable', { description: '200 OK · response time: 142ms' })
      setTimeout(() => setState('idle'), 3000)
    }, 1500)
  }
  if (state === 'loading') return <Button variant="outline" size="sm" disabled className="border-white/10 text-xs"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending…</Button>
  if (state === 'success') return <Button variant="outline" size="sm" disabled className="border-emerald-500/30 text-emerald-400 text-xs"><CheckCircle2 className="mr-1 h-3 w-3" /> 200 OK</Button>
  return <Button variant="outline" size="sm" onClick={test} className="border-white/10 text-xs hover:border-cyan-500/30"><Send className="mr-1 h-3 w-3" /> Send Test Payload</Button>
}

const MOCK_CONNECTIONS = [
  { id: '1', appSlug: 'demo-chat-app', appName: 'Demo Chat App', status: 'active', tokenBalance: 850, apiKeys: [{ prefix: 'amk_abc1' }] },
  { id: '2', appSlug: 'brand-scraper', appName: 'Brand Scraper', status: 'active', tokenBalance: 420, apiKeys: [{ prefix: 'amk_def2' }] },
  { id: '3', appSlug: 'video-studio', appName: 'Video Studio', status: 'paused', tokenBalance: 0, apiKeys: [{ prefix: 'amk_ghi3' }] },
]

export default function AppGatewayPage() {
  const [connections, setConnections] = useState(null)
  const [showNewKey, setShowNewKey] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    setTimeout(() => setConnections(MOCK_CONNECTIONS), 800)
  }, [])

  const createConnection = () => {
    const newConn = {
      id: String(Date.now()),
      appSlug: 'new-app-' + Math.floor(Math.random() * 1000),
      appName: 'New Application',
      status: 'active',
      tokenBalance: 1000,
      apiKeys: [{ prefix: 'amk_new' + Math.floor(Math.random() * 10) }],
    }
    setConnections((p) => [...(p || []), newConn])
    setShowNewKey(newConn.id)
    toast.success('App connected', { description: 'Save the API key below — it will not be shown again.' })
  }

  const deleteConnection = (id) => {
    setConnections((p) => p.filter((c) => c.id !== id))
    toast.info('App disconnected')
  }

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="App Gateway" subtitle="Manage connected external applications, API keys, and budget usage.">
        <Button onClick={createConnection} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Plus className="mr-1.5 h-4 w-4" /> Connect App
        </Button>
      </PageHeader>

      {/* Loading state */}
      {connections === null && <SkeletonList count={3} />}

      {/* Empty state */}
      {connections !== null && connections.length === 0 && (
        <EmptyStateComponent
          icon={Plug}
          title="No Connected Apps"
          description="Connect your first application to start routing AI capabilities through the Network. Each app gets its own API key, capability scope, and budget."
          action={
            <Button onClick={createConnection} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
              <Plus className="mr-1.5 h-4 w-4" /> Connect Your First App
            </Button>
          }
        />
      )}

      {/* Connection cards */}
      {connections !== null && connections.length > 0 && (
        <div className="space-y-4">
          {connections.map((conn) => (
            <Card key={conn.id} className="border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
                    <Plug className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <div className="font-semibold">{conn.appName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{conn.appSlug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={conn.status === 'active' ? 'completed' : 'failed'}>{conn.status}</StatusPill>
                  <Button variant="ghost" size="sm" onClick={() => deleteConnection(conn.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">API Keys</div>
                  <div className="text-sm font-semibold">{conn.apiKeys?.length || 0}</div>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Tokens Remaining</div>
                  <div className="text-sm font-semibold">{conn.tokenBalance?.toLocaleString() || 'Unlimited'}</div>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Daily Budget (USD)</div>
                  <Input type="number" defaultValue={0} className="bg-transparent border-0 p-0 h-5 text-sm font-semibold focus:ring-0" />
                </div>
                <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Rate Limit (req/min)</div>
                  <Input type="number" defaultValue={100} className="bg-transparent border-0 p-0 h-5 text-sm font-semibold focus:ring-0" />
                </div>
              </div>

              {/* Show key after creation */}
              {showNewKey === conn.id && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Save this key now. It will not be shown again.</span>
                  </div>
                  <MaskedKey keyPrefix={conn.apiKeys[0].prefix} />
                </div>
              )}

              {/* Stored masked key */}
              {showNewKey !== conn.id && conn.apiKeys?.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                    <Key className="h-3 w-3" /> Stored API Key
                  </div>
                  <code className="block text-xs font-mono text-muted-foreground bg-black/20 rounded px-3 py-2">{conn.apiKeys[0].prefix}{'•'.repeat(20)}</code>
                </div>
              )}

              {/* Webhook config */}
              <div className="border-t border-white/[0.06] pt-4 space-y-3">
                <div className="text-xs text-muted-foreground font-medium">Webhook Configuration</div>
                <div className="flex items-center gap-2">
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-app.com/webhook" className="bg-black/20 flex-1 text-sm" />
                  <WebhookTestButton />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
