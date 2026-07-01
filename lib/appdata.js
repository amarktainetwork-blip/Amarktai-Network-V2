// Shared static data used by both the API (mock mode) and the dashboard UI.

export const PROVIDERS = [
  {
    id: 'genx',
    name: 'GenX',
    tier: 'core',
    status: 'mock',
    description: 'Primary multimodal deployment pathway — vision, image and motion.',
    accent: 'cyan',
    models: [
      { id: 'genx-vision-1', kind: 'text', ctx: '200K' },
      { id: 'genx-image-xl', kind: 'image', ctx: '—' },
      { id: 'genx-video-motion', kind: 'video', ctx: '—' },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    tier: 'core',
    status: 'mock',
    description: 'Open-model inference fabric for text and diffusion assets.',
    accent: 'violet',
    models: [
      { id: 'meta-llama-3.1-70b', kind: 'text', ctx: '128K' },
      { id: 'mixtral-8x7b', kind: 'text', ctx: '32K' },
      { id: 'flux-1-schnell', kind: 'image', ctx: '—' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    tier: 'core',
    status: 'mock',
    description: 'Ultra-low-latency LPU inference for text, TTS and STT.',
    accent: 'fuchsia',
    models: [
      { id: 'llama-3.3-70b-versatile', kind: 'text', ctx: '128K' },
      { id: 'whisper-large-v3', kind: 'stt', ctx: '—' },
      { id: 'playai-tts', kind: 'tts', ctx: '—' },
    ],
  },
  {
    id: 'mimo',
    name: 'MiMo',
    tier: 'experimental',
    status: 'experimental',
    description: 'Isolated experimental reasoning workbench. Sandboxed.',
    accent: 'amber',
    models: [{ id: 'mimo-7b-rl', kind: 'text', ctx: '32K' }],
  },
]

export const CAPABILITIES = [
  { key: 'text.chat', label: 'Chat / Text', category: 'Language', status: 'mock', input: { prompt: 'string', system: 'string?', mode: 'enum', reasoning: 'boolean' }, output: { text: 'string', tokens: 'number' } },
  { key: 'image.generate', label: 'Image Generation', category: 'Vision', status: 'mock', input: { prompt: 'string', aspect: 'enum', quality: 'enum', width: 'number', height: 'number' }, output: { artifactId: 'string', url: 'string' } },
  { key: 'image.edit', label: 'Image Edit', category: 'Vision', status: 'not_configured', input: { imageId: 'string', instruction: 'string' }, output: { artifactId: 'string' } },
  { key: 'video.generate', label: 'Video Generation', category: 'Motion', status: 'mock', input: { prompt: 'string', motion: 'enum', fps: 'number', duration: 'number' }, output: { artifactId: 'string' } },
  { key: 'video.longform', label: 'Long-form Video', category: 'Motion', status: 'mock', input: { scenes: 'Scene[]' }, output: { artifactId: 'string', scenes: 'number' } },
  { key: 'music.generate', label: 'Music / Song', category: 'Audio', status: 'mock', input: { genres: 'string[]', tempo: 'number', duration: 'number' }, output: { artifactId: 'string' } },
  { key: 'voice.tts', label: 'Voice — TTS', category: 'Audio', status: 'mock', input: { text: 'string', voice: 'string' }, output: { artifactId: 'string', segments: 'number' } },
  { key: 'voice.stt', label: 'Voice — STT', category: 'Audio', status: 'mock', input: { audioId: 'string' }, output: { transcript: 'string' } },
  { key: 'avatar.generate', label: 'Avatar', category: 'Vision', status: 'mock', input: { profile: 'string', gesture: 'number', framing: 'enum' }, output: { artifactId: 'string' } },
  { key: 'scrape.crawl', label: 'Scrape / Brand', category: 'Ingest', status: 'mock', input: { url: 'string', depth: 'number', elements: 'string[]' }, output: { artifactId: 'string' } },
  { key: 'rag.ingest', label: 'RAG — Ingest', category: 'Knowledge', status: 'mock', input: { files: 'File[]', chunkSize: 'number' }, output: { chunks: 'number' } },
  { key: 'rag.query', label: 'RAG — Query', category: 'Knowledge', status: 'not_configured', input: { query: 'string', topK: 'number' }, output: { matches: 'Match[]' } },
]

export const MUSIC_GENRES = ['Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop', 'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae']

export const READINESS = [
  { key: 'postgres', label: 'PostgreSQL datastore', done: true },
  { key: 'redis', label: 'Redis task broker', done: true },
  { key: 'qdrant', label: 'Qdrant vector index', done: true },
  { key: 'worker', label: 'Background worker (mock)', done: true },
  { key: 'genx_key', label: 'GenX API credential', done: false },
  { key: 'together_key', label: 'Together AI credential', done: false },
  { key: 'groq_key', label: 'Groq API credential', done: false },
  { key: 'storage', label: 'Object storage bucket', done: false },
]

export const NAV = [
  { href: '/dashboard/command-center', label: 'Command Center', icon: 'LayoutDashboard' },
  { href: '/dashboard/studio', label: 'Studio', icon: 'FlaskConical' },
  { href: '/dashboard/capabilities', label: 'Capabilities', icon: 'Boxes' },
  { href: '/dashboard/jobs-artifacts', label: 'Jobs & Artifacts', icon: 'ListChecks' },
  { href: '/dashboard/app-connections', label: 'App Connections', icon: 'Plug' },
  { href: '/dashboard/providers-models', label: 'Providers & Models', icon: 'Cpu' },
  { href: '/dashboard/agents-learning', label: 'Agents & Learning', icon: 'Brain' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
]
