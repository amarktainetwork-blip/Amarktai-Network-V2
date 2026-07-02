'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { NAV } from '@/lib/appdata'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FlaskConical, Plug, Palette, Boxes, Settings, Zap, ArrowLeft, Menu, X, LogOut,
  Activity, Cpu, Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const ICONS = { LayoutDashboard, FlaskConical, Plug, Palette, Boxes, Settings, Activity, Cpu, Bot }

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    try {
      const u = localStorage.getItem('amarktai_user')
      if (u) setUser(JSON.parse(u))
    } catch {}
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('amarktai_token')
    localStorage.removeItem('amarktai_user')
    window.location.href = '/login'
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[hsl(240_14%_3.5%)] md:flex">
        <Link href="/" className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Zap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">AmarktAI</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Network</div>
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
                prefetch={false}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition',
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
          <Link href="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to site
          </Link>
          {user && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-64 bg-[hsl(240_14%_3.5%)] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-2 py-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black"><Zap className="h-3.5 w-3.5" /></div>
                <span className="text-sm font-semibold">AmarktAI</span>
              </div>
              <button onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <nav className="space-y-1">
              {NAV.map((item) => {
                const Icon = ICONS[item.icon]
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition', active ? 'bg-white/[0.06] text-foreground' : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground')}>
                    <Icon className={cn('h-4 w-4', active ? 'text-cyan-300' : '')} />{item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-background/70 px-5 py-3 backdrop-blur-xl md:px-8">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 text-black"><Zap className="h-3.5 w-3.5" /></div>
            <span className="text-sm font-semibold">AmarktAI</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">AmarktAI Network</span>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 text-xs font-semibold">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
