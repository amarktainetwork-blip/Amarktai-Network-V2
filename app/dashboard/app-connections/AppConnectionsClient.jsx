'use client'
import { useState } from 'react'
import { fetchJSON } from '@/lib/fetchJSON'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plug, KeyRound, Copy, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AppConnectionsClient({ initialConnections }) {
  const [conns, setConns] = useState(initialConnections || [])
  const [name, setName] = useState('')
  const [env, setEnv] = useState('development')
  const [budget, setBudget] = useState('100')
  const [payload, setPayload] = useState('{\n  "type": "image.generate",\n  "payload": { "prompt": "neon skyline" }\n}')
  const [simResult, setSimResult] = useState(null)

  const load = () => fetchJSON('/api/connections').then((d) => setConns(d.connections || [])).catch(() => {})

  const create = async () => {
    if (!name) return toast.error('Name required')
    try { await fetchJSON('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, environment: env, dailyBudget: Number(budget) }) }); toast.success('App connection created'); setName(''); load() }
    catch (e) { toast.error('Failed') }
  }
  const genKey = async (id) => {
    try { await fetchJSON(`/api/connections/${id}/keys`, { method: 'POST' }); toast.success('API key generated'); load() }
    catch (e) { toast.error('Failed') }
  }
  const del = async (id) => { try { await fetch(`/api/connections/${id}`, { method: 'DELETE' }) } catch (_) {} load() }
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('Copied') }
  const simulate = async () => {
    let body; try { body = JSON.parse(payload) } catch { return toast.error('Invalid JSON') }
    try { const r = await fetchJSON('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setSimResult(r); toast.success('Payload simulated') }
    catch (e) { toast.error('Simulation failed') }
  }

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="App Connections" subtitle="Manage keys, budgets and payload simulation for connected apps." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-white/[0.07] bg-white/[0.02] p-6 lg:col-span-1">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Plug className="h-4 w-4 text-cyan-300" /> New Connection</h3>
          <div className="space-y-4">
            <Field label="App name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing App" className="bg-black/20" /></Field>
            <Field label="Environment"><Select value={env} onValueChange={setEnv}><SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="development">Development</SelectItem><SelectItem value="staging">Staging</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent></Select></Field>
            <Field label="Daily budget ($)"><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className="bg-black/20" /></Field>
            <Button onClick={create} className="w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">Create connection</Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {conns.length === 0 && <Card className="border-white/[0.07] bg-white/[0.02] p-6 text-sm text-muted-foreground">No connections yet.</Card>}
          {conns.map((c) => (
            <Card key={c.id} className="border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <div><div className="font-semibold">{c.name}</div><div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="border-white/10">{c.environment}</Badge> Budget ${c.dailyBudget}/day</div></div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => genKey(c.id)}><KeyRound className="mr-1 h-3.5 w-3.5" /> Generate key</Button>
                  <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {c.keys?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {c.keys.map((k) => (
                    <div key={k.id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/30 px-3 py-2">
                      <KeyRound className="h-3.5 w-3.5 text-cyan-300" />
                      <code className="flex-1 truncate font-mono text-xs text-foreground/80">{k.token}</code>
                      <button onClick={() => copy(k.token)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <Card className="border-white/[0.07] bg-white/[0.02] p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Play className="h-4 w-4 text-violet-300" /> Execution Payload Simulator</h3>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Dummy JSON payload"><Textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="min-h-[180px] bg-black/40 font-mono text-xs" /></Field>
            <Button onClick={simulate} className="bg-white text-black hover:bg-white/90">Send to system endpoint</Button>
          </div>
          <div><Field label="Response"><pre className="min-h-[180px] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-cyan-200 hide-scrollbar">{simResult ? JSON.stringify(simResult, null, 2) : 'Response will appear here…'}</pre></Field></div>
        </div>
      </Card>
    </PageTransition>
  )
}
