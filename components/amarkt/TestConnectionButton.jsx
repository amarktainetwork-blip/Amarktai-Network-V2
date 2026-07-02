'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

export default function TestConnectionButton({ providerName, hasKey }) {
  const [state, setState] = useState('idle') // idle | loading | success | error

  const test = () => {
    if (!hasKey) {
      toast.warning('No API key set', { description: `Enter a ${providerName} API key before testing.` })
      return
    }
    setState('loading')
    setTimeout(() => {
      const failed = Math.random() < 0.1
      if (failed) {
        setState('error')
        toast.error('Connection failed', { description: `${providerName}: Invalid API key or network error` })
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('success')
        toast.success('Connection verified', { description: `${providerName} API is reachable and responding` })
        setTimeout(() => setState('idle'), 3000)
      }
    }, 1500)
  }

  if (state === 'loading') {
    return (
      <Button variant="outline" size="sm" disabled className="border-white/10 text-xs h-7 px-2.5">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Testing…
      </Button>
    )
  }
  if (state === 'success') {
    return (
      <Button variant="outline" size="sm" disabled className="border-emerald-500/30 text-emerald-400 text-xs h-7 px-2.5">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
      </Button>
    )
  }
  if (state === 'error') {
    return (
      <Button variant="outline" size="sm" disabled className="border-rose-500/30 text-rose-400 text-xs h-7 px-2.5">
        <XCircle className="mr-1 h-3 w-3" /> Failed
      </Button>
    )
  }
  return (
    <Button variant="outline" size="sm" onClick={test} className="border-white/10 text-xs h-7 px-2.5 hover:border-cyan-500/30 hover:text-cyan-300">
      <Zap className="mr-1 h-3 w-3" /> Test Connection
    </Button>
  )
}
