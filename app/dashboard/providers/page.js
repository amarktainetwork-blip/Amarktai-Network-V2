'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'
import {
  normalizeProviderStatuses,
  getHealthStatusLabel,
  getHealthStatusClasses,
} from '@/lib/provider-settings-contract'
import { Cpu, Settings } from 'lucide-react'

export default function ProvidersPage() {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/providers')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProviders(normalizeProviderStatuses(data))
        }
      })
      .catch(() => {
        // Fallback to static contracts with unconfigured status
        setProviders(
          normalizeProviderStatuses(
            PROVIDER_CONTRACTS.map((p) => ({
              providerKey: p.id,
              displayName: p.name,
              healthStatus: 'unconfigured',
            }))
          )
        )
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Providers" subtitle="Provider status from backend credential store. Runtime selects providers after routing is wired.">
        <Link href="/dashboard/settings"><Button variant="outline" className="border-white/10 text-xs"><Settings className="mr-1.5 h-3.5 w-3.5" /> Settings</Button></Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => {
          const contractInfo = PROVIDER_CONTRACTS.find((p) => p.id === provider.providerKey)
          return (
            <Card key={provider.providerKey} className="border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"><Cpu className="h-5 w-5 text-cyan-300" /></div>
                <div>
                  <h3 className="font-semibold">{provider.displayName}</h3>
                  <p className="text-xs text-muted-foreground">{contractInfo?.role ?? ''}</p>
                </div>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{contractInfo?.description ?? ''}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getHealthStatusClasses(provider.healthStatus)}>
                  {getHealthStatusLabel(provider.healthStatus)}
                </Badge>
                {provider.enabled && (
                  <Badge variant="outline" className="border-white/10 text-[9px]">enabled</Badge>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Developer details</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-xs text-muted-foreground">
              {providers.map((provider) => (
                <div key={provider.providerKey} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="font-semibold">{provider.displayName}</div>
                  <div className="font-mono text-[10px]">env: {PROVIDER_CONTRACTS.find((p) => p.id === provider.providerKey)?.envKey ?? 'N/A'}</div>
                  <div className="text-[10px]">source: {provider.source ?? 'unknown'}</div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
