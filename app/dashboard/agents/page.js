'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Bot, ShieldCheck, Clock, Activity, AlertTriangle, CheckCircle2, Settings, Zap, BookOpen } from 'lucide-react'

export default function AgentsPage() {
  const [agentEnabled, setAgentEnabled] = useState(false)
  const [autoLearn, setAutoLearn] = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(true)

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Agents & Learning" subtitle="Configure autonomous agent behavior, schedules, and safety controls." />

      {/* Warning Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/90">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Agents are in controlled mode.</div>
          <div className="text-xs text-amber-300/70 mt-1">No uncontrolled self-learning. All agent actions require approval by default.</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agent Scope */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-cyan-300" /> Agent Scope</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div><span className="text-sm">Enable Agents</span><p className="text-[10px] text-muted-foreground">Allow autonomous agent execution</p></div>
              <Switch checked={agentEnabled} onCheckedChange={setAgentEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div><span className="text-sm">Auto-Learning</span><p className="text-[10px] text-muted-foreground">Allow agents to learn from interactions</p></div>
              <Switch checked={autoLearn} onCheckedChange={setAutoLearn} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div><span className="text-sm">Approval Required</span><p className="text-[10px] text-muted-foreground">Require human approval before execution</p></div>
              <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
            </div>
            <Field label="Allowed Capabilities">
              <div className="flex flex-wrap gap-1.5">
                {['Chat', 'Image', 'Video', 'Voice', 'Scrape', 'RAG'].map((c) => (
                  <Badge key={c} variant="outline" className="border-white/10 cursor-pointer hover:border-cyan-500/30 hover:text-cyan-300 transition text-[10px]">{c}</Badge>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        {/* Safety Controls */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Safety Controls</h3>
          <div className="space-y-4">
            <Field label="Max Actions per Hour"><Input type="number" defaultValue={10} className="bg-black/20" /></Field>
            <Field label="Max Token Budget per Run"><Input type="number" defaultValue={1000} className="bg-black/20" /></Field>
            <Field label="Rollback Policy"><Select defaultValue="auto"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto-rollback on failure</SelectItem><SelectItem value="manual">Manual rollback only</SelectItem><SelectItem value="none">No rollback</SelectItem></SelectContent></Select></Field>
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <div><span className="text-sm">Require Human Approval</span><p className="text-[10px] text-muted-foreground">Block execution until approved</p></div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* Schedules */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-amber-300" /> Schedules</h3>
          <div className="space-y-4">
            <Field label="Learning Cycle"><Select defaultValue="daily"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="disabled">Disabled</SelectItem><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></Field>
            <Field label="Health Check Interval"><Select defaultValue="15m"><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5m">Every 5 minutes</SelectItem><SelectItem value="15m">Every 15 minutes</SelectItem><SelectItem value="1h">Every hour</SelectItem></SelectContent></Select></Field>
          </div>
        </Card>

        {/* Learning Logs */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-violet-300" /> Learning Logs</h3>
          <div className="space-y-2">
            {[
              { date: 'Today', type: 'daily', summary: 'Agent performance within normal parameters.', status: 'completed' },
              { date: 'Yesterday', type: 'daily', summary: 'Detected elevated error rate on video generation. Fallback triggered.', status: 'completed' },
            ].map((log, i) => (
              <div key={i} className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{log.date}</span>
                  <Badge variant="outline" className={`text-[10px] ${log.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}`}>{log.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{log.summary}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
