'use client'

import Link from 'next/link'
import { Reveal, Stagger, StaggerItem } from '@/components/amarkt/kit'
import { ParticleField } from '@/components/amarkt/particles'
import { SiteNav, SiteFooter } from '@/components/amarkt/site-nav'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, Type, Image, Film, Music, Mic, User, Globe, BookOpen,
  Shield, Workflow, Database, Cpu, Layers, Server, Zap,
} from 'lucide-react'

const CAPABILITIES = [
  { icon: Type, title: 'Text & Language', category: 'Natural Language', desc: 'Chat completions, reasoning chains, code generation, structured output, embeddings, and reranking — all routed through a unified text engine with automatic provider selection.' },
  { icon: Image, title: 'Image Generation', category: 'Visual Creation', desc: 'High-fidelity image generation and editing via FLUX and diffusion models. Prompt in, artifact out — with full lineage tracking and secure asset delivery.' },
  { icon: Film, title: 'Video Generation', category: 'Motion & Film', desc: 'Long-form and short-form video synthesis with async job processing. Submit prompts, track progress in real time, and retrieve finished MP4 assets from storage.' },
  { icon: Music, title: 'Music & Audio', category: 'Audio Engine', desc: 'Full music generation with genre, mood, and vocal style controls. Cover art auto-generation. Multi-format output with duration and BPM targeting.' },
  { icon: Mic, title: 'Voice — TTS & STT', category: 'Speech Pipeline', desc: 'Text-to-speech with voice persona customization and speech-to-text transcription. Supports multiple languages, accents, and real-time streaming.' },
  { icon: User, title: 'Avatar Generation', category: 'Digital Presence', desc: 'AI-powered avatar creation with style, framing, and gesture controls. Paired with voice personas for complete digital presenter pipelines.' },
  { icon: Globe, title: 'Brand Scraping', category: 'Intelligence Gathering', desc: 'Automated corporate website extraction: typography matrices, color palettes, taglines, and content walls. Structured JSON output for brand intelligence profiles.' },
  { icon: BookOpen, title: 'RAG & Knowledge', category: 'Retrieval Engine', desc: 'Retrieval-Augmented Generation with vector embeddings, Qdrant-powered similarity search, and citation-backed responses. Ingest once, query forever.' },
]

const ENGINE_FEATURES = [
  { icon: Workflow, title: 'Intelligent Routing', desc: 'The engine selects optimal providers based on capability, cost, latency, and availability. Fallback chains activate automatically.' },
  { icon: Shield, title: 'Tenant Isolation', desc: 'Absolute data isolation between connected apps. Per-connection API keys, capability scopes, and daily budget enforcement.' },
  { icon: Database, title: 'Artifact Lineage', desc: 'Every generated asset is persisted, versioned, and retrievable. Full trace from request to delivered artifact with cost tracking.' },
  { icon: Cpu, title: 'Provider Abstraction', desc: 'Swap underlying AI providers without touching client code. The Network handles format translation, retry logic, and quality validation.' },
  { icon: Layers, title: 'Capability Contracts', desc: 'Strict typed input/output schemas per capability. Connected apps request capabilities — never models or providers.' },
  { icon: Server, title: 'Background Processing', desc: 'Durable BullMQ job queue with worker pipelines, progress tracking, automatic retries, and full artifact lineage.' },
]

export default function FeaturesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 obsidian-grid radial-fade" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 h-[600px] w-[600px] rounded-full swirl-1" />
        <div className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full swirl-2" />
        <div className="absolute left-1/3 bottom-0 h-[400px] w-[400px] rounded-full swirl-3" />
      </div>
      <ParticleField />

      <SiteNav />

      {/* Hero */}
      <section className="relative z-10">
        <div className="container flex flex-col items-center pb-20 pt-16 text-center md:pt-24">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-cyan-300" /> AI Capability Network
          </div>
          <h1 className="animate-fade-up max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl" style={{ animationDelay: '0.08s' }}>
            Every AI capability. <span className="text-gradient">One engine.</span>
          </h1>
          <p className="animate-fade-up mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: '0.18s' }}>
            AmarktAI Network is a modular AI capability engine that scales with your product. Text, image, video, voice, music, avatar, scraping, and retrieval — all accessible through a single API.
          </p>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Capability Modules</h2>
            <p className="mt-3 text-muted-foreground">Each module is a self-contained execution unit. Enable what you need. Scale what you use.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap) => (
              <StaggerItem key={cap.title}>
                <div className="group h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1.5 hover:border-cyan-500/30 hover:bg-white/[0.035]">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-cyan-400/70">{cap.category}</div>
                  <div className="mb-3 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                    <cap.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cap.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Engine Features */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">The Engine Behind It</h2>
            <p className="mt-3 text-muted-foreground">Enterprise-grade infrastructure that handles the complexity so your apps stay lightweight.</p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ENGINE_FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div className="h-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                  <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 text-cyan-300">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
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
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Ready to integrate?</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Connect your app with a single API key. The Network handles the rest.</p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Link href="/pricing">
                    <Button size="lg" className="h-12 bg-gradient-to-r from-cyan-400 to-violet-500 px-7 text-black">View Pricing <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                  <Link href="/contact">
                    <Button size="lg" variant="outline" className="h-12 border-white/15 bg-white/[0.02] px-7">Contact Sales</Button>
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
