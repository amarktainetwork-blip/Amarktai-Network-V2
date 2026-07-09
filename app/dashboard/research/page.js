'use client'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Search, AlertTriangle, FileText, Send } from 'lucide-react'

export default function ResearchPage() {
  const [question, setQuestion] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Research" subtitle="Ask research questions and get sourced answers. Backend research endpoint is pending." />

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Research question</label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to research?"
              className="min-h-[80px] bg-white/[0.04] text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button disabled className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black text-xs">
              <Search className="mr-1.5 h-3 w-3" /> Research
            </Button>
            <span className="text-[10px] text-muted-foreground">Backend research endpoint pending</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-cyan-300" /> Sources / Citations</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Sources will appear here</p>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold">Saved Reports</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">Saved research reports will appear here</p>
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button disabled variant="outline" className="border-white/10 text-xs">
          <Send className="mr-1.5 h-3 w-3" /> Send to Chat
        </Button>
        <Button disabled variant="outline" className="border-white/10 text-xs">
          Turn into Campaign Idea
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Backend Pending
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Research backend (web search, source aggregation, citation) is not yet wired. No research results are being generated.
        </p>
      </div>
    </PageTransition>
  )
}
