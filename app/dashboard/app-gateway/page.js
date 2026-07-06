'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ChevronRight, Lock, Plug, Settings } from 'lucide-react'

const SUPPORTED_APP_TYPES = [
  'Marketing', 'Horse Management', 'Crypto', 'Adult Creator',
  'CRM', 'Customer Service', 'Music', 'Education', 'Legal',
]

export default function AppGatewayPage() {
  const [step, setStep] = useState(1)
  const [showDraft, setShowDraft] = useState(false)
  const [draft, setDraft] = useState({
    appName: '', appSlug: '', environment: 'dev', webhookUrl: '',
    agentName: '', directives: '', brandNotes: '', budget: '', rateLimit: '',
  })
  const set = (key, value) => setDraft((prev) => ({
    ...prev, [key]: value,
    ...(key === 'appName' && !prev.appSlug ? { appSlug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } : {}),
  }))

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Apps" subtitle="Connected applications will appear here after the Apps backend is wired." />

      {/* Empty state */}
      <Card className="border-white/[0.07] bg-white/[0.02] p-10 text-center">
        <Plug className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No apps connected yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Connected apps will appear here after the Apps backend is wired.
        </p>
        <Button disabled variant="outline" className="mt-6 border-white/10 text-xs">
          <Lock className="mr-1.5 h-3 w-3" /> Backend connection required
        </Button>
      </Card>

      {/* Supported app types - collapsed */}
      <Accordion type="single" collapsible>
        <AccordionItem value="types" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Supported app types</span></AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_APP_TYPES.map((type) => (
                <span key={type} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs text-muted-foreground">{type}</span>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Connection draft - collapsed */}
      <Accordion type="single" collapsible>
        <AccordionItem value="draft" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3"><span className="flex items-center gap-1.5 text-muted-foreground">Connection draft</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="App name"><Input value={draft.appName} onChange={(e) => set('appName', e.target.value)} className="bg-black/20" /></Field>
                <Field label="App slug"><Input value={draft.appSlug} onChange={(e) => set('appSlug', e.target.value)} className="bg-black/20 font-mono" /></Field>
                <Field label="Environment"><Input value={draft.environment} onChange={(e) => set('environment', e.target.value)} className="bg-black/20" /></Field>
                <Field label="Webhook URL"><Input value={draft.webhookUrl} onChange={(e) => set('webhookUrl', e.target.value)} placeholder="https://app.example.com/webhook" className="bg-black/20" /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Agent name"><Input value={draft.agentName} onChange={(e) => set('agentName', e.target.value)} className="bg-black/20" /></Field>
                <Field label="Budget"><Input value={draft.budget} onChange={(e) => set('budget', e.target.value)} className="bg-black/20" /></Field>
              </div>
              <Field label="Core directives"><Textarea value={draft.directives} onChange={(e) => set('directives', e.target.value)} className="min-h-[100px] bg-black/20" /></Field>
              <Button disabled className="w-full border-white/10 text-xs" variant="outline">
                <Lock className="mr-1 h-3 w-3" /> Create app connection — backend required
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
