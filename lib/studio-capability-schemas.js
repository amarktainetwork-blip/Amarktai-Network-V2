// Studio capability schema contracts for frontend controls.
// These do not prove backend execution.

export const CAPABILITY_SCHEMAS = {

  // ── 1. Chat / Text ──────────────────────────────────────────
  chat: {
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'Ask anything…', required: true, group: 'Prompt & Instructions' },
    system_instruction: { type: 'string', format: 'textarea', label: 'System Instruction', placeholder: 'You are a helpful enterprise assistant…', group: 'Prompt & Instructions' },
    purpose: { type: 'enum', label: 'Purpose', group: 'Style & Audience', options: [
      { value: 'general', label: 'General' },
      { value: 'creative', label: 'Creative Writing' },
      { value: 'analysis', label: 'Analysis' },
      { value: 'code', label: 'Code Generation' },
      { value: 'summarize', label: 'Summarize' },
    ]},
    tone: { type: 'enum', label: 'Tone', group: 'Style & Audience', options: [
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'friendly', label: 'Friendly' },
      { value: 'authoritative', label: 'Authoritative' },
      { value: 'creative', label: 'Creative' },
    ]},
    language: { type: 'enum', label: 'Language', group: 'Style & Audience', options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'zh', label: 'Chinese' },
    ]},
    brand_voice: { type: 'enum', label: 'Brand Voice', group: 'Style & Audience', options: [
      { value: 'default', label: 'Default' },
      { value: 'corporate', label: 'Corporate' },
      { value: 'startup', label: 'Startup' },
      { value: 'luxury', label: 'Luxury' },
    ]},
    output_length: { type: 'number', label: 'Output Length', min: 0, max: 100, step: 1, unit: '%', group: 'Style & Audience' },
    audience: { type: 'string', label: 'Audience', placeholder: 'e.g. Enterprise buyers, developers…', group: 'Style & Audience' },
    forbidden_words: { type: 'string', format: 'textarea', label: 'Forbidden Words', placeholder: 'Words to exclude, one per line…', group: 'Style & Audience' },
    // Advanced
    temperature: { type: 'number', label: 'Temperature', min: 0, max: 2, step: 0.1, advanced: true, group: 'Advanced' },
    json_mode: { type: 'boolean', label: 'JSON Mode', advanced: true, group: 'Advanced' },
    strict_schema: { type: 'boolean', label: 'Strict Schema', advanced: true, group: 'Advanced' },
  },

  // ── 2. Image Generation ─────────────────────────────────────
  image: {
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'A cinematic obsidian data center…', required: true, group: 'Prompt & Style' },
    negative_prompt: { type: 'string', format: 'textarea', label: 'Negative Prompt', placeholder: 'Elements to exclude…', group: 'Prompt & Style' },
    style: { type: 'enum', label: 'Style', group: 'Prompt & Style', creatorPresets: true, options: [
      { value: 'photorealistic', label: 'Photorealistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D Render' },
      { value: 'oil', label: 'Oil Painting' },
      { value: 'illustration', label: 'Illustration' },
    ]},
    aspect_ratio: { type: 'enum', label: 'Aspect Ratio', group: 'Prompt & Style', creatorPresets: true, options: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
    ]},
    quality: { type: 'enum', label: 'Quality', group: 'Prompt & Style', options: [
      { value: 'draft', label: 'Draft' },
      { value: 'standard', label: 'Standard' },
      { value: 'hd', label: 'HD' },
    ]},
    reference_image: { type: 'file', label: 'Reference Image', accept: 'image/*', kind: 'image', group: 'Assets & References' },
    logo_asset: { type: 'file', label: 'Logo Asset', accept: 'image/*', kind: 'image', group: 'Assets & References' },
    product_image: { type: 'file', label: 'Product Image', accept: 'image/*', kind: 'image', group: 'Assets & References' },
    brand_palette_lock: { type: 'boolean', label: 'Brand Palette Lock', group: 'Output Controls' },
    remove_background: { type: 'boolean', label: 'Remove Background', group: 'Output Controls' },
    upscale: { type: 'enum', label: 'Upscale', group: 'Output Controls', options: [
      { value: 'none', label: 'None' },
      { value: '2x', label: '2x' },
      { value: '4x', label: '4x' },
    ]},
    // Advanced
    seed: { type: 'number', label: 'Seed (0 = random)', min: 0, max: 999999, step: 1, advanced: true, group: 'Advanced' },
    steps: { type: 'number', label: 'Steps', min: 1, max: 100, step: 1, advanced: true, group: 'Advanced' },
    guidance: { type: 'number', label: 'Guidance (CFG)', min: 1, max: 20, step: 0.5, advanced: true, group: 'Advanced' },
  },

  // ── 3. Video Generation ─────────────────────────────────────
  video: {
    mode: { type: 'enum', label: 'Mode', group: 'Prompt & Style', options: [
      { value: 'text-to-video', label: 'Text to Video' },
      { value: 'image-to-video', label: 'Image to Video' },
      { value: 'first-last-frame', label: 'First / Last Frame' },
      { value: 'reel', label: 'Reel' },
      { value: 'ad', label: 'Ad' },
    ]},
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'Slow dolly across neon skyline…', required: true, group: 'Prompt & Style' },
    negative_prompt: { type: 'string', format: 'textarea', label: 'Negative Prompt', placeholder: 'Elements to exclude…', group: 'Prompt & Style' },
    style: { type: 'enum', label: 'Style', group: 'Prompt & Style', creatorPresets: true, options: [
      { value: 'cinematic', label: 'Cinematic' },
      { value: 'realistic', label: 'Realistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D' },
    ]},
    duration: { type: 'enum', label: 'Duration', group: 'Camera & Motion', options: [
      { value: '4s', label: '4 seconds' },
      { value: '8s', label: '8 seconds' },
      { value: '16s', label: '16 seconds' },
      { value: '30s', label: '30 seconds' },
    ]},
    camera_movement: { type: 'enum', label: 'Camera Movement', group: 'Camera & Motion', creatorPresets: true, options: [
      { value: 'static', label: 'Static' },
      { value: 'pan-left', label: 'Pan Left' },
      { value: 'pan-right', label: 'Pan Right' },
      { value: 'zoom-in', label: 'Zoom In' },
      { value: 'zoom-out', label: 'Zoom Out' },
      { value: 'drone', label: 'Drone' },
      { value: 'orbit', label: 'Orbit' },
    ]},
    first_frame: { type: 'file', label: 'First Frame', accept: 'image/*', kind: 'image', group: 'Assets & References' },
    last_frame: { type: 'file', label: 'Last Frame', accept: 'image/*', kind: 'image', group: 'Assets & References' },
    audio_input: { type: 'file', label: 'Audio Input', accept: 'audio/*', kind: 'audio', group: 'Assets & References' },
    logo_overlay: { type: 'boolean', label: 'Logo Overlay', group: 'Output Controls' },
    subtitles: { type: 'boolean', label: 'Subtitles', group: 'Output Controls' },
    cta_end_card: { type: 'boolean', label: 'CTA End Card', group: 'Output Controls' },
    // Advanced
    lens_type: { type: 'enum', label: 'Lens Type', advanced: true, group: 'Advanced', options: [
      { value: 'wide', label: 'Wide' },
      { value: 'standard', label: 'Standard' },
      { value: 'telephoto', label: 'Telephoto' },
    ]},
    motion_strength: { type: 'number', label: 'Motion Strength', min: 0, max: 100, step: 1, advanced: true, group: 'Advanced' },
  },

  // ── 4. Long-form Video (Storyboard) ────────────────────────
  longvideo: {
    source: { type: 'enum', label: 'Source', group: 'Source & Script', options: [
      { value: 'prompt', label: 'Prompt' },
      { value: 'script', label: 'Script' },
      { value: 'website', label: 'Website' },
      { value: 'brand-pack', label: 'Brand Pack' },
    ]},
    target_duration: { type: 'enum', label: 'Target Duration', group: 'Source & Script', options: [
      { value: '30s', label: '30 seconds' },
      { value: '60s', label: '1 minute' },
      { value: '120s', label: '2 minutes' },
      { value: '300s', label: '5 minutes' },
    ]},
    scene_count: { type: 'number', label: 'Scene Count', min: 2, max: 12, step: 1, group: 'Source & Script' },
    voiceover: { type: 'enum', label: 'Voiceover', group: 'Audio & Assets', options: [
      { value: 'none', label: 'None' },
      { value: 'male', label: 'Male Voice' },
      { value: 'female', label: 'Female Voice' },
      { value: 'ai', label: 'AI Voice' },
    ]},
    music_bed: { type: 'enum', label: 'Music Bed', group: 'Audio & Assets', options: [
      { value: 'none', label: 'None' },
      { value: 'ambient', label: 'Ambient' },
      { value: 'cinematic', label: 'Cinematic' },
      { value: 'upbeat', label: 'Upbeat' },
    ]},
    subtitles: { type: 'boolean', label: 'Subtitles', group: 'Export & Assembly' },
    logo_overlay: { type: 'boolean', label: 'Logo Overlay', group: 'Export & Assembly' },
    cutdown_pack: { type: 'boolean', label: 'Cutdown Pack (9:16)', group: 'Export & Assembly' },
  },

  // ── 5. Music Generation ─────────────────────────────────────
  music: {
    describe_song: { type: 'string', format: 'textarea', label: 'Describe Your Song', placeholder: 'An upbeat electronic track with synth pads…', required: true, group: 'Concept & Lyrics' },
    lyrics: { type: 'string', format: 'textarea', label: 'Custom Lyrics', placeholder: '[Verse 1]\nWrite your lyrics here…\n\n[Chorus]\n…', group: 'Concept & Lyrics' },
    genre: { type: 'multiselect', label: 'Genre', group: 'Style & Mood', creatorPresets: true, options: [
      'Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop',
      'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae',
      'Acoustic', 'Classical', 'Country', 'Electronic',
    ]},
    mood: { type: 'enum', label: 'Mood', group: 'Style & Mood', creatorPresets: true, options: [
      { value: 'happy', label: 'Happy' },
      { value: 'sad', label: 'Sad' },
      { value: 'epic', label: 'Epic' },
      { value: 'chill', label: 'Chill' },
      { value: 'dark', label: 'Dark' },
    ]},
    vocal_style: { type: 'enum', label: 'Vocal Style', group: 'Style & Mood', creatorPresets: true, options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'group', label: 'Group' },
      { value: 'rap', label: 'Rap' },
      { value: 'choir', label: 'Choir' },
      { value: 'instrumental', label: 'Instrumental' },
    ]},
    tempo: { type: 'enum', label: 'Tempo', group: 'Style & Mood', creatorPresets: true, options: [
      { value: 'slow', label: 'Slow' },
      { value: 'medium', label: 'Medium' },
      { value: 'fast', label: 'Fast' },
    ]},
    reference_track: { type: 'file', label: 'Reference Track', accept: 'audio/*', kind: 'audio', group: 'Assets' },
    // Advanced
    bpm: { type: 'number', label: 'Exact BPM', min: 60, max: 200, step: 1, advanced: true, group: 'Advanced' },
    key_scale: { type: 'enum', label: 'Key / Scale', advanced: true, group: 'Advanced', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'c-major', label: 'C Major' },
      { value: 'c-minor', label: 'C Minor' },
      { value: 'g-major', label: 'G Major' },
      { value: 'a-minor', label: 'A Minor' },
    ]},
    vibe: { type: 'enum', label: 'Vibe', advanced: true, group: 'Advanced', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'bright', label: 'Bright' },
      { value: 'dark', label: 'Dark' },
      { value: 'warm', label: 'Warm' },
    ]},
  },

  // ── 6. Voice (TTS/STT) ──────────────────────────────────────
  voice: {
    script: { type: 'string', format: 'textarea', label: 'Script', placeholder: 'Enter text to synthesize…', required: true, group: 'Script & Voice' },
    voice_type: { type: 'enum', label: 'Voice Type', group: 'Script & Voice', creatorPresets: true, options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'child', label: 'Child' },
      { value: 'elderly', label: 'Elderly' },
    ]},
    emotion: { type: 'enum', label: 'Emotion', group: 'Script & Voice', creatorPresets: true, options: [
      { value: 'neutral', label: 'Neutral' },
      { value: 'happy', label: 'Happy' },
      { value: 'angry', label: 'Angry' },
      { value: 'whisper', label: 'Whisper' },
      { value: 'authoritative', label: 'Authoritative' },
    ]},
    speed: { type: 'number', label: 'Speed', min: 50, max: 200, step: 10, unit: '%', group: 'Script & Voice' },
    clone_voice: { type: 'file', label: 'Clone Voice Audio', accept: 'audio/*', kind: 'audio', group: 'Assets' },
    // Advanced
    sample_rate: { type: 'enum', label: 'Sample Rate', advanced: true, group: 'Advanced', options: [
      { value: '22050', label: '22050 Hz' },
      { value: '44100', label: '44100 Hz' },
      { value: '48000', label: '48000 Hz' },
    ]},
    diarization: { type: 'boolean', label: 'Diarization', advanced: true, group: 'Advanced' },
    ssml_mode: { type: 'boolean', label: 'SSML Mode', advanced: true, group: 'Advanced' },
  },

  // ── 7. Avatar ───────────────────────────────────────────────
  avatar: {
    reference_face: { type: 'file', label: 'Reference Face', accept: 'image/*', kind: 'image', group: 'Identity' },
    lip_sync_audio: { type: 'file', label: 'Lip-Sync Audio', accept: 'audio/*', kind: 'audio', group: 'Identity' },
    background: { type: 'enum', label: 'Background', group: 'Environment', options: [
      { value: 'office', label: 'Office' },
      { value: 'studio', label: 'Studio' },
      { value: 'green-screen', label: 'Green Screen' },
      { value: 'custom', label: 'Custom' },
    ]},
    gesture_intensity: { type: 'enum', label: 'Gesture Intensity', group: 'Environment', options: [
      { value: 'none', label: 'None' },
      { value: 'subtle', label: 'Subtle' },
      { value: 'expressive', label: 'Expressive' },
    ]},
  },

  // ── 8. Scrape / Brand ───────────────────────────────────────
  scrape: {
    website_url: { type: 'string', label: 'Website URL', placeholder: 'https://brand.example.com', required: true, group: 'Target' },
    crawl_depth: { type: 'number', label: 'Crawl Depth', min: 1, max: 5, step: 1, group: 'Target' },
    max_pages: { type: 'number', label: 'Max Pages', min: 1, max: 500, step: 1, group: 'Target' },
    extract_targets: { type: 'multiselect', label: 'Extract Elements', group: 'Extraction Rules', creatorPresets: true, options: [
      'Logo', 'Colors', 'Fonts', 'Hero Images', 'Products', 'Services',
      'Pricing', 'Testimonials', 'FAQs', 'Social Links', 'Contact Info',
      'CTAs', 'Offers', 'Competitors',
    ]},
    brand_guide: { type: 'file', label: 'Brand Guide PDF', accept: '.pdf', kind: 'PDF', group: 'Extraction Rules' },
    render_js: { type: 'boolean', label: 'Render JavaScript', advanced: true, group: 'Advanced' },
  },

  // ── 9. RAG / Knowledge ──────────────────────────────────────
  rag: {
    knowledge_name: { type: 'string', label: 'Knowledge Set Name', placeholder: 'e.g. Product Documentation', required: true, group: 'Source & Upload' },
    source_urls: { type: 'string', label: 'Source URLs', placeholder: 'https://docs.example.com (one per line)', group: 'Source & Upload' },
    documents: { type: 'file', label: 'Upload Documents', accept: '.pdf,.doc,.docx,.txt,.md', kind: 'documents', group: 'Source & Upload' },
    chunking_preset: { type: 'enum', label: 'Chunking Preset', group: 'Chunking & Embedding', options: [
      { value: 'auto', label: 'Auto (Recommended)' },
      { value: 'precise', label: 'Precise (Small chunks)' },
      { value: 'broad', label: 'Broad (Large chunks)' },
      { value: 'custom', label: 'Custom' },
    ]},
    chunking_size: { type: 'enum', label: 'Chunk Size', group: 'Chunking & Embedding', options: [
      { value: 'small', label: 'Small (200 tokens)' },
      { value: 'medium', label: 'Medium (500 tokens)' },
      { value: 'large', label: 'Large (1000 tokens)' },
    ]},
    top_results: { type: 'number', label: 'Top-K Results', min: 1, max: 20, step: 1, group: 'Chunking & Embedding' },
    embedding_model: { type: 'enum', label: 'Embedding Model', advanced: true, group: 'Advanced', options: [
      { value: 'm2-bert', label: 'M2-Bert-80M (Default)' },
      { value: 'text-embedding-3-small', label: 'Text Embedding 3 Small' },
      { value: 'text-embedding-3-large', label: 'Text Embedding 3 Large' },
    ]},
    vector_collection: { type: 'string', label: 'Vector Collection', placeholder: 'amarktai_knowledge', advanced: true, group: 'Advanced' },
    overlap: { type: 'enum', label: 'Overlap', advanced: true, group: 'Advanced', options: [
      { value: '0%', label: 'None' },
      { value: '5%', label: '5%' },
      { value: '10%', label: '10%' },
      { value: '20%', label: '20%' },
    ]},
    rerank: { type: 'boolean', label: 'Rerank Results', advanced: true, group: 'Advanced' },
    confidence_threshold: { type: 'number', label: 'Confidence Threshold', min: 0, max: 1, step: 0.05, advanced: true, group: 'Advanced' },
    allowed_apps: { type: 'multiselect', label: 'Allowed Apps', advanced: true, group: 'Advanced', options: [
      'demo-chat-app', 'brand-scraper', 'video-studio', 'all',
    ]},
  },
}

