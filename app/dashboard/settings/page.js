'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import SystemHealthCard from '@/components/amarkt/SystemHealthCard'
import TestConnectionButton from '@/components/amarkt/TestConnectionButton'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Cpu, Clock, HardDrive, ShieldCheck, Save, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

function MaskedKeyInput({ label, value, onChange, placeholder, providerName }) {
  const [visible, setVisible] = useState(false)
  const hasValue = value && value.length > 0
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-black/20 font-mono pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {hasValue && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Set
            </span>
          )}
          <button type="button" onClick={() => setVisible(!visible)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
            title={visible ? 'Hide key' : 'Reveal key'}>
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </Field>
  )
}

export default function SettingsPage() {
  const [s, setS] = useState({
    genx_key: '', together_key: '', groq_key: '', mimo_key: '',
    default_text_model: 'llama-3.3-70b-versatile', default_image_model: 'flux-1-schnell',
    asset_retention_days: 30, local_storage_path: '/var/www/amarktai/storage',
    rate_limit_max: 100, rate_limit_window: 60,
  })
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const save = async () => {
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) })
      toast.success('Settings saved')
    } catch { toast.error('Save failed') }
  }

  const providerKeys = [
    { key: 'genx_key', label: 'GenX API Key', placeholder: 'gx_…', status: 'ready', providerName: 'GenX' },
    { key: 'together_key', label: 'Together AI Key', placeholder: 'tg_…', status: 'ready', providerName: 'Together AI' },
    { key: 'groq_key', label: 'Groq API Key', placeholder: 'gsk_…', status: 'ready', providerName: 'Groq' },
    { key: 'mimo_key', label: 'MiMo API Key', placeholder: 'mimo_…', status: 'experimental', providerName: 'MiMo' },
  ]

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Settings" subtitle="System configuration — API credentials, model defaults, and storage.">
        <Button onClick={save} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90">
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
      </PageHeader>

      {/* System Health */}
      <SystemHealthCard />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Credentials */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> API Credentials</h3>
          <div className="space-y-4">
            {providerKeys.map((pk) => (
              <div key={pk.key} className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <MaskedKeyInput
                      label={pk.label}
                      value={s[pk.key]}
                      onChange={(v) => set(pk.key, v)}
                      placeholder={pk.placeholder}
                      providerName={pk.providerName}
                    />
                  </div>
                  <TestConnectionButton providerName={pk.providerName} hasKey={s[pk.key]?.length > 0} />
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {pk.status === 'ready' ? (
                    <span className="flex items-center gap-1 text-emerald-400/70"><CheckCircle2 className="h-3 w-3" /> Connected</span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400/70"><AlertTriangle className="h-3 w-3" /> Experimental</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Default Models */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Cpu className="h-4 w-4 text-violet-300" /> Default Models</h3>
          <div className="space-y-4">
            <Field label="Default text model">
              <Select value={s.default_text_model} onValueChange={(v) => set('default_text_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</SelectItem>
                  <SelectItem value="meta-llama-3.1-70b">meta-llama-3.1-70b</SelectItem>
                  <SelectItem value="mixtral-8x7b-32768">mixtral-8x7b-32768</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Default image model">
              <Select value={s.default_image_model} onValueChange={(v) => set('default_image_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flux-1-schnell">FLUX.1 Schnell</SelectItem>
                  <SelectItem value="genx-image-xl">GenX Image XL</SelectItem>
                  <SelectItem value="stable-diffusion-xl">Stable Diffusion XL</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        {/* Rate Limiting */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Rate Limiting</h3>
          <div className="space-y-4">
            <Field label="Max requests per window">
              <Input type="number" value={s.rate_limit_max} onChange={(e) => set('rate_limit_max', Number(e.target.value))} className="bg-black/20" />
            </Field>
            <Field label="Window duration (seconds)">
              <Input type="number" value={s.rate_limit_window} onChange={(e) => set('rate_limit_window', Number(e.target.value))} className="bg-black/20" />
            </Field>
          </div>
        </Card>

        {/* Asset Retention */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-amber-300" /> Asset Retention</h3>
          <Field label="Retention period (days)"><Input type="number" value={s.asset_retention_days} onChange={(e) => set('asset_retention_days', Number(e.target.value))} className="bg-black/20" /></Field>
        </Card>

        {/* Storage */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><HardDrive className="h-4 w-4 text-cyan-300" /> Storage</h3>
          <Field label="Artifact storage path"><Input value={s.local_storage_path} onChange={(e) => set('local_storage_path', e.target.value)} className="bg-black/20 font-mono" /></Field>
        </Card>
      </div>
    </PageTransition>
  )
}
