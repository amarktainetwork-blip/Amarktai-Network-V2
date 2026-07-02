'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Field, DropZone } from '@/components/amarkt/kit'
import { Upload, X } from 'lucide-react'

/**
 * DynamicFormRenderer — renders shadcn/ui controls from a JSON Schema.
 *
 * Schema format:
 * {
 *   prompt: { type: 'string', label: 'Prompt', placeholder: '...', multiline: true },
 *   temperature: { type: 'number', label: 'Temperature', min: 0, max: 2, step: 0.05 },
 *   reasoning: { type: 'boolean', label: 'Reasoning mode' },
 *   quality: { type: 'enum', label: 'Quality', options: ['draft','standard','ultra'] },
 *   tags: { type: 'multiselect', label: 'Tags', options: ['rock','pop','jazz'] },
 *   reference: { type: 'file', label: 'Reference', accept: 'image' },
 * }
 */

function EnumField({ schema, value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-black/20"><SelectValue placeholder={schema.placeholder || 'Select…'} /></SelectTrigger>
      <SelectContent>
        {(schema.options || []).map((opt) => {
          const val = typeof opt === 'string' ? opt : opt.value
          const lbl = typeof opt === 'string' ? opt : opt.label
          return <SelectItem key={val} value={val}>{lbl}</SelectItem>
        })}
      </SelectContent>
    </Select>
  )
}

function MultiSelectField({ schema, value, onChange }) {
  const selected = value || []
  const toggle = (item) => {
    const next = selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]
    onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(schema.options || []).map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const lbl = typeof opt === 'string' ? opt : opt.label
        const active = selected.includes(val)
        return (
          <button key={val} onClick={() => toggle(val)}
            className={`rounded-md border px-3 py-2 text-xs transition ${active ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground hover:text-foreground'}`}>
            {lbl}
          </button>
        )
      })}
    </div>
  )
}

function NumberField({ schema, value, onChange }) {
  const val = value ?? schema.min ?? 0
  if (schema.min !== undefined && schema.max !== undefined) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{schema.unit ? `${val} ${schema.unit}` : val}</span>
          {schema.showRange && <span>{schema.min}–{schema.max}</span>}
        </div>
        <Slider value={[val]} onValueChange={([v]) => onChange(v)} min={schema.min} max={schema.max} step={schema.step || 1} />
      </div>
    )
  }
  return <Input type="number" value={val} onChange={(e) => onChange(Number(e.target.value))} className="bg-black/20" />
}

function BooleanField({ schema, value, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <span className="text-sm">{schema.label}</span>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  )
}

function FileField({ schema }) {
  return <DropZone label={schema.dropLabel || `Drop ${schema.accept || 'files'}`} kind={schema.accept || 'asset'} />
}

function MultiSelectMatrix({ schema, value, onChange }) {
  const weights = value || {}
  const options = schema.options || []
  const maxWeight = schema.maxWeight || 3
  const toggle = (item) => {
    const next = { ...weights, [item]: ((weights[item] || 0) + 1) % (maxWeight + 1) }
    onChange(next)
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const lbl = typeof opt === 'string' ? opt : opt.label
        const w = weights[val] || 0
        return (
          <button key={val} onClick={() => toggle(val)}
            className={`rounded-md border px-2 py-2.5 text-xs transition ${w > 0 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>
            {lbl}{w > 0 && <span className="ml-1 font-mono">{'★'.repeat(w)}</span>}
          </button>
        )
      })}
    </div>
  )
}

function CheckboxGrid({ schema, value, onChange }) {
  const selected = value || []
  const toggle = (item) => {
    const next = selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]
    onChange(next)
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {(schema.options || []).map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const lbl = typeof opt === 'string' ? opt : opt.label
        const active = selected.includes(val)
        return (
          <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${active ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/20 text-muted-foreground'}`}>
            <input type="checkbox" checked={active} onChange={() => toggle(val)} className="sr-only" />
            <div className={`h-3.5 w-3.5 rounded border ${active ? 'border-cyan-400 bg-cyan-400' : 'border-white/20 bg-transparent'} flex items-center justify-center`}>
              {active && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
            </div>
            {lbl}
          </label>
        )
      })}
    </div>
  )
}

export default function DynamicFormRenderer({ schema, values, onChange }) {
  const set = (key, val) => onChange({ ...values, [key]: val })

  return (
    <div className="space-y-5">
      {Object.entries(schema).map(([key, def]) => {
        const value = values[key]

        // Boolean renders its own container (no Field wrapper)
        if (def.type === 'boolean') {
          return <BooleanField key={key} schema={def} value={value} onChange={(v) => set(key, v)} />
        }

        let control
        switch (def.type) {
          case 'string':
            control = def.multiline
              ? <Textarea value={value || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="min-h-[100px] bg-black/20" />
              : <Input value={value || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="bg-black/20" />
            break
          case 'number':
            control = <NumberField schema={def} value={value} onChange={(v) => set(key, v)} />
            break
          case 'enum':
            control = <EnumField schema={def} value={value} onChange={(v) => set(key, v)} />
            break
          case 'multiselect':
            control = <MultiSelectField schema={def} value={value} onChange={(v) => set(key, v)} />
            break
          case 'matrix':
            control = <MultiSelectMatrix schema={def} value={value} onChange={(v) => set(key, v)} />
            break
          case 'checkboxgrid':
            control = <CheckboxGrid schema={def} value={value} onChange={(v) => set(key, v)} />
            break
          case 'file':
            control = <FileField schema={def} />
            break
          default:
            control = <Input value={value || ''} onChange={(e) => set(key, e.target.value)} className="bg-black/20" />
        }

        return (
          <Field key={key} label={def.label || key} hint={def.hint}>
            {control}
          </Field>
        )
      })}
    </div>
  )
}
