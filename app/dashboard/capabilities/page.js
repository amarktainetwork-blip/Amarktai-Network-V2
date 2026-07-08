'use client'

import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { RuntimeProofSummary, useRuntimeProofStatus } from '@/components/dashboard/runtime-proof-summary'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  getRuntimeCapabilityProof,
  runtimeProofStatusClasses,
  runtimeProofStatusLabel,
} from '@/lib/runtime-proof-status'
import { Database, Globe, Image as ImageIcon, MessageSquare, Music, Settings, ShieldAlert, User, Video, Zap } from 'lucide-react'

const CAPABILITY_GROUPS = [
  { label: 'Chat & Reasoning', icon: MessageSquare, items: [
    { name: 'Chat', capability: 'chat', desc: 'Conversational AI, text generation, and natural language understanding.' },
    { name: 'Reasoning', capability: 'reasoning', desc: 'Multi-step logical analysis, decision frameworks, and structured problem solving.' },
    { name: 'Code', capability: 'code', desc: 'Code generation, refactoring, debugging, and technical documentation.' },
    { name: 'Research', capability: 'research', desc: 'Topic analysis, source gathering, and structured report generation.' },
  ]},
  { label: 'Image', icon: ImageIcon, items: [
    { name: 'Image Generation', capability: 'image_generation', desc: 'Create images from text prompts with style, aspect ratio, and quality controls.' },
    { name: 'Image Editing', capability: 'image_edit', desc: 'Edit, inpaint, upscale, and transform existing images.' },
  ]},
  { label: 'Video', icon: Video, items: [
    { name: 'Short Video', capability: 'video_generation', desc: 'Generate short-form video clips from text or image prompts.' },
    { name: 'Long-form Video', capability: 'long_form_video', desc: 'Multi-scene video production with storyboards and assembly.' },
    { name: 'Image-to-Video', capability: 'image_to_video', desc: 'Animate still images into video with camera and motion controls.' },
    { name: 'Video Edit / Remix', capability: 'video_edit', desc: 'Edit, restyle, and remix existing video content.' },
  ]},
  { label: 'Music & Voice', icon: Music, items: [
    { name: 'Music / Song', capability: 'music_generation', desc: 'Full song creation with genre, vocals, instrumentation, and arrangement.' },
    { name: 'Voice / TTS', capability: 'tts', desc: 'Text-to-speech with voice library, accent, emotion, and speed controls.' },
    { name: 'Speech-to-Text', capability: 'stt', desc: 'Audio transcription with speaker detection and output formats.' },
  ]},
  { label: 'Avatar', icon: User, items: [
    { name: 'Avatar Generation', capability: 'avatar_generation', desc: 'Create digital avatars with customizable appearance and style.' },
    { name: 'Talking Avatar', capability: 'avatar_generation', desc: 'Generate speaking avatar videos with lip-sync and emotion.' },
    { name: 'Lip-sync Avatar', capability: 'avatar_generation', desc: 'Sync avatar lip movements to audio tracks.' },
  ]},
  { label: 'Brand & Marketing', icon: Globe, items: [
    { name: 'Website Scrape / BrandPack', capability: 'brand_scrape', desc: 'Extract brand elements, content, and structure from websites.' },
    { name: 'Campaign Content', capability: 'campaign_generation', desc: 'Generate multi-platform campaign assets with brand consistency.' },
    { name: 'Social / Reel Pack', capability: 'social_reel_pack', desc: 'Create platform-optimized social media content packs.' },
  ]},
  { label: 'Knowledge / RAG', icon: Database, items: [
    { name: 'RAG Ingest', capability: 'rag_ingest', desc: 'Import and index documents for retrieval-augmented generation.' },
    { name: 'RAG Search', capability: 'rag_search', desc: 'Query knowledge bases with semantic search and citations.' },
  ]},
  { label: 'Apps & Agents', icon: Zap, items: [
    { name: 'App Request', capability: 'app_request', desc: 'Configure and deploy connected applications with capability permissions.' },
    { name: 'Agent Task', capability: 'agent_task', desc: 'Assign tasks to AI agents with tools, memory, and approval gates.' },
    { name: 'Workflow Automation', capability: 'workflow_automation', desc: 'Build multi-step workflows with triggers, gates, and success criteria.' },
  ]},
  { label: 'Gated', icon: ShieldAlert, items: [
    { name: 'Gated Text', capability: 'uncensored_text', desc: 'Approved provider lane remains backend-controlled and unproven for normal execution.' },
  ]},
]

export default function CapabilitiesPage() {
  const { status } = useRuntimeProofStatus()

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="Capability Library" subtitle="Runtime capability readiness is loaded from the backend runtime proof endpoint." />

      <RuntimeProofSummary compact />

      <div className="space-y-4">
        {CAPABILITY_GROUPS.map((group) => (
          <Card key={group.label} className="border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center gap-2">
              <group.icon className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold">{group.label}</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => {
                const proof = getRuntimeCapabilityProof(status, item.capability)
                const ready = proof.readyForDashboardExecution === true

                return (
                  <div
                    key={item.name}
                    aria-disabled={!ready}
                    className={`rounded-lg border p-3 ${ready ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-black/20 opacity-75'}`}
                  >
                    <div className="mb-1 text-xs font-semibold">{item.name}</div>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] ${runtimeProofStatusClasses(proof)}`}>
                        {runtimeProofStatusLabel(proof)}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {ready ? proof.provider : 'Disabled until backend proof passes'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="dev" className="rounded-xl border border-white/[0.06] px-4">
          <AccordionTrigger className="text-xs py-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Settings className="h-3 w-3" />
              Developer matrix
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold mb-2">Backend capability mapping</div>
              <div className="font-mono text-[10px]">
                text.chat - chat | text.reasoning - reasoning | text.code - code | image.generate - image_generation | image.edit - image_edit | video.generate - video_generation | music.generate - music_generation | voice.tts - tts | voice.stt - stt | avatar.generate - avatar_generation | scrape.crawl - brand_scrape | rag.ingest - rag_ingest | rag.query - rag_search
              </div>
              <div className="mt-2 font-mono text-[10px]">
                Planned: video.longform, video.image_to_video, video.edit, campaign.generate, social_reel_pack, app.request, agent.task, workflow.automation, research, uncensored.text
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </PageTransition>
  )
}
