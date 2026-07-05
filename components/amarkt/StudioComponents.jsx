'use client'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, Image as ImageIcon, Film, Music, FileText, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DropZone({ accept = '*', label = 'Drop files or click to browse', kind = 'file', compact = false, onFile }) {
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const setPickedFile = (nextFile) => {
    setFile(nextFile)
    onFile?.(nextFile)
  }

  const clear = (event) => {
    event.stopPropagation()
    setPickedFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const nextFile = event.dataTransfer.files?.[0]
        if (nextFile) setPickedFile(nextFile)
      }}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed transition',
        compact ? 'border-white/12 bg-white/[0.015] px-4 py-4' : 'border-white/12 bg-white/[0.015] px-6 py-8',
        dragOver ? 'border-cyan-500/60 bg-cyan-500/[0.06]' : 'hover:border-cyan-500/40 hover:bg-cyan-500/[0.03]'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => {
          const nextFile = event.target.files?.[0]
          if (nextFile) setPickedFile(nextFile)
        }}
        className="hidden"
      />
      {file ? (
        <div className="flex w-full items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/[0.06] text-cyan-300">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-medium">{file.name}</div>
            <div className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB - local draft only</div>
          </div>
          <button onClick={clear} className="text-muted-foreground transition hover:text-rose-400"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <div className={cn('rounded-full border border-white/10 bg-white/5 text-cyan-300 transition group-hover:scale-110', compact ? 'mb-1 p-2' : 'mb-2 p-2.5')}>
            <Upload className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </div>
          <p className={cn('text-foreground/80', compact ? 'text-xs' : 'text-sm')}>{label}</p>
          <p className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'mt-0.5 text-xs')}>{kind} - frontend draft upload</p>
        </>
      )}
    </div>
  )
}

export function MediaPreview({ type = 'image', title, className }) {
  const Icon = type === 'video' ? Film : type === 'audio' ? Music : type === 'text' ? FileText : ImageIcon

  return (
    <div className={cn('flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/10 p-6 text-center text-muted-foreground', className)}>
      <Icon className="mb-3 h-10 w-10 opacity-30" />
      <span className="text-xs font-medium">{title || `${type} preview shell`}</span>
      <span className="mt-1 max-w-xs text-[10px] text-muted-foreground/70">Real previews appear after /api/v1 jobs and artifacts are wired.</span>
      <Button variant="outline" size="sm" disabled className="mt-4 border-white/10 text-xs">
        <Lock className="mr-1 h-3 w-3" /> Backend integration pending
      </Button>
    </div>
  )
}

export function ExtractedDataCard({ icon: Icon, title, items, className }) {
  return (
    <div className={cn('rounded-lg border border-white/[0.06] bg-black/20 p-4', className)}>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-cyan-300" />}
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-foreground/80">{item}</span>
        ))}
      </div>
    </div>
  )
}
