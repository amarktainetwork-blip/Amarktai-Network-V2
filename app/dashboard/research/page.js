'use client'
import { useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Search, AlertTriangle, FileText, Send, Clock, Globe, Building2, Users, BookOpen } from 'lucide-react'

const RESEARCH_TYPES = [
  { label: 'Web Research', icon: Globe, status: 'excluded' },
  { label: 'Brand Research', icon: Building2, status: 'excluded' },
  { label: 'Competitor Research', icon: Users, status: 'excluded' },
  { label: 'Document Research', icon: BookOpen, status: 'excluded' },
]

export default function ResearchPage() {
  const [question, setQuestion] = useState('')

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Research" subtitle="Research and RAG ingestion/search are explicitly outside the current release candidate." />

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Excluded from this release
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          No research execution route is exposed. This page cannot fabricate search, source, citation, or RAG results.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RESEARCH_TYPES.map(({ label, icon: Icon, status }) => (
          <Card key={label} className="border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
              </span>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">
                <Clock className="mr-1 h-2.5 w-2.5" /> {status}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Research Question</label>
            <Textarea
              disabled
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
            <span className="text-[10px] text-muted-foreground">No release-candidate executor is registered</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-cyan-300" /> Citations / Sources</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">No citation data: research execution is excluded</p>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold">Saved Reports</h3>
          <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 p-6">
            <p className="text-xs text-muted-foreground">No reports: research persistence is excluded</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button disabled variant="outline" className="border-white/10 text-xs">
          <Send className="mr-1.5 h-3 w-3" /> Send to Chat
        </Button>
        <Button disabled variant="outline" className="border-white/10 text-xs">
          Turn into Campaign Idea
        </Button>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground">
          Embeddings and reranking are available as governed primitives; RAG ingestion, web research, and report generation are not part of this release.
        </p>
      </div>
    </PageTransition>
  )
}
