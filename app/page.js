'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Reveal, Stagger, StaggerItem } from '@/components/amarkt/kit'
import { Button } from '@/components/ui/button'
import {
  Zap, Boxes, Server, Database, Workflow, ShieldCheck, ArrowRight, Cpu, Layers, Radio, Sparkles,
} from 'lucide-react'

const FEATURES = [
  { icon: Workflow, title: 'AI Orchestration', desc: 'Route any capability — text, image, video, audio — across GenX, Together AI and Groq from one control plane.' },
  { icon: Server, title: 'Background Jobs', desc: 'Durable task queue with worker pipelines, progress tracking, retries and full artifact lineage.' },
  { icon: Database, title: 'Asset Storage', desc: 'Every generated asset persisted, versioned and retrievable through secure signed paths.' },
  { icon: Layers, title: 'Capability Contracts', desc: 'Strict Zod-typed input/output schemas per capability. Connected apps stay lightweight clients.' },
  { icon: ShieldCheck, title: 'Tenant Isolation', desc: 'Absolute data isolation between apps with per-connection keys, scopes and daily budgets.' },
  { icon: Cpu, title: 'Multi-Provider', desc: 'Core pathways plus isolated experimental workbenches like MiMo — swap providers without touching clients.' },
]

const PIPELINE = [
  { step: '01', title: 'Connect', desc: 'Apps request a capability with a scoped API key.' },
  { step: '02', title: 'Enqueue', desc: 'AmarktAI validates the contract and enqueues a background job.' },
  { step: '03', title: 'Orchestrate', desc: 'Workers execute against the right provider and stream progress.' },
  { step: '04', title: 'Deliver', desc: 'Artifacts land in storage; clients retrieve via secure paths.' },
]

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* backgrounds */}
      <div className="pointer-events-none absolute inset-0 obsidian-grid radial-fade" />
      <div className="pointer-events-none absolute inset-0 aurora" />

      {/* Nav */}
      <header className="relative z-20">
        <div className="container flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">AmarktAI <span className="text-muted-foreground font-normal">Network</span></span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#capabilities" className="hover:text-foreground transition">Capabilities</a>
            <a href="#pipeline" className="hover:text-foreground transition">Pipeline</a>
            <a href="#providers" className="hover:text-foreground transition">Providers</a>
          </nav>
          <Link href="/dashboard/command-center">
            <Button className="bg-white text-black hover:bg-white/90">Open Console <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="container flex flex-col items-center pb-20 pt-16 text-center md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Enterprise AI capability infrastructure · Mock Mode
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
            className="max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
          >
            The AI backbone your <span className="text-gradient">apps plug into</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 max-w-2xl text-lg text-muted-foreground"
          >
            AmarktAI Network handles the complete AI orchestration, background jobs, and asset storage pipelines —
            so every connected app stays a lightweight client.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Link href="/dashboard/command-center">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" className="h-12 bg-gradient-to-r from-cyan-400 to-violet-500 px-7 text-black hover:opacity-90 glow-cyan">
                  Launch Command Center <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
            <Link href="/dashboard/studio">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" variant="outline" className="h-12 border-white/15 bg-white/[0.02] px-7 hover:bg-white/[0.05]">
                  Explore the Studio
                </Button>
              </motion.div>
            </Link>
          </motion.div>

          {/* provider strip */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-muted-foreground"
          >
            <span className="text-xs uppercase tracking-widest">Orchestrating</span>
            {['GenX', 'Together AI', 'Groq', 'MiMo'].map((n) => (
              <span key={n} className="flex items-center gap-2 font-medium text-foreground/70"><Radio className="h-3.5 w-3.5 text-cyan-300" />{n}</span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="capabilities" className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One infrastructure. Every capability.</h2>
            <p className="mt-3 text-muted-foreground">Stop rebuilding AI plumbing in every product. Centralize it once.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <motion.div whileHover={{ y: -6 }} className="group h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:border-cyan-500/30 hover:bg-white/[0.035]">
                  <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A pipeline that runs itself</h2>
            <p className="mt-3 text-muted-foreground">From request to delivered artifact — fully orchestrated.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 md:grid-cols-4">
            {PIPELINE.map((s) => (
              <StaggerItem key={s.step}>
                <div className="relative h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                  <div className="mb-3 font-mono text-2xl text-gradient font-bold">{s.step}</div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* CTA */}
      <section id="providers" className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-10 text-center md:p-16">
              <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
              <div className="relative">
                <Boxes className="mx-auto mb-5 h-10 w-10 text-cyan-300" />
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Ship AI features without the AI overhead</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Explore the full operational console — command center, studio, jobs, artifacts and more.</p>
                <Link href="/dashboard/command-center">
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} className="mt-8 inline-block">
                    <Button size="lg" className="h-12 bg-white px-8 text-black hover:bg-white/90">Enter the Console <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </motion.div>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>© 2025 AmarktAI Network</span>
          <span className="font-mono text-xs">amarktai-network-v2 · mock environment</span>
        </div>
      </footer>
    </div>
  )
}
