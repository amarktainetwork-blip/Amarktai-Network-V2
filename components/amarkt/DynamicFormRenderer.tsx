// @ts-nocheck
'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, DropZone } from '@/components/amarkt/kit'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Settings } from 'lucide-react'

// ─── Schema Types ──────────────────────────────────────────────
export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'multiselect' | 'file'
  label: string
  placeholder?: string
  hint?: string
  multiline?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: string[] | { value: string; label: string }[]
  accept?: string
  kind?: string
  advanced?: boolean
  visibleWhen?: { field: string; value: unknown }
}

export type FormSchema = Record<string, FieldSchema>

// ─── Field Renderers ───────────────────────────────────────────
function EnumField({ schema, value, onChange }: { schema: FieldSchema; value: string; onChange: (v: string) => void }) {
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

function MultiSelectField({ schema, value, onChange }: { schema: FieldSchema; value: string[]; onChange: (v: string[]) => void }) {
  const selected = value || []
  const toggle = (item: string) => {
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

function NumberField({ schema, value, onChange }: { schema: FieldSchema; value: number; onChange: (v: number) => void }) {
  const val = value ?? schema.min ?? 0
  if (schema.min !== undefined && schema.max !== undefined) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{schema.unit ? `${val} ${schema.unit}` : val}</span>
          <span>{schema.min}–{schema.max}</span>
        </div>
        <Slider value={[val]} onValueChange={([v]) => onChange(v)} min={schema.min} max={schema.max} step={schema.step || 1} />
      </div>
    )
  }
  return <Input type="number" value={val} onChange={(e) => onChange(Number(e.target.value))} className="bg-black/20" />
}

// ─── Main Renderer ─────────────────────────────────────────────
interface DynamicFormRendererProps {
  schema: FormSchema
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

export default function DynamicFormRenderer({ schema, values, onChange }: DynamicFormRendererProps) {
  const set = (key: string, val: unknown) => onChange({ ...values, [key]: val })

  const isVisible = (def: FieldSchema): boolean => {
    if (!def.visibleWhen) return true
    return values[def.visibleWhen.field] === def.visibleWhen.value
  }

  const mainFields = Object.entries(schema).filter(([, def]) => !def.advanced && isVisible(def))
  const advancedFields = Object.entries(schema).filter(([, def]) => def.advanced && isVisible(def))

  const renderField = (key: string, def: FieldSchema) => {
    const value = values[key]

    if (def.type === 'boolean') {
      return (
        <div key={key} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <span className="text-sm">{def.label}</span>
          <Switch checked={!!value} onCheckedChange={(v) => set(key, v)} />
        </div>
      )
    }

    let control: React.ReactNode
    switch (def.type) {
      case 'string':
        control = def.multiline
          ? <Textarea value={(value as string) || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="min-h-[80px] bg-black/20" />
          : <Input value={(value as string) || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="bg-black/20" />
        break
      case 'number':
        control = <NumberField schema={def} value={value as number} onChange={(v) => set(key, v)} />
        break
      case 'enum':
        control = <EnumField schema={def} value={value as string} onChange={(v) => set(key, v)} />
        break
      case 'multiselect':
        control = <MultiSelectField schema={def} value={value as string[]} onChange={(v) => set(key, v)} />
        break
      case 'file':
        control = <DropZone accept={def.accept || '*'} label={def.placeholder || `Drop ${def.kind || 'file'}`} kind={def.kind || 'file'} compact />
        break
      default:
        control = <Input value={(value as string) || ''} onChange={(e) => set(key, e.target.value)} className="bg-black/20" />
    }

    return (
      <Field key={key} label={def.label} hint={def.hint}>
        {control}
      </Field>
    )
  }

  return (
    <div className="space-y-4">
      {mainFields.map(([key, def]) => renderField(key, def))}
      {advancedFields.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-white/[0.06]">
            <AccordionTrigger className="text-xs text-muted-foreground py-2">
              <span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Advanced Settings</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {advancedFields.map(([key, def]) => renderField(key, def))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
