'use client'

import Link from 'next/link'
import { Reveal, Stagger, StaggerItem } from '@/components/amarkt/kit'
import { ParticleField } from '@/components/amarkt/particles'
import { SiteNav, SiteFooter } from '@/components/amarkt/site-nav'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, Shield, Target, Lightbulb, Rocket, Layers, Workflow, Database, Lock,
} from 'lucide-react'

const VALUES = [
  { icon: Target, title: 'Mission-Driven', desc: 'Every product team deserves enterprise-grade AI infrastructure without rebuilding it from scratch.' },
  { icon: Shield, title: 'Security First', desc: 'Tenant isolation, encrypted keys, scoped API tokens, and per-app budget controls — built in, not bolted on.' },
  { icon: Lightbulb, title: 'Provider Agnostic', desc: 'Route capabilities across multiple providers without touching client code. Swap engines freely.' },
  { icon: Rocket, title: 'Integrate Faster', desc: 'Connected apps stay lightweight while the Network defines capability contracts, queues, storage, and delivery workflows.' },
]

const STATS = [
  { value: '16+', label: 'AI Capabilities' },
  { value: '55+', label: 'Domain Models' },
  { value: '5', label: 'Final Providers' },
  { value: 'API', label: 'Contract Runtime' },
]

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 obsidian-grid radial-fade" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-[500px] w-[500px] rounded-full swirl-1" />
        <div className="absolute -right-32 top-1/3 h-[400px] w-[400px] rounded-full swirl-2" />
        <div className="absolute left-1/4 bottom-0 h-[350px] w-[350px] rounded-full swirl-3" />
      </div>
      <ParticleField />

      <SiteNav />

      {/* Hero */}
      <section className="relative z-10">
        <div className="container flex flex-col items-center pb-20 pt-16 text-center md:pt-24">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            About AmarktAI Network
          </div>

          <h1 className="animate-fade-up max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl" style={{ animationDelay: '0.08s' }}>
            The AI backbone that <span className="text-gradient">powers every product</span>
          </h1>

          <p className="animate-fade-up mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: '0.18s' }}>
            AmarktAI Network is a central AI capability engine — a shared orchestration, background job, and asset storage layer that every connected app plugs into.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Our Mission</h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              We exist to eliminate the redundant AI infrastructure that every product team rebuilds. Routing, fallback chains, budget enforcement, artifact storage, provider abstraction, safety guardrails — these are platform problems, not product problems.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              AmarktAI Network centralizes these capabilities into a single, secure, multi-tenant runtime. Connected apps send capability requests with scoped credentials; Orchestra handles provider selection while queues, workers, storage, and authorised artifact routes handle delivery.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 border-t border-white/[0.06] py-16">
        <div className="container">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((s) => (
              <Reveal key={s.label}>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center">
                  <div className="text-3xl font-bold text-gradient">{s.value}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What We Believe</h2>
            <p className="mt-3 text-muted-foreground">Principles that guide every architectural decision.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2">
            {VALUES.map((v) => (
              <StaggerItem key={v.title}>
                <div className="group h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-500/30">
                  <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                    <v.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Architecture */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How It Works</h2>
            <p className="mt-3 text-muted-foreground">A capability-driven architecture with zero client-side provider logic.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { icon: Layers, title: 'Capability Contracts', desc: 'Typed schemas define every input and output. Connected apps request capabilities — never models or providers.' },
              { icon: Workflow, title: 'Intelligent Routing', desc: 'The engine selects the optimal provider based on capability, cost, latency, and availability. Fallback chains are automatic.' },
              { icon: Database, title: 'Artifact Lineage', desc: 'Artifacts retain storage, versioning, retrieval, trace, and proof metadata from the queued request to the authorised result.' },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div className="h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                  <item.icon className="mb-4 h-8 w-8 text-cyan-300" />
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-10 text-center md:p-16">
              <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
              <div className="relative">
                <Lock className="mx-auto mb-5 h-10 w-10 text-cyan-300" />
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Ready to connect?</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Request an API key and start routing capabilities through the Network.</p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Link href="/contact">
                    <Button size="lg" className="h-12 bg-gradient-to-r from-cyan-400 to-violet-500 px-7 text-black">Get in Touch <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                  <Link href="/login">
                    <Button size="lg" variant="outline" className="h-12 border-white/15 bg-white/[0.02] px-7">Sign In</Button>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