// ─── Creator Mode Presets ──────────────────────────────────────
export const CREATOR_PRESETS = {
  video: {
    camera_movement: [
      { value: 'pan-left', icon: 'ArrowLeft', label: 'Pan Left' },
      { value: 'pan-right', icon: 'ArrowRight', label: 'Pan Right' },
      { value: 'zoom-in', icon: 'ZoomIn', label: 'Zoom In' },
      { value: 'zoom-out', icon: 'ZoomOut', label: 'Zoom Out' },
      { value: 'drone', icon: 'Plane', label: 'Drone' },
      { value: 'orbit', icon: 'RotateCw', label: 'Orbit' },
    ],
    style: [
      { value: 'cinematic', label: 'Cinematic' },
      { value: 'realistic', label: 'Realistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D' },
    ],
  },
  music: {
    genre: [
      'Pop', 'Rock', 'Hip-Hop', 'Amapiano', 'Afrobeat',
      'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae', 'Acoustic',
    ],
    mood: [
      { value: 'happy', label: 'Happy', emoji: '😊' },
      { value: 'sad', label: 'Sad', emoji: '😢' },
      { value: 'epic', label: 'Epic', emoji: '🔥' },
      { value: 'chill', label: 'Chill', emoji: '😌' },
      { value: 'dark', label: 'Dark', emoji: '🌑' },
    ],
    vocal_style: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'group', label: 'Group' },
      { value: 'rap', label: 'Rap' },
      { value: 'choir', label: 'Choir' },
      { value: 'instrumental', label: 'Instrumental' },
    ],
    tempo: [
      { value: 'slow', label: 'Slow' },
      { value: 'medium', label: 'Medium' },
      { value: 'fast', label: 'Fast' },
    ],
  },
  voice: {
    voice_type: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'child', label: 'Child' },
      { value: 'elderly', label: 'Elderly' },
    ],
    emotion: [
      { value: 'neutral', label: 'Neutral' },
      { value: 'happy', label: 'Happy' },
      { value: 'angry', label: 'Angry' },
      { value: 'whisper', label: 'Whisper' },
      { value: 'authoritative', label: 'Authoritative' },
    ],
  },
  image: {
    style: [
      { value: 'photorealistic', label: 'Photorealistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D' },
      { value: 'oil', label: 'Oil Painting' },
      { value: 'illustration', label: 'Illustration' },
    ],
    aspect_ratio: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
    ],
  },
  scrape: {
    extract_targets: [
      'Logo', 'Colors', 'Fonts', 'Hero Images', 'Products',
      'Services', 'Pricing', 'Testimonials', 'FAQs', 'Social Links',
      'Contact Info', 'CTAs', 'Offers', 'Competitors',
    ],
  },
}
