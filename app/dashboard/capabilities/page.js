'use client'

import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary, useRuntimeProofStatus, getAdminToken } from '@/components/dashboard/runtime-proof-summary'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { groupedCapabilities } from '@/lib/capability-catalog'
import {
  getRuntimeCapabilityProof,
  runtimeProofStatusClasses,
  runtimeProofStatusLabel,
} from '@/lib/runtime-proof-status'
import { useEffect, useState } from 'react'
import { Bot, Database, FileText, Globe, Image as ImageIcon, MessageSquare, Mic, Music, Settings, ShieldAlert, Sparkles, User, Video, Zap } from 'lucide-react'

const ICONS = {
  Language: MessageSquare,
  Intelligence: Globe,
  Image: ImageIcon,
  Video,
  Audio: Music,
  Avatar: User,
  Knowledge: Database,
  Document: FileText,
  Marketing: Sparkles,
  Multimodal: Zap,
  'Adult Governed': ShieldAlert,
}

export default function CapabilitiesPage() {
  const { status } = useRuntimeProofStatus()
  const groups = groupedCapabilities()
  const [capabilityGroups, setCapabilityGroups] = useState([])

  useEffect(() => {
    const token = getAdminToken()
    if (!token) return
    fetch('/api/admin/capability-groups', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setCapabilityGroups(data?.capabilities ?? []))
      .catch(() => {})
  }, [])

  const getGroupSummary = (capabilityKey) => capabilityGroups.find((g) => g.capabilityKey === capabilityKey)

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Capability Library" subtitle="Runtime capability readiness is loaded from the backend runtime proof endpoint." />

      <RuntimeProofSummary compact />

      <div className="space-y-4">
        {groups.map((group) => {
          const Icon = ICONS[group.family] ?? Bot

          return (
            <Card key={group.family} className="border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-4 w-4 text-cyan-300" />
                <h3 className="text-sm font-semibold">{group.family}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const proof = getRuntimeCapabilityProof(status, item.key)
                  const ready = proof.readyForDashboardExecution === true
                  const summary = getGroupSummary(item.key)

                  return (
                    <div
                      key={item.key}
                      aria-disabled={!ready}
                      className={`rounded-lg border p-3 ${ready ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-black/20 opacity-75'}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{item.label}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">{item.key}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{item.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`text-[9px] ${runtimeProofStatusClasses(proof)}`}>
                          {runtimeProofStatusLabel(proof)}
                        </Badge>
                        <Badge variant="outline" className="border-white/10 text-[9px]">{item.outputType}</Badge>
                        {item.artifactRequired && <Badge variant="outline" className="border-cyan-500/30 text-[9px] text-cyan-300">Artifact</Badge>}
                        {item.policyRequirement !== 'standard' && <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">{item.policyRequirement}</Badge>}
                        {summary && summary.totalModels > 0 && (
                          <Badge variant="outline" className="border-violet-500/30 text-[9px] text-violet-300">
                            {summary.totalModels} models · {Object.keys(summary.modelsByProvider).length} providers
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-[9px] text-muted-foreground">
                        {ready ? `Runtime proven through ${proof.provider}` : summary ? `${summary.executableModels} executable models available` : 'Disabled until backend proof passes'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Settings className="h-3 w-3" />
              Developer matrix
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold mb-2">Transplanted capability catalog</div>
              <p className="text-[10px]">
                The dashboard catalog represents donor-backed target capability contracts, but readiness comes only from backend-runtime-proof-status.
              </p>
              <p className="mt-2 text-[10px]">
                Retry, cancel, provider routing, and model selection remain backend-controlled. Unproven capabilities are visible for planning and disabled for execution.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
