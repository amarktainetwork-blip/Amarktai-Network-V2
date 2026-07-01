'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ParticleField } from '@/components/amarkt/particles'
import { SiteNav, SiteFooter } from '@/components/amarkt/site-nav'
import {
  Send, Mail, MessageSquare, MapPin,
  CheckCircle2, Loader2, AlertCircle,
} from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setStatus('sent')
        setForm({ name: '', email: '', company: '', message: '' })
      } else {
        const data = await res.json()
        setErrorMsg(data.message || 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 obsidian-grid radial-fade" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 top-0 h-[500px] w-[500px] rounded-full swirl-2" />
        <div className="absolute -left-32 bottom-1/4 h-[400px] w-[400px] rounded-full swirl-1" />
      </div>
      <ParticleField />

      <SiteNav />

      {/* Content */}
      <section className="relative z-10">
        <div className="container pb-24 pt-16 md:pt-24">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-300" /> Get in Touch
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Let&apos;s <span className="text-gradient">connect</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="mt-4 max-w-xl text-lg text-muted-foreground">
            Have questions about integrating with AmarktAI Network? Want to request an API key? We&apos;d love to hear from you.
          </motion.p>

          <div className="mt-14 grid gap-10 lg:grid-cols-5">
            {/* Form */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="lg:col-span-3">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8">
                <AnimatePresence mode="wait">
                  {status === 'sent' ? (
                    <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
                      <h3 className="text-xl font-semibold">Message Sent</h3>
                      <p className="mt-2 text-muted-foreground">Thank you for reaching out. We&apos;ll get back to you within 24 hours.</p>
                      <Button variant="outline" className="mt-6 border-white/15" onClick={() => setStatus('idle')}>Send Another</Button>
                    </motion.div>
                  ) : (
                    <motion.form key="form" onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-muted-foreground">Name</label>
                          <input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Your name" className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 input-focus-ring" />
                        </div>
                        <div>
                          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-muted-foreground">Email</label>
                          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="you@company.com" className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 input-focus-ring" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-muted-foreground">Company / Project <span className="text-muted-foreground/50">(optional)</span></label>
                        <input id="company" name="company" value={form.company} onChange={handleChange} placeholder="Your company or project name" className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 input-focus-ring" />
                      </div>
                      <div>
                        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-muted-foreground">Message</label>
                        <textarea id="message" name="message" value={form.message} onChange={handleChange} required rows={5} placeholder="Tell us about your use case, questions, or how we can help..." className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 input-focus-ring" />
                      </div>

                      <AnimatePresence>
                        {status === 'error' && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            <AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <Button type="submit" disabled={status === 'sending'} className="h-11 bg-gradient-to-r from-cyan-400 to-violet-500 px-6 text-black hover:opacity-90">
                        {status === 'sending' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><Send className="mr-2 h-4 w-4" />Send Message</>}
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Contact Info */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4} className="space-y-6 lg:col-span-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                <Mail className="mb-3 h-6 w-6 text-cyan-300" />
                <h3 className="font-semibold">Email</h3>
                <p className="mt-1 text-sm text-muted-foreground">admin@amarktai.co.za</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                <MapPin className="mb-3 h-6 w-6 text-cyan-300" />
                <h3 className="font-semibold">Location</h3>
                <p className="mt-1 text-sm text-muted-foreground">South Africa</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                <MessageSquare className="mb-3 h-6 w-6 text-cyan-300" />
                <h3 className="font-semibold">Response Time</h3>
                <p className="mt-1 text-sm text-muted-foreground">We aim to respond within 24 hours during business days.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
