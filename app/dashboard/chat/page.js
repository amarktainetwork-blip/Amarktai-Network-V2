'use client'

import { useEffect, useRef, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getAdminToken } from '@/lib/admin-session'
import { Loader2, MessageSquare, Send, Square } from 'lucide-react'

const HISTORY_KEY = 'amarktai_chat_history_v1'

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [prompt, setPrompt] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [evidence, setEvidence] = useState(null)
  const controllerRef = useRef(null)

  useEffect(() => {
    try { setMessages(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')) } catch { setMessages([]) }
    return () => controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    if (messages.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50)))
  }, [messages])

  const submit = async () => {
    const text = prompt.trim()
    if (!text || streaming) return
    const prior = messages.map(({ role, content }) => ({ role, content }))
    setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setPrompt(''); setError(''); setEvidence(null); setStreaming(true)
    const controller = new AbortController(); controllerRef.current = controller
    try {
      const response = await fetch('/api/admin/streaming-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ prompt: text, input: { messages: prior } }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.message || `Streaming request failed (${response.status})`)
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n'); buffer = blocks.pop() || ''
        for (const block of blocks) {
          const event = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
          const dataText = block.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
          if (!dataText) continue
          const data = JSON.parse(dataText)
          if (event === 'route') setEvidence(data)
          if (event === 'chunk' && data.delta) setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + data.delta } : message))
          if (event === 'complete') setEvidence((current) => ({ ...current, ...data, completed: true }))
          if (event === 'error') throw new Error(data.message || 'Streaming execution failed')
        }
      }
    } catch (caught) {
      if (caught.name !== 'AbortError') setError(caught.message || 'Streaming execution failed')
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === 'assistant' && !message.content)))
    } finally {
      controllerRef.current = null; setStreaming(false)
    }
  }

  return <PageTransition className="space-y-6">
    <PageHeader title="Chat" subtitle="Multi-turn streaming chat. Orchestra selects provider and model." />
    <Card className="border-white/[0.07] bg-white/[0.02] p-5">
      <div className="min-h-[360px] space-y-3">
        {!messages.length && <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground"><MessageSquare className="mr-2 h-4 w-4" />Start a conversation</div>}
        {messages.map((message, index) => <div key={index} className={`max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${message.role === 'user' ? 'ml-auto bg-cyan-500/10 text-cyan-50' : 'bg-white/[0.04]'}`}>{message.content || <Loader2 className="h-4 w-4 animate-spin" />}</div>)}
      </div>
      {error && <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/[0.05] p-3 text-xs text-rose-200">{error}</div>}
      {evidence?.completed && <div className="mt-3 flex flex-wrap gap-2 text-[10px]"><Badge variant="outline">Job {evidence.jobId}</Badge><Badge variant="outline">{evidence.provider}</Badge><Badge variant="outline">{evidence.model}</Badge><Badge variant="outline">{evidence.executorId}</Badge><Badge variant="outline">{evidence.chunks} chunks</Badge></div>}
      <div className="mt-4 flex gap-2">
        <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="Message AmarktAI..." className="min-h-[72px] bg-white/[0.04]" />
        {streaming ? <Button aria-label="Cancel stream" variant="destructive" onClick={() => controllerRef.current?.abort()}><Square className="h-4 w-4" /></Button> : <Button aria-label="Send message" onClick={submit} disabled={!prompt.trim()}><Send className="h-4 w-4" /></Button>}
      </div>
    </Card>
  </PageTransition>
}
