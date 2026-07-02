'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/amarkt/EmptyState'
import { X, Image as ImageIcon, Film, Music, FileText, Download, GripVertical, Search, Package } from 'lucide-react'

const MOCK_ASSETS = [
  { id: 1, type: 'image', title: 'Neon Datacenter', size: '1.2 MB', mime: 'image/svg+xml', gradient: 'from-cyan-500/20 to-violet-500/20' },
  { id: 2, type: 'image', title: 'Brand Logo v2', size: '340 KB', mime: 'image/png', gradient: 'from-amber-500/20 to-rose-500/20' },
  { id: 3, type: 'video', title: 'Product Showcase', size: '8.4 MB', mime: 'video/mp4', gradient: 'from-emerald-500/20 to-cyan-500/20' },
  { id: 4, type: 'audio', title: 'Corporate BGM', size: '2.1 MB', mime: 'audio/wav', gradient: 'from-violet-500/20 to-fuchsia-500/20' },
  { id: 5, type: 'document', title: 'Brand Guide', size: '156 KB', mime: 'text/markdown', gradient: 'from-sky-500/20 to-indigo-500/20' },
  { id: 6, type: 'image', title: 'Hero Banner', size: '2.8 MB', mime: 'image/png', gradient: 'from-pink-500/20 to-orange-500/20' },
  { id: 7, type: 'audio', title: 'Voice Narration', size: '4.2 MB', mime: 'audio/wav', gradient: 'from-teal-500/20 to-emerald-500/20' },
  { id: 8, type: 'video', title: 'Social Reel', size: '12.1 MB', mime: 'video/mp4', gradient: 'from-indigo-500/20 to-purple-500/20' },
  { id: 9, type: 'image', title: 'Product Mockup', size: '890 KB', mime: 'image/svg+xml', gradient: 'from-lime-500/20 to-green-500/20' },
]

const TYPE_ICONS = { image: ImageIcon, video: Film, audio: Music, document: FileText }
const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

export default function AssetLibraryDrawer({ open, onClose }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState(null)

  const filtered = MOCK_ASSETS
    .filter((a) => filter === 'all' || a.type === filter)
    .filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase()))

  const handleDragStart = (e, asset) => {
    setDragId(asset.id)
    e.dataTransfer.setData('text/plain', JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = () => setDragId(null)

  if (!open) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-80 h-full border-l border-white/[0.06] bg-[hsl(240_14%_3.5%)] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Asset Library</span>
            <Badge variant="outline" className="border-white/10 text-[10px]">{MOCK_ASSETS.length}</Badge>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
        </div>

        {/* Search */}
        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…" className="bg-black/20 pl-8 h-8 text-xs" />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-white/[0.06] px-3 py-2">
          {TYPE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${filter === f.value ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No assets found"
              description={search ? 'Try a different search term.' : 'Run a generation in the Studio to create assets.'}
              className="py-8"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((asset) => {
                const Icon = TYPE_ICONS[asset.type]
                return (
                  <div key={asset.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, asset)}
                    onDragEnd={handleDragEnd}
                    className={`group cursor-grab rounded-lg border p-2 transition hover:border-cyan-500/30 ${dragId === asset.id ? 'border-cyan-500/40 opacity-50' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                    <div className={`mb-2 aspect-square rounded-md bg-gradient-to-br ${asset.gradient} flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-foreground/30" />
                    </div>
                    <div className="text-[11px] font-medium truncate">{asset.title}</div>
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

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-muted-foreground text-center">
          Drag assets onto the Timeline or Canvas to use them
        </div>
      </div>
    </div>
  )
}
