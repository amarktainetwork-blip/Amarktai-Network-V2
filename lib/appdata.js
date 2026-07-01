// Shared static data for the dashboard UI.

export const PROVIDERS = [
  { id: 'genx', name: 'GenX', tier: 'core', status: 'active', description: 'Primary multimodal deployment pathway.' },
  { id: 'together', name: 'Together AI', tier: 'core', status: 'active', description: 'Open-model inference for text and images.' },
  { id: 'groq', name: 'Groq', tier: 'core', status: 'active', description: 'Ultra-low-latency LPU inference for text, TTS and STT.' },
  { id: 'mimo', name: 'MiMo', tier: 'experimental', status: 'experimental', description: 'Isolated experimental reasoning workbench.' },
]

export const CAPABILITIES = [
  { key: 'chat', label: 'Chat / Text', category: 'Language' },
  { key: 'reasoning', label: 'Reasoning', category: 'Language' },
  { key: 'code', label: 'Code Generation', category: 'Language' },
  { key: 'image_generation', label: 'Image Generation', category: 'Vision' },
  { key: 'image_edit', label: 'Image Edit', category: 'Vision' },
  { key: 'video_generation', label: 'Video Generation', category: 'Motion' },
  { key: 'music_generation', label: 'Music / Song', category: 'Audio' },
  { key: 'tts', label: 'Voice — TTS', category: 'Audio' },
  { key: 'stt', label: 'Voice — STT', category: 'Audio' },
  { key: 'avatar_generation', label: 'Avatar', category: 'Vision' },
  { key: 'brand_scrape', label: 'Scrape / Brand', category: 'Intelligence' },
  { key: 'rag_ingest', label: 'RAG — Ingest', category: 'Knowledge' },
  { key: 'rag_search', label: 'RAG — Search', category: 'Knowledge' },
]

export const MUSIC_GENRES = ['Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop', 'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae']

export const NAV = [
  { href: '/dashboard/command-center', label: 'Command Center', icon: 'LayoutDashboard' },
  { href: '/dashboard/studio', label: 'Studio', icon: 'FlaskConical' },
  { href: '/dashboard/app-gateway', label: 'App Gateway', icon: 'Plug' },
  { href: '/dashboard/brand-library', label: 'Brand Library', icon: 'Palette' },
  { href: '/dashboard/proof-runner', label: 'Proof Runner', icon: 'Boxes' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
]
