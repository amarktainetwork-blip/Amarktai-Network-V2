'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function Reveal({ children, delay = 0, y = 18, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className, delayChildren = 0.05, stagger = 0.08 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { delayChildren, staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }}
    >
      {children}
    </motion.div>
  )
}

export function PageTransition({ children, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const STATUS_MAP = {
  mock: { label: 'Mock Active', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  not_configured: { label: 'Not Configured', cls: 'bg-white/5 text-muted-foreground border-white/10' },
  experimental: { label: 'Experimental', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  queued: { label: 'Queued', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
  running: { label: 'Running', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  failed: { label: 'Failed', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
}

export function StatusPill({ status, children }) {
  const s = STATUS_MAP[status] || STATUS_MAP.not_configured
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      {children || s.label}
    </span>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground/90">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function DropZone({ label = 'Drop files or click to browse', kind = 'asset' }) {
  return (
    <div className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.015] px-6 py-8 text-center transition hover:border-cyan-500/40 hover:bg-cyan-500/[0.03]">
      <div className="mb-2 rounded-full border border-white/10 bg-white/5 p-2.5 text-cyan-300 transition group-hover:scale-110">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0-12l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
      </div>
      <p className="text-sm text-foreground/80">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{kind} · simulated upload</p>
    </div>
  )
}
