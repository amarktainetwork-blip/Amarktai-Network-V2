'use client'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader, StatusPill } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plug, Key, Activity, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function AppGatewayPage() {
  const [connections, setConnections] = useState([])

  useEffect(() => {
    fetch('/api/connections').then((r) => r.json()).then((d) => setConnections(d?.connections || [])).catch(() => {})
  }, [])

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="App Gateway" subtitle="Manage connected external applications, API keys, and budget usage.">
        <Link href="/contact">
          <Button className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
            <Plus className="mr-1.5 h-4 w-4" /> Connect App
          </Button>
        </Link>
      </PageHeader>

      {connections.length === 0 ? (
        <Card className="border-white/[0.07] bg-white/[0.02] p-12 text-center">
          <Plug className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold">No Connected Apps</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Connect your first application to start routing AI capabilities through the Network. Each app gets its own API key, capability scope, and budget.
          </p>
          <Link href="/contact">
            <Button className="mt-6 bg-gradient-to-r from-cyan-400 to-violet-500 text-black">
              <Plus className="mr-1.5 h-4 w-4" /> Connect Your First App
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => (
            <Card key={conn.id || conn.appSlug} className="border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
                    <Plug className="h-4 w-4 text-cyan-300" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{conn.appName || conn.appSlug}</div>
                    <div className="text-xs text-muted-foreground">{conn.appSlug}</div>
                  </div>
                </div>
                <StatusPill status={conn.status === 'active' ? 'completed' : 'failed'}>{conn.status}</StatusPill>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Key className="h-3.5 w-3.5" /> API keys: {conn.apiKeys?.length || 0}</div>
                <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Tokens remaining: {conn.tokenBalance?.toLocaleString() || 'Unlimited'}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
