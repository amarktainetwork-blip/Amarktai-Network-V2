'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, ArrowRight, Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
]

/**
 * Global site navigation bar shared across all public pages.
 * Clean header: Home, Features, About, Pricing, Contact, Login.
 * Auth-aware CTA button. Mobile responsive with hamburger menu.
 */
export function SiteNav() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem('amarktai_token'))
  }, [])

  return (
    <header className="relative z-20">
      <div className="container flex items-center justify-between py-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            AmarktAI <span className="text-muted-foreground font-normal">Network</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground transition">
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          {isAuthed ? (
            <Link href="/dashboard">
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

        {/* Mobile hamburger */}
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-white/[0.06] bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="container flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/[0.03] hover:text-foreground transition">
                {link.label}
              </Link>
            ))}
            <Link href={isAuthed ? '/dashboard' : '/login'} onClick={() => setMobileOpen(false)} className="mt-2">
              <Button className="w-full bg-white text-black hover:bg-white/90">
                {isAuthed ? 'Open Console' : 'Sign In'} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </nav>
        </div>
      )}
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
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground transition">{link.label}</Link>
          ))}
          <Link href="/login" className="hover:text-foreground transition">Login</Link>
        </div>
      </div>
    </footer>
  )
}
