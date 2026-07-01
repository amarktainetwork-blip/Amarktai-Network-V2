'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { NAV } from '@/lib/appdata'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FlaskConical, Boxes, ListChecks, Plug, Cpu, Brain, Settings, Zap, ArrowLeft,
} from 'lucide-react'

const ICONS = { LayoutDashboard, FlaskConical, Boxes, ListChecks, Plug, Cpu, Brain, Settings }

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[hsl(240_14%_3.5%)] md:flex">
        <Link href="/" className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Zap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">AmarktAI</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Network v2</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 hide-scrollbar">
          {NAV.map((item) => {
            const Icon = ICONS[item.icon]
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                  active
                    ? 'bg-white/[0.06] text-foreground shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]'
                    : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4 transition', active ? 'text-cyan-300' : 'text-muted-foreground group-hover:text-foreground')} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-white/[0.06] p-3">
          <Link href="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to site
          </Link>
          <div className="mt-2 flex items-center gap-2 rounded-md bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> Mock Mode active
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-background/70 px-5 py-3 backdrop-blur-xl md:px-8">
          <div className="md:hidden flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black"><Zap className="h-3.5 w-3.5" /></div>
            <span className="text-sm font-semibold">AmarktAI</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">Enterprise AI Capability Infrastructure</span>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 text-xs font-semibold">AK</div>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
