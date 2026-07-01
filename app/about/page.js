'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ParticleField } from '@/components/amarkt/particles'
import {
  Zap, ArrowRight, Shield, Globe, Cpu, Layers, Users, Target,
  Lightbulb, Rocket, Server, Database, Workflow, Lock,
} from 'lucide-react'

const VALUES = [
  { icon: Target, title: 'Mission-Driven', desc: 'We believe every product team deserves enterprise-grade AI infrastructure without rebuilding it from scratch.' },
  { icon: Shield, title: 'Security First', desc: 'Tenant isolation, encrypted keys, scoped API tokens, and per-app budget controls — built in, not bolted on.' },
  { icon: Lightbulb, title: 'Provider Agnostic', desc: 'Route capabilities across GenX, Together AI, Groq, and experimental workbenches without touching client code.' },
  { icon: Rocket, title: 'Ship Faster', desc: 'Connected apps stay lightweight clients. The Network handles orchestration, queuing, storage, and delivery.' },
]

const STATS = [
  { value: '16+', label: 'AI Capabilities' },
  { value: '4', label: 'Provider Pathways' },
  { value: '55+', label: 'Domain Models' },
  { value: '99.9%', label: 'Uptime Target' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
}

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

      {/* Nav */}
      <header className="relative z-20">
        <div className="container flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">AmarktAI <span className="text-muted-foreground font-normal">Network</span></span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="/about" className="text-foreground transition">About</Link>
            <Link href="/contact" className="hover:text-foreground transition">Contact</Link>
            <Link href="/login" className="hover:text-foreground transition">Login</Link>
          </nav>
          <Link href="/dashboard/command-center">
            <Button className="bg-white text-black hover:bg-white/90">Open Console <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="container flex flex-col items-center pb-20 pt-16 text-center md:pt-24">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 text-cyan-300" /> About AmarktAI Network
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            The AI backbone that <span className="text-gradient">powers every product</span>
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="mt-6 max-w-2xl text-lg text-muted-foreground">
            AmarktAI Network is a central AI capability engine — a shared orchestration, background job, and asset storage layer that every connected app plugs into. Products stay lightweight. The Network handles the rest.
          </motion.p>
        </div>
      </section>

      {/* Mission */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Our Mission</h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              We exist to eliminate the redundant AI infrastructure that every product team rebuilds. Routing, fallback chains, budget enforcement, artifact storage, provider abstraction, safety guardrails — these are platform problems, not product problems.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              AmarktAI Network centralizes these capabilities into a single, secure, multi-tenant engine. Connected apps send a capability request with a scoped API key. The Network handles provider selection, execution, storage, and delivery — returning clean artifacts through secure paths.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 border-t border-white/[0.06] py-16">
        <div className="container">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div key={s.label} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center">
                <div className="text-3xl font-bold text-gradient">{s.value}</div>
                <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What We Believe</h2>
            <p className="mt-3 text-muted-foreground">Principles that guide every architectural decision.</p>
          </motion.div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {VALUES.map((v, i) => (
              <motion.div key={v.title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-500/30">
                <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                  <v.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How It Works</h2>
            <p className="mt-3 text-muted-foreground">A capability-driven architecture with zero client-side provider logic.</p>
          </motion.div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { icon: Layers, title: 'Capability Contracts', desc: 'Strict Zod-typed schemas define every input and output. Connected apps request capabilities — never models or providers.' },
              { icon: Workflow, title: 'Intelligent Routing', desc: 'The engine selects the optimal provider based on capability, cost, latency, and availability. Fallback chains are automatic.' },
              { icon: Database, title: 'Artifact Lineage', desc: 'Every generated asset is persisted, versioned, and retrievable. Full trace from request to delivered artifact.' },
            ].map((item, i) => (
              <motion.div key={item.title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                <item.icon className="mb-4 h-8 w-8 text-cyan-300" />
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
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
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>&copy; 2025 AmarktAI Network</span>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-foreground transition">About</Link>
            <Link href="/contact" className="hover:text-foreground transition">Contact</Link>
            <Link href="/login" className="hover:text-foreground transition">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
