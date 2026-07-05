'use client'
import { Button } from '@/components/ui/button'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'

export default function TestConnectionButton({ providerName }) {
  const explain = () => {
    toast.info('Backend integration pending', {
      description: `${providerName} requires a real /api/v1 provider health endpoint before connection tests can run.`,
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={explain}
      disabled
      title="Backend integration pending"
      className="border-white/10 text-xs h-7 px-2.5 opacity-70"
    >
      <Lock className="mr-1 h-3 w-3" /> Backend pending
    </Button>
  )
}
