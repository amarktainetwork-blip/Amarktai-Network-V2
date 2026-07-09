# AMARKTAI NETWORK V2 — FORENSIC REPO AUDIT

## A. Current Repo/Head/Branch Status

- **Current main HEAD:** 738c86a (PR #70 merged)
- **Branch:** main (clean, no uncommitted changes)
- **Platform:** Windows (win32), shell: PowerShell
- **Repo path:** C:\amarktai-agent\Amarktai-Network-V2

## B. Current Deploy/Docker Architecture

- **Docker Compose:** 5 services (mariadb, redis, qdrant, api, worker, dashboard)
- **API:** Fastify on port 3001
- **Worker:** BullMQ job processor
- **Dashboard:** Next.js standalone on port 3000
- **Database:** MariaDB 11
- **Queue:** Redis 7 with noeviction policy
- **Vector DB:** Qdrant (latest)
- **Storage:** Local volume mount at /var/www/amarktai/storage

## C. Current Provider Status

**Approved Providers (exactly 5):**
1. **GenX** — Premium media (video, image, avatar)
2. **Groq** — Fast low-cost text/tool/speech
3. **Together** — Broad serverless media/model gateway
4. **MiMo** — Coding tool only (not normal runtime)
5. **DeepInfra** — Expansion gateway

**Provider Category Support:**
- GenX: video, image, audio
- Groq: text, code, audio
- Together: text, image, code, retrieval, document
- MiMo: [] (empty — coding tool only)
- DeepInfra: text, code

## D. Current Runtime Proof Status

**Proven Capabilities (10):**
1. chat — Groq (live_external_app_job)
2. reasoning — Groq (live_external_app_job)
3. code — Groq (live_external_app_job)
4. summarization — Groq (live_external_app_job)
5. translation — Groq (live_external_app_job)
6. classification — Groq (live_external_app_job)
7. extraction — Groq (live_external_app_job)
8. structured_output — Groq (live_external_app_job)
9. image_generation — Together (live_external_app_job_with_artifact_download)
10. video_generation — GenX (live_external_app_job_with_artifact_download)

**Unproven Capabilities (25+):**
- image_edit, image_to_video, long_form_video, tts, stt, music_generation, avatar_generation, embeddings, reranking, research, multimodal, tool_use, brand_scrape, rag_ingest, rag_search, document_qa, ocr, campaign_generation, social_content_generation, adult_text, adult_image, adult_voice, adult_avatar, adult_video

## E. Current Capability Catalog vs Actual Executable Capabilities

**Catalog (capability-display-catalog.js):** 35 capabilities defined
**Backend Map (capability-map.js):** 35 mappings (some marked `missing: true`)
**Provider Executor:** 10 capabilities actually executable
**Gap:** 25 capabilities in catalog but not executable

**Critical Discrepancy:**
- `code` capability is labeled "Code" in catalog but executes as "developer text" through Groq
- MiMo is the true coding tool but is excluded from normal runtime
- Catalog shows capabilities like "Campaign Generation", "Social Content Generation" that have no execution path

## F. Current Dashboard Truth Problems

1. **Studio Preview Tab:** Still shows "Backend proof required" even though image artifact preview/download works (PR #70)
2. **Studio Assets Tab:** Placeholder — says "Asset library" but doesn't show real artifacts
3. **Studio Developer Tab:** Shows stale "route_pending" text even for proven capabilities
4. **Capability Library:** Doesn't clearly separate runtime proof from model catalog coverage
5. **OSS Tools:** Shown as "Available" from static frontend data without health checks
6. **Apps/Agents/Brand Library:** Blocked but don't explain central-platform dependencies clearly

## G. Current Job/Queue/Worker Status

**Job Model (Prisma):**
- id, appSlug, capability, prompt, inputJson, metadataJson, traceId
- status (queued/processing/completed/failed/cancelled)
- provider, model, artifactId, progress, output, error
- callbackUrl, createdAt, startedAt, completedAt

**Queue:** BullMQ `amarktai-jobs` queue
**Worker:** Processes jobs through provider-executor.ts
**Studio Submission:** POST /api/admin/studio/jobs (admin JWT required)

## H. Current Artifact Storage/Preview/Download Status

**Artifact Model (Prisma):**
- id, appSlug, type, subType, title, description, provider, model
- traceId, status, mimeType, fileSizeBytes, storagePath, storageUrl
- previewable, downloadable, errorMessage

**Storage:** Local filesystem at /var/www/amarktai/storage/artifacts
**Download Route:** GET /api/v1/artifacts/:id/file (requires auth)
**Preview:** Works in Studio and Artifacts page (PR #70)

## I. Current Model Catalog/Runtime Selector Status

**Model Registry:** 34+ curated models + live discovery from providers
**Discovery Sources:**
- Together: 271 models (live API)
- DeepInfra: 174 models (live API)
- Groq: 17 models (live API)
- GenX: 61 models (pricing fallback)
- MiMo: 1 model (curated seed)

**Runtime Selector:** Scores models by capability, quality tier, cost, latency, provider health

## J. Current RAG/Memory/Brand-Vault Status

**RAG Foundation:**
- Qdrant client exists (packages/providers/src/qdrant-client.ts)
- RAG adapter exists (apps/worker/src/adapters/rag-adapter.ts)
- Supports rag_ingest and rag_search capabilities
- Uses Together embeddings for vector generation

**Memory Model (Prisma):**
- MemoryEntry model exists with namespace, key, value, metadata

**Brand Vault:** No dedicated model or UI exists

## K. Current Media/Long-Form-Video Status

**Short Video:** GenX video_generation proven (single clip)
**Long-Form Video:** Not implemented
**Image Edit:** Not implemented
**TTS:** Not implemented
**STT:** Not implemented
**Music:** Not implemented

**Video Planner:** Exists (apps/api/src/lib/video-planner.ts) but only estimates costs, doesn't execute

## L. Current Audio/Music/Voice Status

**TTS:** Catalog entry exists, no execution path
**STT:** Catalog entry exists, no execution path
**Music Generation:** Catalog entry exists, no execution path
**Voice Clone:** Not implemented

## M. Current Operations/Usage/Cost/Budget Status

**Usage Metering:** UsageMeter model exists, recordUsageEvent() function exists
**Budget Profiles:** BudgetProfile model exists, draft/standard/premium/custom profiles defined
**Provider Budgets:** ProviderBudget model exists
**Cost Tracking:** Not actively recording costs (no cost estimates in usage events)

## N. Current App-Platform Foundation Status

**App API Keys:** AppApiKey model exists in schema
**App Connections:** AppConnection model exists in schema
**App AI Profiles:** AppAiProfile model exists with routing, cost, safety settings
**App Permissions:** Schema exists but no UI or enforcement
**App Budgets:** AppBudgetConfig model exists
**App Job Submission:** External apps can submit via POST /api/v1/jobs with API key

## O. Dead Code/Placeholders/Duplicates/Conflicting Truth

1. **Studio Preview Tab:** Contradicts proven artifact preview/download
2. **Studio Assets Tab:** Placeholder with no real functionality
3. **Developer Tab:** Shows stale "route_pending" for proven capabilities
4. **capability-map.js:** Some entries marked `missing: true` but have backend keys
5. **OSS Tools:** Shown as "Available" without health verification

## P. Exact Blockers Preventing the Marketing App

1. **Brand Scrape:** Not implemented
2. **Brand Vault:** No model or UI
3. **Campaign Planner:** Not implemented
4. **Content Calendar:** Not implemented
5. **Social Media Adapters:** Not implemented
6. **Long-Form Video:** Not implemented
7. **TTS/Voiceover:** Not implemented
8. **Subtitle Generation:** Not implemented
9. **Thumbnail Generation:** Not implemented
10. **FFmpeg Stitching:** Not implemented
11. **Approval Workflow:** Not implemented
12. **Scheduling/Publishing:** Not implemented

## Q. Exact Blockers Preventing Horse App

1. **Document Upload:** Not implemented
2. **OCR:** Not implemented
3. **Document Understanding:** Not implemented
4. **Citations/References:** Not implemented

## R. Exact Blockers Preventing Songer App

1. **Music Generation:** Not implemented
2. **Instrumental Generation:** Not implemented
3. **Lyric Planning:** Not implemented

## S. Exact Blockers Preventing Religious App

1. **RAG over Documents:** Foundation exists but no UI
2. **Citations/References:** Not implemented
3. **TTS/Audio Output:** Not implemented

## T. Exact Blockers Preventing Message From Beyond App

1. **User Memory Import:** Not implemented
2. **TTS/Audio Playback:** Not implemented
3. **Consent/Identity Controls:** Not implemented
4. **Sensitive-Content Audit Trail:** Not implemented

## U. What Can Safely Wait Until Follow-Up

- Adult generation (explicitly on hold)
- Advanced video editing
- Voice cloning
- Deepfake detection
- Music stem splitting
- Real-time voice
- Advanced agent orchestration
- Fine-tuning workflows
- Batch processing

## V. Recommended PR Sequence to Finish the Central Platform

**Phase 0:** Dashboard Truth Cleanup (THIS PR)
**Phase 1:** Core Platform Contracts (App API keys, permissions, budgets, audit trail)
**Phase 2:** RAG/Memory/Brand Foundation (Document upload, Qdrant indexing, brand vault)
**Phase 3:** Marketing Generation Engine (Brand scrape, campaign planner, content calendar)
**Phase 4:** Media Pipeline (TTS, STT, subtitles, thumbnails, FFmpeg, long-form video)
**Phase 5:** Publishing Foundation (Social adapters, scheduling, webhooks)
**Phase 6:** Marketing App Thin Client
**Phase 7:** Horse, Songer, Religious, Message From Beyond Apps

## W. The Next Single Implementation PR to Do First

**Dashboard Truth + Marketing-First Capability Roadmap Panel**

This PR should:
1. Fix Studio Preview tab stale "Backend proof required" messaging
2. Make Preview show latest job result/artifact honestly
3. Make Assets tab real artifact list or remove/collapse it
4. Make Developer tab show real backend capability/proof/route status
5. Make Capability Library separate runtime proof from model catalog coverage
6. Add Marketing-first platform roadmap section
7. Keep Apps/Agents/Brand Library blocked with clear central-platform dependency language
