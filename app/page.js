'use client'
import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { Reveal, Stagger, StaggerItem } from '@/components/amarkt/kit'
import { ParticleField } from '@/components/amarkt/particles'
import { SiteNav, SiteFooter } from '@/components/amarkt/site-nav'
import ParticleEntry from '@/components/amarkt/ParticleEntry'
import { Button } from '@/components/ui/button'
import {
  Boxes, Server, Database, Workflow, ShieldCheck, ArrowRight, Cpu, Layers, Sparkles,
} from 'lucide-react'

const FEATURES = [
  { icon: Workflow, title: 'AI Orchestration', desc: 'Route any capability — text, image, video, audio — through a single control plane with intelligent provider selection.' },
  { icon: Server, title: 'Background Jobs', desc: 'Durable task queue with worker pipelines, progress tracking, retries and full artifact lineage.' },
  { icon: Database, title: 'Asset Storage', desc: 'Every generated asset persisted, versioned and retrievable through secure signed paths.' },
  { icon: Layers, title: 'Capability Contracts', desc: 'Strict typed input/output schemas per capability. Connected apps stay lightweight clients.' },
  { icon: ShieldCheck, title: 'Tenant Isolation', desc: 'Absolute data isolation between apps with per-connection keys, scopes and daily budgets.' },
  { icon: Cpu, title: 'Multi-Provider', desc: 'Swap underlying providers without touching client code. Fallback chains are automatic.' },
]

export default function Landing() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [entryComplete, setEntryComplete] = useState(false)

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem('amarktai_token'))
  }, [])

  const handleEntryComplete = useCallback(() => {
    setEntryComplete(true)
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Particle Entry Animation */}
      <ParticleEntry onComplete={handleEntryComplete} />

      <div className="pointer-events-none absolute inset-0 obsidian-grid radial-fade" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 h-[600px] w-[600px] rounded-full swirl-1" />
        <div className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full swirl-2" />
        <div className="absolute left-1/3 bottom-0 h-[400px] w-[400px] rounded-full swirl-3" />
      </div>
      <ParticleField />

      {/* Main content wrapper with entry transition */}
      <main
        id="mainContent"
        style={{
          opacity: entryComplete ? 1 : 0,
          transform: entryComplete ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 1.5s ease-out, transform 1.5s ease-out',
          position: 'relative',
          zIndex: 10,
        }}
      >

      <SiteNav />

      {/* Hero */}
      <section className="relative z-10">
        <div className="container flex flex-col items-center pb-20 pt-16 text-center md:pt-24">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Enterprise AI Capability Infrastructure
          </div>

          <h1 className="animate-fade-up max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl" style={{ animationDelay: '0.08s' }}>
            The AI backbone your <span className="text-gradient">apps plug into</span>
          </h1>

          <p className="animate-fade-up mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: '0.18s' }}>
            AmarktAI Network handles the complete AI orchestration, background jobs, and asset storage pipelines —
            so every connected app stays a lightweight client.
          </p>

          <div className="animate-fade-up mt-9 flex flex-col items-center gap-3 sm:flex-row" style={{ animationDelay: '0.28s' }}>
            <Link href={isAuthed ? '/dashboard/command-center' : '/login'}>
              <Button size="lg" className="h-12 bg-gradient-to-r from-cyan-400 to-violet-500 px-7 text-black transition-transform duration-200 hover:scale-105 hover:opacity-90 glow-cyan">
                {isAuthed ? 'Launch Command Center' : 'Get Started'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/features">
              <Button size="lg" variant="outline" className="h-12 border-white/15 bg-white/[0.02] px-7 transition-transform duration-200 hover:scale-105 hover:bg-white/[0.05]">
                Explore Features
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One infrastructure. Every capability.</h2>
            <p className="mt-3 text-muted-foreground">Stop rebuilding AI plumbing in every product. Centralize it once.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div className="group h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1.5 hover:border-cyan-500/30 hover:bg-white/[0.035]">
                  <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal className="mt-12 text-center">
            <Link href="/features">
              <Button variant="outline" className="border-white/15 bg-white/[0.02]">
                View All Capabilities <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-10 text-center md:p-16">
              <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
              <div className="relative">
                <Boxes className="mx-auto mb-5 h-10 w-10 text-cyan-300" />
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Ship AI features without the AI overhead</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Explore the full operational console — command center, studio, jobs, artifacts and more.</p>
                <Link href={isAuthed ? '/dashboard/command-center' : '/login'}>
                  <Button size="lg" className="mt-8 h-12 bg-white px-8 text-black transition-transform duration-200 hover:scale-105 hover:bg-white/90">
                    {isAuthed ? 'Enter the Console' : 'Sign In to Start'} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
      </main>
    </div>
  )
}
