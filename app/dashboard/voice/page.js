'use client'

import { useEffect, useState } from 'react'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useStudioStore } from '@/lib/useStudioStore'
import { adminFetch } from '@/lib/admin-session'
import { Mic, Volume2 } from 'lucide-react'

export default function VoiceStudioPage() {
  const [mode, setMode] = useState('tts')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')
  const [voices, setVoices] = useState([])
  const [outputFormat, setOutputFormat] = useState('wav')
  const [language, setLanguage] = useState('en')
  const [artifacts, setArtifacts] = useState([])
  const [sourceArtifactId, setSourceArtifactId] = useState('')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  const loadArtifacts = async () => {
    const [response, voicesResponse] = await Promise.all([adminFetch('/api/admin/artifacts?limit=100'), adminFetch('/api/admin/voices')])
    const [data, voicesData] = await Promise.all([response.json(), voicesResponse.json()])
    setArtifacts((data.artifacts || []).filter((artifact) => artifact.status === 'completed' && (artifact.mimeType?.startsWith('audio/') || artifact.mimeType?.startsWith('video/'))))
    setVoices((voicesData.voices || []).filter((item) => item.enabled))
  }
  useEffect(() => { loadArtifacts() }, [])

  const run = async () => {
    setRunning(true); setResult(null)
    try {
      const input = mode === 'tts'
        ? { text: text.trim(), ...(voice ? { voiceProfileId: voice } : {}), outputFormat, speed: 1, language }
        : { artifactId: sourceArtifactId, language, timestamps: 'both', persistTranscript: true, translateToEnglish: false }
      const prompt = mode === 'tts' ? text.trim() : 'Transcribe the authorised source artifact'
      const submitted = await useStudioStore.getState().submitJob(mode, { ...input, prompt })
      if (!submitted.ok) throw new Error(submitted.error)
      let job
      for (let attempt = 0; attempt < 120; attempt++) {
        job = await useStudioStore.getState().pollJob(submitted.jobId)
        setResult(job)
        if (['completed', 'failed', 'cancelled'].includes(job?.status)) break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      if (job?.status === 'completed') await loadArtifacts()
    } catch (error) {
      setResult({ status: 'failed', error: error.message })
    } finally { setRunning(false) }
  }

  let output = null
  try { output = result?.output ? JSON.parse(result.output) : null } catch { output = { transcript: result.output } }
  const canRun = mode === 'tts' ? text.trim() : sourceArtifactId
  const sourceArtifact = artifacts.find((artifact) => artifact.id === sourceArtifactId)

  return <PageTransition className="space-y-6">
    <PageHeader title="Voice Studio" subtitle="Text-to-speech and speech-to-text using authorised artifacts. Voice cloning is not available." />
    <div className="flex gap-2"><Button variant={mode === 'tts' ? 'default' : 'outline'} onClick={() => setMode('tts')}><Volume2 className="mr-2 h-4 w-4" />TTS</Button><Button variant={mode === 'stt' ? 'default' : 'outline'} onClick={() => setMode('stt')}><Mic className="mr-2 h-4 w-4" />STT</Button></div>
    <Card className="space-y-4 border-white/[0.07] bg-white/[0.02] p-5">
      {mode === 'tts' ? <>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Text to speak" className="min-h-32" />
        <div className="grid gap-3 sm:grid-cols-3"><select aria-label="Verified voice" value={voice} onChange={(event) => setVoice(event.target.value)} className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"><option value="">Automatic verified voice</option>{voices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.language || item.locale || item.provider}</option>)}</select><select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm">{['wav', 'mp3', 'flac', 'ogg'].map((format) => <option key={format}>{format}</option>)}</select><Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language hint" /></div>
      </> : <>
        <select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"><option value="">Select authorised audio/video artifact</option>{artifacts.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.title || artifact.id} · {artifact.mimeType}</option>)}</select>
        {sourceArtifactId && (sourceArtifact?.mimeType?.startsWith('video/')
          ? <video controls preload="metadata" src={`/api/admin/artifacts/${sourceArtifactId}/file`} className="max-h-64 w-full" />
          : <audio controls src={`/api/admin/artifacts/${sourceArtifactId}/file`} className="w-full" />)}
        <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language hint" />
      </>}
      <Button onClick={run} disabled={!canRun || running}>{running ? 'Running...' : mode === 'tts' ? 'Generate speech' : 'Transcribe'}</Button>
    </Card>
    {result && <Card className="border-white/[0.07] bg-white/[0.02] p-5"><Badge variant="outline">{result.status}</Badge>{result.error && <p className="mt-3 text-sm text-rose-300">{result.error}</p>}{result.status === 'completed' && mode === 'tts' && result.artifactId && <div className="mt-4 space-y-3"><audio controls src={`/api/admin/artifacts/${result.artifactId}/file`} className="w-full" /><a href={`/api/admin/artifacts/${result.artifactId}/file?download=1`} className="text-sm text-cyan-300">Download audio</a></div>}{result.status === 'completed' && mode === 'stt' && <div className="mt-4 space-y-3"><p className="whitespace-pre-wrap text-sm">{output?.transcript}</p>{output?.segments && <pre className="max-h-64 overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(output.segments, null, 2)}</pre>}{result.artifactId && <a href={`/api/admin/artifacts/${result.artifactId}/file?download=1`} className="text-sm text-cyan-300">Download transcript JSON</a>}</div>}</Card>}
  </PageTransition>
}
