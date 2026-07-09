'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Send, Zap, ExternalLink, AlertTriangle } from 'lucide-react'

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Image Studio" subtitle="Generate images through the existing image_generation worker flow. Auto mode selects the best provider and model." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Prompt</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              className="bg-white/[0.04] text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 text-[10px]">
                <Zap className="mr-1 h-2.5 w-2.5" /> Auto mode
              </Badge>
              <span className="text-[10px] text-muted-foreground">Runtime selects provider and model</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard/studio">
              <Button
                disabled={!prompt.trim()}
                className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs"
              >
                <Send className="mr-1.5 h-3 w-3" /> Generate via Studio
              </Button>
            </Link>
            <span className="text-[10px] text-muted-foreground">Submits to existing image_generation job flow</span>
          </div>
        </div>
      </Card>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-cyan-300" /> Latest Result</h3>
        <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-8">
          <div className="text-center">
            <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Generated images will appear here</p>
            <Link href="/dashboard/artifacts" className="mt-2 inline-block text-[10px] text-cyan-300 hover:underline">
              View all artifacts <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </Card>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Model Selection
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Provider/model selection is handled by the backend runtime. No manual overrides are exposed in app-facing flows. Admin testing may be added when a safe backend route exists.
        </p>
      </div>
    </PageTransition>
  )
}
