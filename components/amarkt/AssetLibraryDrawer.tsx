// @ts-nocheck
'use client'
import { useState } from 'react'
import { useStudioStore, type GeneratedAsset } from '@/lib/useStudioStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/amarkt/EmptyState'
import { X, Image as ImageIcon, Film, Music, FileText, GripVertical, Search, Package } from 'lucide-react'

const TYPE_ICONS: Record<string, React.ElementType> = { image: ImageIcon, video: Film, audio: Music, document: FileText }
const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

export default function AssetLibraryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { generatedAssets } = useStudioStore()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const filtered = generatedAssets
    .filter((a) => filter === 'all' || a.type === filter)
    .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))

  const handleDragStart = (e: React.DragEvent, asset: GeneratedAsset) => {
    setDragId(asset.id)
    e.dataTransfer.setData('text/plain', JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  }

  if (!open) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-80 h-full border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)] shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Asset Library</span>
            <Badge variant="outline" className="border-white/10 text-[10px]">{generatedAssets.length}</Badge>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…" className="bg-black/20 pl-8 h-8 text-xs" />
          </div>
        </div>

        <div className="flex gap-1 border-b border-white/[0.06] px-3 py-2">
          {TYPE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${filter === f.value ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{f.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <EmptyState icon={Package} title="No assets yet" description={search ? 'Try a different search.' : 'Generate assets in the Studio.'} className="py-8" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((asset) => {
                const Icon = TYPE_ICONS[asset.type] || FileText
                return (
                  <div key={asset.id} draggable onDragStart={(e) => handleDragStart(e, asset)} onDragEnd={() => setDragId(null)}
                    className={`group cursor-grab rounded-lg border p-2 transition hover:border-cyan-500/30 ${dragId === asset.id ? 'border-cyan-500/40 opacity-50' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                    <div className={`mb-2 aspect-square rounded-md bg-gradient-to-br ${asset.gradient} flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-foreground/30" />
                    </div>
                    <div className="text-[11px] font-medium truncate">{asset.name}</div>
                    <div className="text-[10px] text-muted-foreground">{asset.size} · {asset.type}</div>
                    <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground">Drag to timeline</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-muted-foreground text-center">
          Drag assets onto the Timeline to use them
        </div>
      </div>
    </div>
  )
}
