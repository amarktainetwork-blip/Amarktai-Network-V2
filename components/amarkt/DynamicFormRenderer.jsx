'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Field, DropZone } from '@/components/amarkt/kit'
import { Settings } from 'lucide-react'
import { CREATOR_PRESETS } from '@/lib/studio-capability-schemas'

// ─── Creator Mode Visual Presets ───────────────────────────────
function PresetChips({ presets, value, onChange, multiple = false }) {
  const selected = multiple ? (value || []) : value
  const toggle = (val) => {
    if (multiple) {
      const arr = selected || []
      onChange(arr.includes(val) ? arr.filter((s) => s !== val) : [...arr, val])
    } else {
      onChange(selected === val ? '' : val)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const val = typeof preset === 'string' ? preset : preset.value
        const lbl = typeof preset === 'string' ? preset : preset.label
        const emoji = typeof preset === 'object' ? preset.emoji : null
        const active = multiple ? (selected || []).includes(val) : selected === val
        return (
          <button key={val} onClick={() => toggle(val)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${active ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.1)]' : 'border-white/10 bg-black/20 text-muted-foreground hover:text-foreground hover:border-white/20'}`}>
            {emoji && <span className="mr-1">{emoji}</span>}{lbl}
          </button>
        )
      })}
    </div>
  )
}

// ─── Standard Field Renderers ──────────────────────────────────
function EnumField({ schema, value, onChange, mode, capability }) {
  if (mode === 'creator' && schema.creatorPresets) {
    const presets = CREATOR_PRESETS?.[capability]?.[schema.key]
    if (presets) return <PresetChips presets={presets} value={value} onChange={onChange} />
  }
  return (
    <Select value={value || ''} onValueChange={onChange}>
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

function MultiSelectField({ schema, value, onChange, mode, capability }) {
  if (mode === 'creator' && schema.creatorPresets) {
    const presets = CREATOR_PRESETS?.[capability]?.[schema.key]
    if (presets) return <PresetChips presets={presets} value={value} onChange={onChange} multiple />
  }
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
          <span>{schema.min}–{schema.max}</span>
        </div>
        <Slider value={[val]} onValueChange={([v]) => onChange(v)} min={schema.min} max={schema.max} step={schema.step || 1} />
      </div>
    )
  }
  return <Input type="number" value={val} onChange={(e) => onChange(Number(e.target.value))} className="bg-black/20" />
}

// ─── Single Field Renderer ─────────────────────────────────────
function renderField(key, def, values, set, mode, capability) {
  const value = values[key]
  const fieldDef = { ...def, key }

  if (def.type === 'boolean') {
    if (mode === 'creator' && def.advanced) return null
    return (
      <div key={key} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
        <span className="text-sm">{def.label}</span>
        <Switch checked={!!value} onCheckedChange={(v) => set(key, v)} />
      </div>
    )
  }

  let control
  switch (def.type) {
    case 'string':
      if (def.format === 'textarea') {
        control = <Textarea value={value || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="min-h-[80px] bg-black/20" />
      } else if (def.format === 'file') {
        control = <DropZone accept={def.accept || '*'} label={def.placeholder || `Drop ${def.kind || 'file'}`} kind={def.kind || 'file'} compact />
      } else {
        control = <Input value={value || ''} onChange={(e) => set(key, e.target.value)} placeholder={def.placeholder || ''} className="bg-black/20" />
      }
      break
    case 'number':
      if (mode === 'creator' && def.advanced) return null
      control = <NumberField schema={fieldDef} value={value} onChange={(v) => set(key, v)} />
      break
    case 'enum':
      control = <EnumField schema={fieldDef} value={value} onChange={(v) => set(key, v)} mode={mode} capability={capability} />
      break
    case 'multiselect':
      control = <MultiSelectField schema={fieldDef} value={value} onChange={(v) => set(key, v)} mode={mode} capability={capability} />
      break
    case 'file':
      control = <DropZone accept={def.accept || '*'} label={def.placeholder || `Drop ${def.kind || 'file'}`} kind={def.kind || 'file'} compact />
      break
    default:
      control = <Input value={value || ''} onChange={(e) => set(key, e.target.value)} className="bg-black/20" />
  }

  return (
    <Field key={key} label={def.label} hint={def.hint}>
      {control}
    </Field>
  )
}

// ─── Group fields by `group` metadata ──────────────────────────
function groupFields(entries) {
  const groups = {}
  entries.forEach(([key, def]) => {
    const g = def.group || 'General'
    if (!groups[g]) groups[g] = []
    groups[g].push([key, def])
  })
  return groups
}

const IMPLEMENTATION_DETAIL_GROUPS = ['Provider', 'Gate']

// ─── Card wrapper for a group ──────────────────────────────────
function GroupCard({ title, children }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}

// ─── Main Renderer ─────────────────────────────────────────────
export default function DynamicFormRenderer({ schema, values, onChange, mode = 'pro', capability = '' }) {
  const set = (key, val) => onChange({ ...values, [key]: val })

  const isVisible = (def) => {
    if (!def.visibleWhen) return true
    return values[def.visibleWhen.field] === def.visibleWhen.value
  }

  const allEntries = Object.entries(schema).filter(([, def]) => isVisible(def))
  const mainEntries = allEntries.filter(([, def]) => !def.advanced && !IMPLEMENTATION_DETAIL_GROUPS.includes(def.group))
  const advancedEntries = allEntries.filter(([, def]) => def.advanced || IMPLEMENTATION_DETAIL_GROUPS.includes(def.group))

  const mainGroups = groupFields(mainEntries)
  const advancedGroups = groupFields(advancedEntries)

  return (
    <div className="space-y-4">
      {Object.entries(mainGroups).map(([group, fields]) => (
        <GroupCard key={group} title={group} mode={mode}>
          {fields.map(([key, def]) => renderField(key, def, values, set, mode, capability))}
        </GroupCard>
      ))}
      {advancedEntries.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="rounded-xl border border-white/[0.06] px-4">
            <AccordionTrigger className="text-xs py-3">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Settings className="h-3 w-3" /> Advanced details</span>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="space-y-4">
                {Object.entries(advancedGroups).map(([group, fields]) => (
                  <GroupCard key={group} title={group} mode={mode}>
                    {fields.map(([key, def]) => renderField(key, def, values, set, mode, capability))}
                  </GroupCard>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
