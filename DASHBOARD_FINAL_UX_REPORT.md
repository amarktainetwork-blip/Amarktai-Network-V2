# Dashboard Final UX Report

**PR:** #19
**Branch:** `fix/final-production-dashboard-studio`
**Commit:** `fix: complete studio capability control surfaces`

## Studio Layout Final State

Two-block layout:
- **Left block (Director):** Chat history, capability selector dropdown, one composer input, send button
- **Right block (Options/Preview):** Tabs for Options, Preview, Assets, Advanced
- Backend/debug details hidden under Advanced accordion
- No browser/page scroll (`h-[100dvh]`, `overflow-hidden`)
- Runtime selected for provider routing (no hard-coded provider-to-mode)

## Complete Capability Selector List (25 items)

### Chat & Reasoning
- Chat
- Reasoning
- Code
- Research

### Image
- Image generation
- Image editing

### Video
- Short video
- Long-form video
- Image-to-video
- Video edit / remix

### Audio
- Music / Song
- Voice / TTS
- Speech-to-text

### Avatar
- Avatar generation
- Talking avatar
- Lip-sync avatar

### Brand & Marketing
- Website scrape / BrandPack
- Campaign content
- Social / reel pack

### Knowledge
- RAG ingest
- RAG search

### Apps & Agents
- App request
- Agent task
- Workflow automation

### Gated
- DeepInfra gated text

## Schemas Added

| Schema Key | Status | Controls |
|-----------|--------|----------|
| `reasoning` | New | objective, reasoning depth, constraints, assumptions, output format, final answer style, citations, logic check |
| `research` | New | topic, source preference, depth, date range, competitor list, citations, output format, summary style |
| `image_to_video` | New | prompt, source image, first frame, aspect ratio, duration, camera movement, motion strength, style, music, captions, platform presets |
| `video_edit` | New | source video, edit instructions, target duration, aspect ratio, style, captions, music, logo overlay, platform presets, export format |
| `campaign` | New | brand/product, campaign objective, target audience, platforms, content pack type, tone, offer/CTA, variants, brand assets, output formats, compliance notes |
| `social_reel` | New | platform, reel count, duration, aspect ratio, hook style, captions, CTA, music style, brand assets, thumbnail/cover, output pack |
| `app_request` | New | app name, app type, requested capabilities, agent required, brand pack, environment, budget, rate limit, webhook URL, approval policy |
| `agent_task` | New | agent name/role, task/directive, allowed tools, memory access, brand access, app scope, automation goal, approval required, output format |
| `workflow` | New | workflow name, trigger type, apps involved, agent involved, steps, approval gates, schedule, webhook/action, success criteria, rollback notes |
| `rag_search` | New | query, knowledge set, app/agent scope, top K, rerank, citations, source filter, answer format |

## Frontend-Planned Backend Pending Items

| Capability | Planned Backend Key | Status |
|-----------|-------------------|--------|
| `video.image_to_video` | `image_to_video` | missing: true |
| `video.edit` | `video_edit` | missing: true |
| `campaign.generate` | `campaign_generation` | missing: true |
| `social.reel_pack` | `social_reel_pack` | missing: true |
| `app.request` | `app_request` | missing: true |
| `agent.task` | `agent_task` | missing: true |
| `workflow.automation` | `workflow_automation` | missing: true |
| `research` | `research` | missing: true |
| `video.longform` | `long_form_video` | missing: true |
| `uncensored.text` | `uncensored_text` | missing: true, gated |

## Provider Routing Rule

- User-facing Studio shows "Runtime selected" for normal capabilities
- No hard-coded provider-to-mode mapping
- DeepInfra remains visibly gated only (gated_backend_pending)
- Final providers: GenX, Groq, Together, MiMo, DeepInfra

## Build Output

```
npm run build -> Compiled successfully in 10.9s
22 static pages generated
Studio page: 24 kB
```

## Test Output

```
npm test -> 43 tests passed (80ms)
```

## Manual QA Checklist

- [x] Dashboard redirects to Studio
- [x] Studio has no browser/page scroll
- [x] Two-block layout (Director + Options)
- [x] One Director composer
- [x] Grouped capability selector with search
- [x] All 25 selector labels present
- [x] All schemas have proper controls
- [x] Music schema includes all required genres and controls
- [x] Long-form video schema includes all required controls
- [x] Image-to-video schema includes source image, motion, camera, duration
- [x] Campaign schema includes brand, audience, platform, objective, CTA, variants
- [x] Agent task schema includes directives, tools, memory, brand, scope, approval
- [x] Workflow schema includes trigger, steps, approval, schedule, success criteria, rollback
- [x] Voice schema includes South African accent
- [x] Backend details hidden under Advanced accordion
- [x] No hard-coded provider-to-mode mapping
- [x] DeepInfra gated only
- [x] Provider list exactly five final providers
- [x] No banned providers
- [x] No mock/simulation/fake code
