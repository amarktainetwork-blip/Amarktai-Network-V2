'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Cpu, Clock, HardDrive, ShieldCheck, Save } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [s, setS] = useState({
    genx_key: '', together_key: '', groq_key: '', mimo_key: '',
    default_text_model: 'llama-3.3-70b-versatile', default_image_model: 'flux-1-schnell',
    asset_retention_days: 30, local_storage_path: '/var/www/amarktai/storage',
  })
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const save = async () => {
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) })
      toast.success('Settings saved')
    } catch { toast.error('Save failed') }
  }

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Settings" subtitle="System configuration — API credentials, model defaults, and storage.">
        <Button onClick={save} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> API Credentials</h3>
          <div className="space-y-4">
            <Field label="GenX API Key"><Input type="password" value={s.genx_key} onChange={(e) => set('genx_key', e.target.value)} placeholder="gx_…" className="bg-black/20 font-mono" /></Field>
            <Field label="Together AI Key"><Input type="password" value={s.together_key} onChange={(e) => set('together_key', e.target.value)} placeholder="tg_…" className="bg-black/20 font-mono" /></Field>
            <Field label="Groq API Key"><Input type="password" value={s.groq_key} onChange={(e) => set('groq_key', e.target.value)} placeholder="gsk_…" className="bg-black/20 font-mono" /></Field>
            <Field label="MiMo API Key"><Input type="password" value={s.mimo_key} onChange={(e) => set('mimo_key', e.target.value)} placeholder="mimo_…" className="bg-black/20 font-mono" /></Field>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Cpu className="h-4 w-4 text-violet-300" /> Default Models</h3>
          <div className="space-y-4">
            <Field label="Default text model">
              <Select value={s.default_text_model} onValueChange={(v) => set('default_text_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</SelectItem>
                  <SelectItem value="meta-llama-3.1-70b">meta-llama-3.1-70b</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Default image model">
              <Select value={s.default_image_model} onValueChange={(v) => set('default_image_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flux-1-schnell">flux-1-schnell</SelectItem>
                  <SelectItem value="genx-image-xl">genx-image-xl</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-amber-300" /> Asset Retention</h3>
          <Field label="Retention period (days)"><Input type="number" value={s.asset_retention_days} onChange={(e) => set('asset_retention_days', Number(e.target.value))} className="bg-black/20" /></Field>
        </Card>

        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><HardDrive className="h-4 w-4 text-cyan-300" /> Storage</h3>
          <Field label="Artifact storage path"><Input value={s.local_storage_path} onChange={(e) => set('local_storage_path', e.target.value)} className="bg-black/20 font-mono" /></Field>
        </Card>
      </div>
    </PageTransition>
  )
}
