'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useStudioStore } from '@/lib/useStudioStore'
import { adminFetch } from '@/lib/admin-session'
import { Download, FlaskConical } from 'lucide-react'

export default function CapabilityLabPage() {
  const [capabilities, setCapabilities] = useState([])
  const [capability, setCapability] = useState('reasoning')
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [items, setItems] = useState('positive\nnegative\nneutral')
  const [schema, setSchema] = useState('{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    adminFetch('/api/admin/truth').then((response) => response.json()).then((data) => {
      const list = (data.truth?.releaseReadiness || []).filter((item) => item.appSlug === 'dashboard-capability-lab' && item.releaseCandidate)
      setCapabilities(list)
      if (list.length && !list.some((item) => item.capability === capability)) setCapability(list[0].capability)
    }).catch(() => setCapabilities([]))
  }, [])

  const selected = capabilities.find((item) => item.capability === capability)
  const input = useMemo(() => buildInput(capability, prompt, context, items, schema), [capability, prompt, context, items, schema])

  const run = async () => {
    setRunning(true); setResult(null)
    try {
      const submitted = await useStudioStore.getState().submitJob(capability, { ...input, prompt })
      if (!submitted.ok) throw new Error(submitted.error)
      let job
      for (let attempt = 0; attempt < 120; attempt++) {
        job = await useStudioStore.getState().pollJob(submitted.jobId); setResult(job)
        if (['completed', 'failed', 'cancelled'].includes(job?.status)) break
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    } catch (error) { setResult({ status: 'failed', error: error.message }) }
    finally { setRunning(false) }
  }

  let output = result?.output
  try { output = JSON.parse(result?.output) } catch {}
  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${capability}-${result?.id || 'result'}.json`; link.click(); URL.revokeObjectURL(url)
  }

  return <PageTransition className="space-y-6">
    <PageHeader title="Capability Lab" subtitle="Execute the current text, structured, embedding, and reranking release candidates. Orchestra owns routing." />
    <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center gap-3"><FlaskConical className="h-4 w-4 text-cyan-300" /><select value={capability} onChange={(event) => setCapability(event.target.value)} className="min-w-64 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm">{capabilities.map((item) => <option key={item.capability} value={item.capability}>{item.capability}</option>)}</select>{selected && <Badge variant="outline" className={selected.readyForDashboardExecution ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}>{selected.readyForDashboardExecution ? 'Executable' : selected.blockedReasons.join(', ')}</Badge>}</div>
      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={capability === 'fill_mask' ? 'The capital of France is [MASK].' : 'Primary task, question, query, or source text'} className="min-h-28" />
      {needsContext(capability) && <Textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder={capability === 'table_qa' ? 'JSON table, e.g. {"City":["Cape Town"],"Population":[4600000]}' : 'Context, comparison text, existing code, or source material'} className="min-h-24" />}
      {needsItems(capability) && <Textarea value={items} onChange={(event) => setItems(event.target.value)} placeholder="One label, text, or document per line" className="min-h-24" />}
      {needsSchema(capability) && <Textarea value={schema} onChange={(event) => setSchema(event.target.value)} placeholder="JSON Schema" className="min-h-28 font-mono text-xs" />}
      <Button onClick={run} disabled={!prompt.trim() || running || !selected?.readyForDashboardExecution}>{running ? 'Running...' : 'Execute capability'}</Button>
    </Card>
    {result && <Card className="border-white/[0.07] bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div className="flex flex-wrap gap-2"><Badge variant="outline">{result.status}</Badge>{result.status === 'completed' && <><Badge variant="outline">{result.provider}</Badge><Badge variant="outline">{result.model}</Badge></>}</div>{result.status === 'completed' && typeof output === 'object' && <Button size="sm" variant="outline" onClick={downloadJson}><Download className="mr-2 h-3.5 w-3.5" />JSON</Button>}</div>{result.error && <p className="mt-3 text-sm text-rose-300">{result.error}</p>}{result.status === 'completed' && <Output capability={capability} output={output} />}</Card>}
  </PageTransition>
}

function lines(value) { return value.split('\n').map((item) => item.trim()).filter(Boolean) }
function json(value, fallback) { try { return JSON.parse(value) } catch { return fallback } }
function buildInput(capability, prompt, context, items, schemaText) {
  const values = lines(items); const schema = json(schemaText, {})
  if (capability === 'code') return { task: prompt, language: values[0] || 'TypeScript', existingCode: context || undefined, outputFormat: 'code' }
  if (capability === 'summarization') return { sourceText: prompt, desiredLength: 'medium', format: 'bullets', includeKeyPoints: true }
  if (capability === 'translation') return { sourceText: prompt, targetLanguage: values[0] || 'English', preserveTone: true }
  if (capability === 'question_answering') return { question: prompt, context: context || prompt }
  if (capability === 'classification' || capability === 'zero_shot_classification') return { text: prompt, labels: values, multiLabel: false }
  if (capability === 'extraction') return { sourceText: prompt, schema }
  if (capability === 'token_classification') return { text: prompt }
  if (capability === 'fill_mask') return { text: prompt, topK: 5 }
  if (capability === 'feature_extraction') return { text: values.length > 1 ? values : prompt, normalize: true }
  if (capability === 'sentence_similarity') return { sourceSentence: prompt, comparisonSentences: values }
  if (capability === 'table_qa') return { question: prompt, table: json(context, {}) }
  if (capability === 'structured_output') return { context: prompt, schema }
  if (capability === 'tool_use') return { allowedTools: ['calculator', 'platform_health'], maxIterations: 3 }
  if (capability === 'embeddings') return { texts: [prompt, ...values].filter((item, index, all) => all.indexOf(item) === index), normalize: true }
  if (capability === 'reranking') return { query: prompt, documents: values, topN: Math.min(5, values.length) }
  return { context: context || undefined, effort: 'medium' }
}
function needsContext(capability) { return ['reasoning', 'code', 'question_answering', 'table_qa'].includes(capability) }
function needsItems(capability) { return ['code', 'translation', 'classification', 'zero_shot_classification', 'feature_extraction', 'sentence_similarity', 'embeddings', 'reranking'].includes(capability) }
function needsSchema(capability) { return ['extraction', 'structured_output'].includes(capability) }

function Output({ capability, output }) {
  if (typeof output === 'string') return <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-4 text-sm">{output}</pre>
  if (['embeddings', 'feature_extraction', 'sentence_similarity'].includes(capability)) {
    const vectors = output?.vectors || output?.embeddings || output?.vector || output
    return <div className="mt-4 space-y-2 text-sm"><div>Vector count: {Array.isArray(vectors) ? vectors.length : 1} · Dimensions: {output?.dimensions || (Array.isArray(vectors?.[0]) ? vectors[0].length : 'reported by model')}</div><pre className="max-h-64 overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(vectors, null, 2).slice(0, 5000)}</pre></div>
  }
  if (capability === 'reranking') return <div className="mt-4 space-y-2">{(output?.results || []).map((item, index) => <div key={index} className="rounded border border-white/10 p-3 text-sm">#{index + 1} · original {item.index ?? item.originalIndex} · score {item.score}<div className="text-xs text-muted-foreground">{item.document?.text || item.document}</div></div>)}</div>
  if (capability.includes('classification')) return <div className="mt-4 space-y-2">{(output?.labels || output?.results || []).map((item, index) => <div key={index} className="flex justify-between rounded border border-white/10 p-2 text-sm"><span>{item.label || item}</span><span>{item.score ?? output?.scores?.[index]}</span></div>)}</div>
  if (capability === 'token_classification') return <div className="mt-4 space-y-2">{(output?.entities || output?.spans || []).map((item, index) => <div key={index} className="rounded border border-white/10 p-2 text-sm">{item.word || item.text} · {item.entity || item.label} · {item.start}-{item.end}</div>)}</div>
  if (capability === 'table_qa') return <div className="mt-4 text-sm"><div className="font-semibold">{output?.answer}</div><div className="text-muted-foreground">Cells: {JSON.stringify(output?.cells || output?.coordinates || [])}</div></div>
  if (capability === 'tool_use') return <div className="mt-4"><pre className="max-h-96 overflow-auto rounded bg-black/30 p-4 text-xs">{JSON.stringify({ answer: output?.answer, authorisedToolTrace: output?.toolTrace }, null, 2)}</pre></div>
  return <pre className="mt-4 max-h-96 overflow-auto rounded bg-black/30 p-4 text-xs">{JSON.stringify(output, null, 2)}</pre>
}
