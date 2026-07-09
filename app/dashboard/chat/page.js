'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { getRuntimeCapabilityProof } from '@/lib/runtime-proof-status'
import { MessageSquare, Send, Brain, Image as ImageIcon, Video, Music, Search, FileText, Paperclip, AlertTriangle, ExternalLink } from 'lucide-react'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const scrollRef = useRef(null)
  const { status: runtimeProofStatus } = useRuntimeProofStatus()
  const imageProof = getRuntimeCapabilityProof(runtimeProofStatus, 'image_generation')
  const videoProof = getRuntimeCapabilityProof(runtimeProofStatus, 'video_generation')
  const imageReady = imageProof.readyForDashboardExecution === true
  const videoReady = videoProof.readyForDashboardExecution === true

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const attachedTools = [
    { label: 'Image', icon: ImageIcon, status: imageReady ? 'live' : 'pending', href: '/dashboard/image' },
    { label: 'Video', icon: Video, status: videoReady ? 'live' : 'pending', href: '/dashboard/video' },
    { label: 'Music', icon: Music, status: 'pending', href: '/dashboard/music' },
    { label: 'Research', icon: Search, status: 'pending', href: '/dashboard/research' },
    { label: 'Files', icon: FileText, status: 'partial', href: '/dashboard/library' },
  ]

  return (
    <PageTransition className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <PageHeader title="Chat" subtitle="Conversational creation with memory. Backend conversation memory endpoint pending." />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="flex min-h-0 flex-col border-white/[0.07] bg-white/[0.02]">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Chat UI ready. Backend conversation memory endpoint pending.</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">Start a conversation — messages are local only until backend is wired.</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'ml-10 bg-cyan-500/10 text-cyan-100' : 'mr-10 bg-white/[0.04] text-foreground'}`}>
                {msg.content}
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-4">
            <div className="flex gap-2">
              <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition hover:text-foreground">
                <Paperclip className="h-4 w-4" />
              </button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    setMessages((prev) => [...prev, { role: 'user', content: input.trim() }])
                    setInput('')
                  }
                }}
                placeholder="Type a message..."
                className="h-9 bg-white/[0.04] text-sm"
              />
              <Button
                onClick={() => {
                  if (input.trim()) {
                    setMessages((prev) => [...prev, { role: 'user', content: input.trim() }])
                    setInput('')
                  }
                }}
                disabled={!input.trim()}
                className="h-9 shrink-0 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-3 text-black"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">
                <AlertTriangle className="mr-1 h-2.5 w-2.5" /> Local only
              </Badge>
              <span className="text-[10px] text-muted-foreground">Backend conversation memory endpoint pending</span>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/[0.07] bg-white/[0.02] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Brain className="h-3.5 w-3.5 text-violet-300" /> Memory</h3>
            <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <p className="text-[10px] text-amber-200">Memory backend pending. Conversations are not persisted yet.</p>
            </div>
          </Card>

          <Card className="border-white/[0.07] bg-white/[0.02] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Paperclip className="h-3.5 w-3.5 text-cyan-300" /> Attached Tools</h3>
            <div className="space-y-2">
              {attachedTools.map((tool) => {
                const Icon = tool.icon
                const statusLabel = tool.status === 'live' ? 'Live' : tool.status === 'partial' ? 'Partial' : 'Pending'
                const statusClass = tool.status === 'live'
                  ? 'border-emerald-500/30 text-emerald-300'
                  : tool.status === 'partial'
                    ? 'border-cyan-500/30 text-cyan-300'
                    : 'border-amber-500/30 text-amber-400'
                return (
                  <Link key={tool.label} href={tool.href} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-xs transition hover:bg-white/[0.04]">
                    <span className="flex items-center gap-2"><Icon className="h-3 w-3 text-muted-foreground" />{tool.label}</span>
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className={`${statusClass} text-[9px]`}>{statusLabel}</Badge>
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                    </span>
                  </Link>
                )
              })}
            </div>
          </Card>

          <Card className="border-white/[0.07] bg-white/[0.02] p-4">
            <h3 className="mb-3 text-xs font-semibold">History</h3>
            <p className="text-[10px] text-muted-foreground">Saved conversations will appear here after backend is wired.</p>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
