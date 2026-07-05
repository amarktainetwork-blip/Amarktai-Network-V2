'use client'

import Link from 'next/link'
import { Reveal, Stagger, StaggerItem } from '@/components/amarkt/kit'
import { ParticleField } from '@/components/amarkt/particles'
import { SiteNav, SiteFooter } from '@/components/amarkt/site-nav'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, Check, Zap, Server, CreditCard, ShieldCheck, Package,
} from 'lucide-react'

const TIERS = [
  {
    name: 'Growth',
    apps: '5 Apps',
    price: 'R799',
    period: '/mo',
    highlight: false,
    features: [
      'VPS Hosting included',
      'Basic maintenance updates',
      '5,000 free tokens per month',
      'Standard support',
      'All capability modules',
      'Artifact storage',
    ],
  },
  {
    name: 'Scale',
    apps: '10 Apps',
    price: 'R1,499',
    period: '/mo',
    highlight: true,
    features: [
      'VPS Hosting included',
      'Basic maintenance updates',
      '10,000 free tokens per month',
      'Priority support',
      'All capability modules',
      'Artifact storage',
      'Advanced routing',
    ],
  },
  {
    name: 'Network',
    apps: '15+ Apps',
    price: 'R1,999',
    period: '/mo',
    highlight: false,
    features: [
      'VPS Hosting included',
      'Basic maintenance updates',
      '15,000 free tokens per month',
      'Dedicated support',
      'All capability modules',
      'Artifact storage',
      'Advanced routing',
      'Custom integrations',
    ],
  },
]

const TOKEN_PACKS = [
  { tokens: '5,000', price: 'R4,500', label: 'Once-off' },
  { tokens: '10,000', price: 'R7,999', label: 'Once-off', popular: true },
]

export default function PricingPage() {
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
        <div className="container flex flex-col items-center pb-16 pt-16 text-center md:pt-24">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-cyan-300" /> Simple, Transparent Pricing
          </div>
          <h1 className="animate-fade-up max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl" style={{ animationDelay: '0.08s' }}>
            Scale your AI. <span className="text-gradient">Pay for what you use.</span>
          </h1>
          <p className="animate-fade-up mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: '0.18s' }}>
            Choose a plan that matches your product footprint. Backend execution, usage metering, and billing controls require live integration before production rollout.
          </p>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="relative z-10 pb-24">
        <div className="container">
          <Stagger className="grid gap-6 md:grid-cols-3">
            {TIERS.map((tier) => (
              <StaggerItem key={tier.name}>
                <div className={`relative flex h-full flex-col rounded-2xl border p-8 transition-all duration-200 hover:-translate-y-1 ${
                  tier.highlight
                    ? 'border-cyan-500/40 bg-gradient-to-b from-cyan-500/[0.06] to-transparent shadow-lg shadow-cyan-500/10'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                }`}>
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-0.5 text-xs font-medium text-cyan-300">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{tier.apps}</p>
                  </div>

                  <div className="mb-8">
                    <span className="text-4xl font-extrabold">{tier.price}</span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/contact">
                    <Button className={`w-full ${tier.highlight ? 'bg-gradient-to-r from-cyan-400 to-violet-500 text-black glow-cyan' : 'bg-white text-black hover:bg-white/90'}`}>
                      Contact Sales <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Token Top-Up Store */}
      <section className="relative z-10 border-t border-white/[0.06] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5 text-cyan-300" /> Token Store
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Top-Up Tokens</h2>
            <p className="mt-3 text-muted-foreground">Need more capacity? Purchase bulk tokens as a once-off addition to any plan.</p>
          </Reveal>

          <Stagger className="mx-auto mt-14 grid max-w-2xl gap-6 sm:grid-cols-2">
            {TOKEN_PACKS.map((pack) => (
              <StaggerItem key={pack.tokens}>
                <div className={`relative rounded-2xl border p-8 text-center transition-all duration-200 hover:-translate-y-1 ${
                  pack.popular
                    ? 'border-violet-500/40 bg-gradient-to-b from-violet-500/[0.06] to-transparent'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                }`}>
                  {pack.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-0.5 text-xs font-medium text-violet-300">
                      Best Value
                    </div>
                  )}
                  <div className="mb-2 text-sm font-medium text-muted-foreground">{pack.tokens} Tokens</div>
                  <div className="text-3xl font-extrabold">{pack.price}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{pack.label}</div>
                  <Link href="/contact">
                    <Button variant="outline" className="mt-6 w-full border-white/15 bg-white/[0.02]">
                      Purchase <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          {/* Terms */}
          <Reveal className="mx-auto mt-14 max-w-2xl rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-cyan-300" />
            <p className="text-sm text-muted-foreground">
              All monthly plans include server costs and core maintenance updates. Tokens are the fuel for your AI — each capability consumes tokens based on complexity and provider cost. T&amp;Cs apply.
            </p>
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
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Ready to get started?</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Choose a plan and prepare your app contracts before backend execution is enabled.</p>
                <Link href="/contact">
                  <Button size="lg" className="mt-8 h-12 bg-gradient-to-r from-cyan-400 to-violet-500 px-8 text-black glow-cyan">
                    Contact Sales <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
