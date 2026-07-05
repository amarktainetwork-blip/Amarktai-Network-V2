'use client'
import { useState } from 'react'
import { PageTransition, PageHeader, Field } from '@/components/amarkt/kit'
import SystemHealthCard from '@/components/amarkt/SystemHealthCard'
import TestConnectionButton from '@/components/amarkt/TestConnectionButton'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  KeyRound, Cpu, Clock, HardDrive, ShieldCheck, Save, Eye, EyeOff, CheckCircle2, AlertTriangle,
  Server, Database, Globe, Webhook, Users, Terminal, Settings as SettingsIcon, Lock
} from 'lucide-react'
import { toast } from 'sonner'

function MaskedKeyInput({ label, value, onChange, placeholder, providerName }) {
  const [visible, setVisible] = useState(false)
  const hasValue = value && value.length > 0
  return (
    <Field label={label}>
      <div className="relative">
        <Input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-black/20 font-mono pr-20" />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {hasValue && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Set</span>}
          <button type="button" onClick={() => setVisible(!visible)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition" title={visible ? 'Hide key' : 'Reveal key'}>
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </Field>
  )
}

export default function SettingsPage() {
  const [s, setS] = useState({
    genx_key: '', together_key: '', groq_key: '', deepinfra_key: '', mimo_key: '',
    default_text_model: 'llama-3.3-70b-versatile', default_image_model: 'flux-1-schnell',
    asset_retention_days: 30, local_storage_path: '/var/www/amarktai/storage',
    rate_limit_max: 100, rate_limit_window: 60,
    cors_origins: '*', worker_concurrency: 5,
    minio_endpoint: '', minio_access_key: '', minio_secret_key: '',
    webhook_url: '', webhook_secret: '',
    piper_tts: true, redis: true, qdrant: true, playwright_crawler: true, minio_storage: true, smtp: true, bullmq: true, ffmpeg: true, sharp: true,
  })
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const save = async () => {
    try {
      window.localStorage.setItem('amarktai.dashboard.settings', JSON.stringify(s))
      toast.success('Settings saved locally', { description: 'Production persistence should use a Fastify /api/v1/* settings route.' })
    } catch {
      toast.error('Save failed')
    }
  }

  const providerKeys = [
    { key: 'genx_key', label: 'GenX API Key', placeholder: 'gx_…', status: 'ready', providerName: 'GenX' },
    { key: 'together_key', label: 'Together AI Key', placeholder: 'tg_…', status: 'ready', providerName: 'Together AI' },
    { key: 'groq_key', label: 'Groq API Key', placeholder: 'gsk_…', status: 'ready', providerName: 'Groq' },
    { key: 'deepinfra_key', label: 'DeepInfra API Key', placeholder: 'di_…', status: 'ready', providerName: 'DeepInfra' },
    { key: 'mimo_key', label: 'MiMo API Key', placeholder: 'mimo_…', status: 'ready', providerName: 'MiMo' },
  ]

  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Settings" subtitle="System configuration — API credentials, models, storage, and security.">
        <Button onClick={save} className="bg-gradient-to-r from-cyan-400 to-violet-500 text-black hover:opacity-90"><Save className="mr-1.5 h-4 w-4" /> Save</Button>
      </PageHeader>

      <SystemHealthCard />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Provider Keys */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Provider API Keys</h3>
          <div className="space-y-4">
            {providerKeys.map((pk) => (
              <div key={pk.key} className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1"><MaskedKeyInput label={pk.label} value={s[pk.key]} onChange={(v) => set(pk.key, v)} placeholder={pk.placeholder} providerName={pk.providerName} /></div>
                  <TestConnectionButton providerName={pk.providerName} hasKey={s[pk.key]?.length > 0} />
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
              {pk.status === 'ready' ? <span className="flex items-center gap-1 text-cyan-400/70"><CheckCircle2 className="h-3 w-3" /> Contract ready, backend pending</span> : <span className="flex items-center gap-1 text-amber-400/70"><AlertTriangle className="h-3 w-3" /> Needs review</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Model Defaults */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Cpu className="h-4 w-4 text-violet-300" /> Model Defaults</h3>
          <div className="space-y-4">
            <Field label="Default text model">
              <Select value={s.default_text_model} onValueChange={(v) => set('default_text_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</SelectItem><SelectItem value="meta-llama-3.1-70b">meta-llama-3.1-70b</SelectItem><SelectItem value="mixtral-8x7b-32768">mixtral-8x7b-32768</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Default image model">
              <Select value={s.default_image_model} onValueChange={(v) => set('default_image_model', v)}>
                <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="flux-1-schnell">FLUX.1 Schnell</SelectItem><SelectItem value="genx-image-xl">GenX Image XL</SelectItem><SelectItem value="stable-diffusion-xl">Stable Diffusion XL</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        {/* Open-Source Tools */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Terminal className="h-4 w-4 text-emerald-300" /> Open-Source Tools</h3>
          <div className="space-y-3">
            {[
              { key: 'ffmpeg', label: 'FFmpeg', desc: 'Media processing toolkit' },
              { key: 'sharp', label: 'Sharp', desc: 'Image processing library' },
              { key: 'piper_tts', label: 'Piper', desc: 'Local text-to-speech engine' },
              { key: 'redis', label: 'Redis', desc: 'Queue and cache service' },
              { key: 'qdrant', label: 'Qdrant', desc: 'Vector search service' },
              { key: 'playwright_crawler', label: 'Playwright/local crawler', desc: 'Local browser crawler' },
              { key: 'minio_storage', label: 'MinIO/local storage', desc: 'Object and local artifact storage' },
              { key: 'smtp', label: 'SMTP', desc: 'Email delivery service' },
              { key: 'bullmq', label: 'BullMQ', desc: 'Job queue orchestration' },
            ].map((tool) => (
              <div key={tool.key} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                <div><span className="text-sm">{tool.label}</span><p className="text-[10px] text-muted-foreground">{tool.desc}</p></div>
                <Switch checked={s[tool.key]} onCheckedChange={(v) => set(tool.key, v)} />
              </div>
            ))}
          </div>
        </Card>

        {/* Storage */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><HardDrive className="h-4 w-4 text-cyan-300" /> Storage Configuration</h3>
          <div className="space-y-4">
            <Field label="Local storage path"><Input value={s.local_storage_path} onChange={(e) => set('local_storage_path', e.target.value)} className="bg-black/20 font-mono" /></Field>
            <Accordion type="single" collapsible><AccordionItem value="s3" className="border-white/[0.06]"><AccordionTrigger className="text-xs text-muted-foreground py-2"><span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> MinIO / S3 Configuration</span></AccordionTrigger><AccordionContent className="space-y-3 pt-2">
              <Field label="Endpoint"><Input value={s.minio_endpoint} onChange={(e) => set('minio_endpoint', e.target.value)} placeholder="https://minio.example.com" className="bg-black/20 font-mono" /></Field>
              <Field label="Access Key"><Input value={s.minio_access_key} onChange={(e) => set('minio_access_key', e.target.value)} className="bg-black/20 font-mono" /></Field>
              <Field label="Secret Key"><Input type="password" value={s.minio_secret_key} onChange={(e) => set('minio_secret_key', e.target.value)} className="bg-black/20 font-mono" /></Field>
            </AccordionContent></AccordionItem></Accordion>
          </div>
        </Card>

        {/* Worker Settings */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Server className="h-4 w-4 text-amber-300" /> Worker Settings</h3>
          <div className="space-y-4">
            <Field label="Concurrency"><Input type="number" value={s.worker_concurrency} onChange={(e) => set('worker_concurrency', Number(e.target.value))} className="bg-black/20" /></Field>
            <Field label="Rate Limit Max"><Input type="number" value={s.rate_limit_max} onChange={(e) => set('rate_limit_max', Number(e.target.value))} className="bg-black/20" /></Field>
            <Field label="Rate Limit Window (seconds)"><Input type="number" value={s.rate_limit_window} onChange={(e) => set('rate_limit_window', Number(e.target.value))} className="bg-black/20" /></Field>
          </div>
        </Card>

        {/* Webhooks */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Webhook className="h-4 w-4 text-violet-300" /> Webhooks</h3>
          <div className="space-y-4">
            <Field label="Global Webhook URL"><Input value={s.webhook_url} onChange={(e) => set('webhook_url', e.target.value)} placeholder="https://your-app.com/webhook" className="bg-black/20" /></Field>
            <Field label="Webhook Secret"><Input type="password" value={s.webhook_secret} onChange={(e) => set('webhook_secret', e.target.value)} className="bg-black/20 font-mono" /></Field>
          </div>
        </Card>

        {/* Security */}
        <Card className="border-white/[0.07] bg-white/[0.02] p-6 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Lock className="h-4 w-4 text-rose-300" /> Security Settings</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CORS Origins"><Input value={s.cors_origins} onChange={(e) => set('cors_origins', e.target.value)} placeholder="*" className="bg-black/20" /></Field>
            <Field label="Asset Retention (days)"><Input type="number" value={s.asset_retention_days} onChange={(e) => set('asset_retention_days', Number(e.target.value))} className="bg-black/20" /></Field>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
