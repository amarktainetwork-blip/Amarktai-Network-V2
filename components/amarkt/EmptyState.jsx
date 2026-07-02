'use client'
import { cn } from '@/lib/utils'

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-center', className)}>
      {Icon && <Icon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-white/[0.06] animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-32 rounded bg-white/[0.06] animate-pulse" />
          <div className="h-2.5 w-48 rounded bg-white/[0.04] animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-full rounded bg-white/[0.04] animate-pulse" />
        <div className="h-2.5 w-3/4 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-2.5 w-1/2 rounded bg-white/[0.04] animate-pulse" />
      </div>
    </div>
  )
}

export function SkeletonList({ count = 3, className }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="h-10 w-10 rounded-lg bg-white/[0.06] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse" />
            <div className="h-2.5 w-64 rounded bg-white/[0.04] animate-pulse" />
          </div>
          <div className="h-6 w-16 rounded-full bg-white/[0.06] animate-pulse" />
        </div>
      ))}
    </div>
  )
}
