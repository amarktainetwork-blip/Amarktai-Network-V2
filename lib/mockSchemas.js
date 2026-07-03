// ─── Mock JSON Schemas for all 9 Studio capabilities ──────────
// Each schema drives the DynamicFormRenderer in both Creator and Pro modes.

export const CAPABILITY_SCHEMAS = {

  // ── 1. Chat / Text ──────────────────────────────────────────
  chat: {
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'Ask anything…', required: true },
    system_instruction: { type: 'string', format: 'textarea', label: 'System Instruction', placeholder: 'You are a helpful enterprise assistant…' },
    purpose: { type: 'enum', label: 'Purpose', options: [
      { value: 'general', label: 'General' },
      { value: 'creative', label: 'Creative Writing' },
      { value: 'analysis', label: 'Analysis' },
      { value: 'code', label: 'Code Generation' },
      { value: 'summarize', label: 'Summarize' },
    ]},
    tone: { type: 'enum', label: 'Tone', options: [
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'friendly', label: 'Friendly' },
      { value: 'authoritative', label: 'Authoritative' },
      { value: 'creative', label: 'Creative' },
    ]},
    language: { type: 'enum', label: 'Language', options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'zh', label: 'Chinese' },
    ]},
    brand_voice: { type: 'enum', label: 'Brand Voice', options: [
      { value: 'default', label: 'Default' },
      { value: 'corporate', label: 'Corporate' },
      { value: 'startup', label: 'Startup' },
      { value: 'luxury', label: 'Luxury' },
    ]},
    output_length: { type: 'number', label: 'Output Length', min: 0, max: 100, step: 1, unit: '%', advanced: false },
    audience: { type: 'string', label: 'Audience', placeholder: 'e.g. Enterprise buyers, developers…' },
    forbidden_words: { type: 'string', format: 'textarea', label: 'Forbidden Words', placeholder: 'Words to exclude, one per line…' },
    // Advanced
    temperature: { type: 'number', label: 'Temperature', min: 0, max: 2, step: 0.1, advanced: true },
    json_mode: { type: 'boolean', label: 'JSON Mode', advanced: true },
    strict_schema: { type: 'boolean', label: 'Strict Schema', advanced: true },
  },

  // ── 2. Image Generation ─────────────────────────────────────
  image: {
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'A cinematic obsidian data center…', required: true },
    negative_prompt: { type: 'string', format: 'textarea', label: 'Negative Prompt', placeholder: 'Elements to exclude…' },
    style: { type: 'enum', label: 'Style', options: [
      { value: 'photorealistic', label: 'Photorealistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D Render' },
      { value: 'oil', label: 'Oil Painting' },
      { value: 'illustration', label: 'Illustration' },
    ], creatorPresets: true },
    aspect_ratio: { type: 'enum', label: 'Aspect Ratio', options: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
    ], creatorPresets: true },
    quality: { type: 'enum', label: 'Quality', options: [
      { value: 'draft', label: 'Draft' },
      { value: 'standard', label: 'Standard' },
      { value: 'hd', label: 'HD' },
    ]},
    reference_image: { type: 'file', label: 'Reference Image', accept: 'image/*', kind: 'image' },
    logo_asset: { type: 'file', label: 'Logo Asset', accept: 'image/*', kind: 'image' },
    product_image: { type: 'file', label: 'Product Image', accept: 'image/*', kind: 'image' },
    brand_palette_lock: { type: 'boolean', label: 'Brand Palette Lock' },
    remove_background: { type: 'boolean', label: 'Remove Background' },
    upscale: { type: 'enum', label: 'Upscale', options: [
      { value: 'none', label: 'None' },
      { value: '2x', label: '2x' },
      { value: '4x', label: '4x' },
    ]},
    // Advanced
    seed: { type: 'number', label: 'Seed (0 = random)', min: 0, max: 999999, step: 1, advanced: true },
    steps: { type: 'number', label: 'Steps', min: 1, max: 100, step: 1, advanced: true },
    guidance: { type: 'number', label: 'Guidance (CFG)', min: 1, max: 20, step: 0.5, advanced: true },
  },

  // ── 3. Video Generation ─────────────────────────────────────
  video: {
    mode: { type: 'enum', label: 'Mode', options: [
      { value: 'text-to-video', label: 'Text to Video' },
      { value: 'image-to-video', label: 'Image to Video' },
      { value: 'first-last-frame', label: 'First / Last Frame' },
      { value: 'reel', label: 'Reel' },
      { value: 'ad', label: 'Ad' },
    ]},
    prompt: { type: 'string', format: 'textarea', label: 'Prompt', placeholder: 'Slow dolly across neon skyline…', required: true },
    negative_prompt: { type: 'string', format: 'textarea', label: 'Negative Prompt', placeholder: 'Elements to exclude…' },
    style: { type: 'enum', label: 'Style', options: [
      { value: 'cinematic', label: 'Cinematic' },
      { value: 'realistic', label: 'Realistic' },
      { value: 'anime', label: 'Anime' },
      { value: '3d', label: '3D' },
    ], creatorPresets: true },
    duration: { type: 'enum', label: 'Duration', options: [
      { value: '4s', label: '4 seconds' },
      { value: '8s', label: '8 seconds' },
      { value: '16s', label: '16 seconds' },
      { value: '30s', label: '30 seconds' },
    ]},
    camera_movement: { type: 'enum', label: 'Camera Movement', options: [
      { value: 'static', label: 'Static' },
      { value: 'pan-left', label: 'Pan Left' },
      { value: 'pan-right', label: 'Pan Right' },
      { value: 'zoom-in', label: 'Zoom In' },
      { value: 'zoom-out', label: 'Zoom Out' },
      { value: 'drone', label: 'Drone' },
      { value: 'orbit', label: 'Orbit' },
    ], creatorPresets: true },
    first_frame: { type: 'file', label: 'First Frame', accept: 'image/*', kind: 'image' },
    last_frame: { type: 'file', label: 'Last Frame', accept: 'image/*', kind: 'image' },
    audio_input: { type: 'file', label: 'Audio Input', accept: 'audio/*', kind: 'audio' },
    logo_overlay: { type: 'boolean', label: 'Logo Overlay' },
    subtitles: { type: 'boolean', label: 'Subtitles' },
    cta_end_card: { type: 'boolean', label: 'CTA End Card' },
    // Advanced
    lens_type: { type: 'enum', label: 'Lens Type', options: [
      { value: 'wide', label: 'Wide' },
      { value: 'standard', label: 'Standard' },
      { value: 'telephoto', label: 'Telephoto' },
    ], advanced: true },
    motion_strength: { type: 'number', label: 'Motion Strength', min: 0, max: 100, step: 1, advanced: true },
  },

  // ── 4. Long-form Video (Storyboard) ────────────────────────
  longvideo: {
    source: { type: 'enum', label: 'Source', options: [
      { value: 'prompt', label: 'Prompt' },
      { value: 'script', label: 'Script' },
      { value: 'website', label: 'Website' },
      { value: 'brand-pack', label: 'Brand Pack' },
    ]},
    target_duration: { type: 'enum', label: 'Target Duration', options: [
      { value: '30s', label: '30 seconds' },
      { value: '60s', label: '1 minute' },
      { value: '120s', label: '2 minutes' },
      { value: '300s', label: '5 minutes' },
    ]},
    scene_count: { type: 'number', label: 'Scene Count', min: 2, max: 12, step: 1 },
    voiceover: { type: 'enum', label: 'Voiceover', options: [
      { value: 'none', label: 'None' },
      { value: 'male', label: 'Male Voice' },
      { value: 'female', label: 'Female Voice' },
      { value: 'ai', label: 'AI Voice' },
    ]},
    music_bed: { type: 'enum', label: 'Music Bed', options: [
      { value: 'none', label: 'None' },
      { value: 'ambient', label: 'Ambient' },
      { value: 'cinematic', label: 'Cinematic' },
      { value: 'upbeat', label: 'Upbeat' },
    ]},
    subtitles: { type: 'boolean', label: 'Subtitles' },
    logo_overlay: { type: 'boolean', label: 'Logo Overlay' },
    cutdown_pack: { type: 'boolean', label: 'Cutdown Pack (9:16)' },
  },

  // ── 5. Music Generation ─────────────────────────────────────
  music: {
    describe_song: { type: 'string', format: 'textarea', label: 'Describe Your Song', placeholder: 'An upbeat electronic track with synth pads…', required: true },
    genre: { type: 'multiselect', label: 'Genre', options: [
      'Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop',
      'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae',
      'Acoustic', 'Classical', 'Country', 'Electronic',
    ], creatorPresets: true },
    mood: { type: 'enum', label: 'Mood', options: [
      { value: 'happy', label: 'Happy' },
      { value: 'sad', label: 'Sad' },
      { value: 'epic', label: 'Epic' },
      { value: 'chill', label: 'Chill' },
      { value: 'dark', label: 'Dark' },
    ], creatorPresets: true },
    vocal_style: { type: 'enum', label: 'Vocal Style', options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'group', label: 'Group' },
      { value: 'rap', label: 'Rap' },
      { value: 'choir', label: 'Choir' },
      { value: 'instrumental', label: 'Instrumental' },
    ], creatorPresets: true },
    tempo: { type: 'enum', label: 'Tempo', options: [
      { value: 'slow', label: 'Slow' },
      { value: 'medium', label: 'Medium' },
      { value: 'fast', label: 'Fast' },
    ], creatorPresets: true },
    reference_track: { type: 'file', label: 'Reference Track', accept: 'audio/*', kind: 'audio' },
    lyrics: { type: 'string', format: 'textarea', label: 'Custom Lyrics', placeholder: '[Verse 1]\nWrite your lyrics here…\n\n[Chorus]\n…' },
    // Advanced
    bpm: { type: 'number', label: 'Exact BPM', min: 60, max: 200, step: 1, advanced: true },
    key_scale: { type: 'enum', label: 'Key / Scale', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'c-major', label: 'C Major' },
      { value: 'c-minor', label: 'C Minor' },
      { value: 'g-major', label: 'G Major' },
      { value: 'a-minor', label: 'A Minor' },
    ], advanced: true },
    vibe: { type: 'enum', label: 'Vibe', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'bright', label: 'Bright' },
      { value: 'dark', label: 'Dark' },
      { value: 'warm', label: 'Warm' },
    ], advanced: true },
  },

  // ── 6. Voice (TTS/STT) ──────────────────────────────────────
  voice: {
    script: { type: 'string', format: 'textarea', label: 'Script', placeholder: 'Enter text to synthesize…', required: true },
    voice_type: { type: 'enum', label: 'Voice Type', options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'child', label: 'Child' },
      { value: 'elderly', label: 'Elderly' },
    ], creatorPresets: true },
    emotion: { type: 'enum', label: 'Emotion', options: [
      { value: 'neutral', label: 'Neutral' },
      { value: 'happy', label: 'Happy' },
      { value: 'angry', label: 'Angry' },
      { value: 'whisper', label: 'Whisper' },
      { value: 'authoritative', label: 'Authoritative' },
    ], creatorPresets: true },
    speed: { type: 'number', label: 'Speed', min: 50, max: 200, step: 10, unit: '%' },
    clone_voice: { type: 'file', label: 'Clone Voice Audio', accept: 'audio/*', kind: 'audio' },
    // Advanced
    sample_rate: { type: 'enum', label: 'Sample Rate', options: [
      { value: '22050', label: '22050 Hz' },
      { value: '44100', label: '44100 Hz' },
      { value: '48000', label: '48000 Hz' },
    ], advanced: true },
    diarization: { type: 'boolean', label: 'Diarization', advanced: true },
    ssml_mode: { type: 'boolean', label: 'SSML Mode', advanced: true },
  },

  // ── 7. Avatar ───────────────────────────────────────────────
  avatar: {
    reference_face: { type: 'file', label: 'Reference Face', accept: 'image/*', kind: 'image' },
    lip_sync_audio: { type: 'file', label: 'Lip-Sync Audio', accept: 'audio/*', kind: 'audio' },
    background: { type: 'enum', label: 'Background', options: [
      { value: 'office', label: 'Office' },
      { value: 'studio', label: 'Studio' },
      { value: 'green-screen', label: 'Green Screen' },
      { value: 'custom', label: 'Custom' },
    ]},
    gesture_intensity: { type: 'enum', label: 'Gesture Intensity', options: [
      { value: 'none', label: 'None' },
      { value: 'subtle', label: 'Subtle' },
      { value: 'expressive', label: 'Expressive' },
    ]},
  },

  // ── 8. Scrape / Brand ───────────────────────────────────────
  scrape: {
    website_url: { type: 'string', label: 'Website URL', placeholder: 'https://brand.example.com', required: true },
    crawl_depth: { type: 'number', label: 'Crawl Depth', min: 1, max: 5, step: 1 },
    max_pages: { type: 'number', label: 'Max Pages', min: 1, max: 500, step: 1 },
    extract_targets: { type: 'multiselect', label: 'Extract Elements', options: [
      'Logo', 'Colors', 'Fonts', 'Hero Images', 'Products', 'Services',
      'Pricing', 'Testimonials', 'FAQs', 'Social Links', 'Contact Info',
      'CTAs', 'Offers', 'Competitors',
    ], creatorPresets: true },
    brand_guide: { type: 'file', label: 'Brand Guide PDF', accept: '.pdf', kind: 'PDF' },
    render_js: { type: 'boolean', label: 'Render JavaScript', advanced: true },
  },

  // ── 9. RAG / Knowledge ──────────────────────────────────────
  rag: {
    knowledge_name: { type: 'string', label: 'Knowledge Set Name', placeholder: 'e.g. Product Documentation', required: true },
    source_urls: { type: 'string', label: 'Source URLs', placeholder: 'https://docs.example.com (one per line)' },
    documents: { type: 'file', label: 'Upload Documents', accept: '.pdf,.doc,.docx,.txt,.md', kind: 'documents' },
    chunking_preset: { type: 'enum', label: 'Chunking Preset', options: [
      { value: 'auto', label: 'Auto (Recommended)' },
      { value: 'precise', label: 'Precise (Small chunks)' },
      { value: 'broad', label: 'Broad (Large chunks)' },
      { value: 'custom', label: 'Custom' },
    ]},
    chunking_size: { type: 'enum', label: 'Chunk Size', options: [
      { value: 'small', label: 'Small (200 tokens)' },
      { value: 'medium', label: 'Medium (500 tokens)' },
      { value: 'large', label: 'Large (1000 tokens)' },
    ]},
    top_results: { type: 'number', label: 'Top-K Results', min: 1, max: 20, step: 1 },
    embedding_model: { type: 'enum', label: 'Embedding Model', options: [
      { value: 'm2-bert', label: 'M2-Bert-80M (Default)' },
      { value: 'text-embedding-3-small', label: 'Text Embedding 3 Small' },
      { value: 'text-embedding-3-large', label: 'Text Embedding 3 Large' },
    ], advanced: true },
    vector_collection: { type: 'string', label: 'Vector Collection', placeholder: 'amarktai_knowledge', advanced: true },
    // Advanced
    overlap: { type: 'enum', label: 'Overlap', options: [
      { value: '0%', label: 'None' },
      { value: '5%', label: '5%' },
      { value: '10%', label: '10%' },
      { value: '20%', label: '20%' },
    ], advanced: true },
    rerank: { type: 'boolean', label: 'Rerank Results', advanced: true },
    confidence_threshold: { type: 'number', label: 'Confidence Threshold', min: 0, max: 1, step: 0.05, advanced: true },
    allowed_apps: { type: 'multiselect', label: 'Allowed Apps', options: [
      'demo-chat-app', 'brand-scraper', 'video-studio', 'all',
    ], advanced: true },
  },
}

// ─── Creator Mode Presets ──────────────────────────────────────
// Maps complex fields to visual preset buttons for Creator mode
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
