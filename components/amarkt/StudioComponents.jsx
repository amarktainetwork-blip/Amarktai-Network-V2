'use client'
import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, Image as ImageIcon, Film, Music, FileText, Play, Pause, Download } from 'lucide-react'

/**
 * Enhanced DropZone with file acceptance, preview, and clear.
 */
export function DropZone({ accept = '*', label = 'Drop files or click to browse', kind = 'file', onFile, compact = false }) {
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); onFile?.(f) }
  }

  const handleSelect = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); onFile?.(f) }
  }

  const clear = (e) => {
    e.stopPropagation()
    setFile(null)
    onFile?.(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file) {
    const isImage = file.type?.startsWith('image/')
    return (
      <div className="group relative rounded-lg border border-cyan-500/30 bg-cyan-500/[0.04] p-3">
        <div className="flex items-center gap-3">
          {isImage ? (
            <div className="h-12 w-12 rounded bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-cyan-300" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-violet-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{file.name}</div>
            <div className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
          <button onClick={clear} className="text-muted-foreground hover:text-rose-400 transition"><X className="h-4 w-4" /></button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed transition',
        compact ? 'border-white/12 bg-white/[0.015] px-4 py-4' : 'border-white/12 bg-white/[0.015] px-6 py-8',
        dragOver ? 'border-cyan-500/60 bg-cyan-500/[0.06]' : 'hover:border-cyan-500/40 hover:bg-cyan-500/[0.03]'
      )}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleSelect} className="hidden" />
      <div className={cn('rounded-full border border-white/10 bg-white/5 text-cyan-300 transition group-hover:scale-110', compact ? 'p-2 mb-1' : 'p-2.5 mb-2')}>
        <Upload className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </div>
      <p className={cn('text-foreground/80', compact ? 'text-xs' : 'text-sm')}>{label}</p>
      <p className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-xs mt-0.5')}>{kind} · click or drag</p>
    </div>
  )
}

/**
 * MediaPreview — shows a placeholder player for image/video/audio outputs.
 */
export function MediaPreview({ type = 'image', title, src, className }) {
  const [playing, setPlaying] = useState(false)

  if (type === 'image') {
    return (
      <div className={cn('relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/30', className)}>
        {src ? (
          <img src={src} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
            <span className="text-xs">Image preview</span>
          </div>
        )}
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div className={cn('relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/30', className)}>
        <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-muted-foreground">
          <Film className="h-12 w-12 mb-3 opacity-30" />
          <span className="text-xs mb-3">Video preview</span>
          <button
            onClick={() => setPlaying(!playing)}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs hover:bg-white/20 transition"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    )
  }

  if (type === 'audio') {
    return (
      <div className={cn('rounded-lg border border-white/[0.06] bg-black/20 p-4', className)}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setPlaying(!playing)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 hover:from-cyan-500/30 hover:to-violet-500/30 transition"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <div className="flex-1">
            <div className="text-xs font-medium">{title || 'Audio track'}</div>
            <div className="text-[10px] text-muted-foreground">0:00 / 0:15</div>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition"><Download className="h-4 w-4" /></button>
        </div>
        {/* Waveform placeholder */}
        <div className="flex items-end gap-px h-10">
          {Array.from({ length: 60 }).map((_, i) => {
            const h = Math.sin(i * 0.3) * 30 + 40 + Math.random() * 20
            return <div key={i} className="flex-1 rounded-t bg-cyan-500/30" style={{ height: `${h}%` }} />
          })}
        </div>
      </div>
    )
  }

  return null
}

/**
 * ExtractedDataCard — shows scraped/extracted data in a card format.
 */
export function ExtractedDataCard({ icon: Icon, title, items, className }) {
  return (
    <div className={cn('rounded-lg border border-white/[0.06] bg-black/20 p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-cyan-300" />}
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-foreground/80">{item}</span>
        ))}
      </div>
    </div>
  )
}
