'use client'
import { useEffect, useState } from 'react'
import { PageTransition, PageHeader, StatusPill, Reveal } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet'
import { ChevronRight } from 'lucide-react'

export default function Capabilities() {
  const [caps, setCaps] = useState([])
  useEffect(() => { fetch('/api/capabilities').then((r) => r.json()).then((d) => setCaps(d.capabilities || [])) }, [])
  const cats = [...new Set(caps.map((c) => c.category))]
  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Capabilities" subtitle="Every core capability key exposed by the network, with its contract schema." />
      {cats.map((cat) => (
        <Reveal key={cat}>
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{cat}</div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {caps.filter((c) => c.category === cat).map((c) => (
              <Sheet key={c.key}>
                <SheetTrigger asChild>
                  <button className="group text-left">
                    <Card className="h-full border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-cyan-500/30 hover:bg-white/[0.035]">
                      <div className="flex items-center justify-between">
                        <code className="font-mono text-sm text-cyan-200">{c.key}</code>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                      <div className="mt-1 text-sm text-foreground/80">{c.label}</div>
                      <div className="mt-3"><StatusPill status={c.status} /></div>
                    </Card>
                  </button>
                </SheetTrigger>
                <SheetContent className="w-full border-white/10 bg-[hsl(240_14%_4%)] sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle className="font-mono text-cyan-200">{c.key}</SheetTitle>
                    <SheetDescription>{c.label} · {c.category}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-5">
                    <div><StatusPill status={c.status} /></div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Input schema</div>
                      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-emerald-200">{JSON.stringify(c.input, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Output schema</div>
                      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-cyan-200">{JSON.stringify(c.output, null, 2)}</pre>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            ))}
          </div>
        </Reveal>
      ))}
    </PageTransition>
  )
}
