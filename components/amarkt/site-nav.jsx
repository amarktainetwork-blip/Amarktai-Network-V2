'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, ArrowRight } from 'lucide-react'

/**
 * Global site navigation bar shared across all public pages.
 * Shows About and Contact links. CTA button is auth-aware.
 */
export function SiteNav() {
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem('amarktai_token'))
  }, [])

  return (
    <header className="relative z-20">
      <div className="container flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            AmarktAI <span className="text-muted-foreground font-normal">Network</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link href="/about" className="hover:text-foreground transition">About</Link>
          <Link href="/contact" className="hover:text-foreground transition">Contact</Link>
          <Link href="/login" className="hover:text-foreground transition">Login</Link>
        </nav>
        {isAuthed ? (
          <Link href="/dashboard/command-center">
            <Button className="bg-white text-black hover:bg-white/90">
              Open Console <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Link href="/login">
            <Button className="bg-white text-black hover:bg-white/90">
              Sign In <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}

/**
 * Global site footer shared across all public pages.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] py-8">
      <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
        <span>&copy; 2026 AmarktAI Network</span>
        <div className="flex gap-6">
          <Link href="/about" className="hover:text-foreground transition">About</Link>
          <Link href="/contact" className="hover:text-foreground transition">Contact</Link>
          <Link href="/login" className="hover:text-foreground transition">Login</Link>
        </div>
      </div>
    </footer>
  )
}
