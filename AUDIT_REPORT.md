# AMARKTAI NETWORK V2 — COMPLETE ENGINEERING AUDIT
**Date:** 2026-07-02
**Auditor:** MiMo Code Agent

---

## EXECUTIVE SUMMARY

AmarktAI Network V2 is an enterprise AI orchestration platform with a well-designed 60+ model Prisma schema and clear architectural vision. **Current completion: ~25-30%.**

The production deployment runs a mock pipeline via a catch-all Next.js API route with MongoDB, bypassing the monorepo's Fastify API, BullMQ worker, Prisma ORM, and provider integrations.

**Key findings:**
- 60+ Prisma models designed, but MongoDB is the actual production database
- 4 AI providers defined (GenX, Groq, Together, MiMo) — 3 have implementations, MiMo is declaration-only
- 53 UI components installed — only 14 actively used
- Dashboard has 6 pages — 4 functional, 1 incomplete, 1 placeholder
- Mock pipeline generates deterministic fake artifacts (SVG, WAV, Markdown)
- Authentication works via JWT through Fastify proxy
- Nginx trailing-slash misconfiguration identified and fixed
- Critical security issues: hardcoded credentials, no auth on catch-all API, JWT in localStorage

---

## PHASE 1: REPOSITORY STRUCTURE

**Rating: GOOD**

```
Amarktai-Network-V2/
├── app/                    Next.js App Router
│   ├── api/[[...path]]/    Catch-all backend (MongoDB, 405 lines, mock mode)
│   ├── api/auth/login/     Login proxy → Fastify API
│   ├── api/contact/        Contact form handler
│   ├── dashboard/          6 pages (command-center, studio, app-gateway, brand-library, proof-runner, settings)
│   ├── login/              Login page
│   ├── about/, features/, pricing/, contact/  Static marketing pages
│   └── layout.js           Root layout (dark theme, Toaster)
├── apps/api/               Fastify API (TypeScript, 4 routes, 3 plugins)
├── apps/worker/            BullMQ worker (12 adapters)
├── packages/core/          Types, config, providers, capabilities, queue, auth, jobs
├── packages/db/            Prisma client singleton
├── packages/providers/     GenX, Groq, Together, Qdrant, embeddings clients
├── packages/artifacts/     Artifact storage manager
├── components/
│   ├── amarkt/             3 custom components (kit.jsx, particles.jsx, site-nav.jsx)
│   └── ui/                 48 shadcn/ui components (14 used, 34 unused)
├── lib/                    5 utility files
├── prisma/schema.prisma    1812-line schema, 60+ models
├── deploy/                 Nginx config, deploy/verify scripts
├── docker-compose.yml      6 services (MariaDB, Redis, Qdrant, API, Worker, Dashboard)
└── Dockerfile              Multi-stage, 4 targets (deps, build, api, worker, dashboard)
```

---

## PHASE 2: TECHNOLOGY STACK

| Layer | Designed | Actual (Production) |
|-------|----------|-------------------|
| Frontend | Next.js 15.5.19 + Tailwind + shadcn/ui | Same |
| Backend | Fastify 5.3 + Prisma + BullMQ | Next.js catch-all + MongoDB |
| Database | MariaDB 11 via Prisma | MongoDB via `mongodb` driver |
| Cache/Queue | Redis + BullMQ | Redis running, BullMQ built but not active |
| Vector DB | Qdrant | Running, RAG pipeline built |
| Auth | JWT HMAC-SHA256 + bcryptjs | Active via Fastify proxy |
| Voice | Groq TTS/STT | Built, not streaming |
| Providers | GenX, Groq, Together, MiMo | 3 implemented, MiMo declared only |

---

## PHASE 3: BACKEND AUDIT

### Fastify API Routes (apps/api/src/routes/)

| Route | Method | Status | Auth Required |
|-------|--------|--------|--------------|
| /health | GET | Working | No |
| /api/v1/auth/login | POST | Working | No (generates JWT) |
| /api/v1/auth/verify | GET | Working | Bearer token |
| /api/v1/jobs | POST | Implemented | API key |
| /api/v1/jobs/:id | GET | Implemented | API key |
| /api/v1/artifacts/:id/file | GET | Implemented | No |

### Worker Adapters (apps/worker/src/adapters/)

| Adapter | Capabilities | Provider | Live/Sim |
|---------|-------------|----------|----------|
| GroqTextAdapter | chat, reasoning, code, embeddings, reranking, research, multimodal, tool_use, structured_output | Groq | Live |
| GroqVoiceAdapter | tts, stt | Groq | Live |
| GroqVoiceAdapter | music_generation | — | Mock fallback |
| TogetherImageAdapter | image_generation, image_edit | Together AI | Live |
| GenxVideoAdapter | video_generation, avatar_generation | GenX | Live (polling) |
| RagAdapter | rag_ingest, rag_search | Together + Qdrant | Live |
| ScrapeAdapter | brand_scrape | Playwright | Built |
| TextSimulationAdapter | (fallback) | Mock | Mock |
| ImageSimulationAdapter | (fallback) | Mock | Mock |
| VideoSimulationAdapter | (fallback) | Mock | Mock |
| VoiceSimulationAdapter | (fallback) | Mock | Mock |

### Catch-All API (app/api/[[...path]]/route.js) — THE ACTUAL BACKEND

This 405-line file IS the running backend. It uses MongoDB directly, implements mock job processing via setTimeout chains, and has zero authentication.

| Endpoint | Method | Status | Auth |
|----------|--------|--------|------|
| /api/health | GET | Working | None |
| /api/capabilities | GET | Working | None |
| /api/providers | GET | Working | None |
| /api/stats | GET | Working | None |
| /api/events | GET | Working | None |
| /api/jobs | GET/POST | Working | None |
| /api/artifacts | GET | Working | None |
| /api/connections | GET/POST/DELETE | Working | None |
| /api/connections/:id/keys | POST | Working | None |
| /api/settings | GET/PUT | Working | None |
| /api/simulate | POST | Working | None |
| /api/seed | POST | Working | None |

---

## PHASE 4: FRONTEND AUDIT

### Dashboard Pages

| Page | Route | Functional | Backend | Real Data | Status |
|------|-------|-----------|---------|-----------|--------|
| Command Center | /dashboard/command-center | Yes | /api/health, /api/events | Partial (stats always 0) | Functional |
| Studio | /dashboard/studio | Yes | /api/jobs POST | Mock pipeline | Functional |
| App Gateway | /dashboard/app-gateway | Yes | /api/connections | MongoDB | Functional |
| Brand Library | /dashboard/brand-library | No | None | None | Placeholder |
| Proof Runner | /dashboard/proof-runner | Yes | /api/artifacts | MongoDB | Functional |
| Settings | /dashboard/settings | Partial | /api/settings PUT | Never loads existing | Incomplete |

### Public Pages

| Page | Route | Status |
|------|-------|--------|
| Landing | / | Static marketing, functional |
| About | /about | Static marketing |
| Features | /features | Static marketing |
| Pricing | /pricing | Static marketing |
| Contact | /contact | Form with API submission |
| Login | /login | Functional (JWT auth) |

### Components Usage

- **Actively used:** 14 of 53 (3 custom + 11 shadcn/ui)
- **Installed but never imported:** 39 shadcn/ui components
- **Dead code:** hooks/use-toast.js (replaced by sonner), hooks/use-mobile.jsx (never imported), lib/dataAccess.js (server-side, unused), app/providers.js (React Query wrapper, never mounted)

---

## PHASE 5: FRONTEND ↔ BACKEND WIRING

| Dashboard Feature | Frontend Component | API Endpoint | Backend | Status |
|------------------|-------------------|-------------|---------|--------|
| Login | app/login/page.js | POST /api/auth/login → Fastify | Prisma + bcrypt | Working |
| Health display | command-center/page.js | GET /api/health | Catch-all (MongoDB) | Working |
| Event feed | command-center/page.js | GET /api/events | Catch-all (MongoDB) | Working |
| Stats ticker | command-center/page.js | GET /api/stats | Catch-all | Broken (always 0) |
| Job creation | studio/page.js | POST /api/jobs | Catch-all (mock) | Working (mock) |
| Connections list | app-gateway/page.js | GET /api/connections | Catch-all (MongoDB) | Working |
| Artifact list | proof-runner/page.js | GET /api/artifacts | Catch-all (MongoDB) | Working |
| Settings save | settings/page.js | PUT /api/settings | Catch-all (MongoDB) | Partial (no load) |
| Brand packs | brand-library/page.js | None | None | Placeholder |
| Logout | dashboard/layout.js | None (localStorage clear) | None | Working |

---

## PHASE 6: DASHBOARD AUDIT

### Command Center
- **Purpose:** System overview with health, events, stats
- **Completion:** 70%
- **Issues:** Stats ticker hardcodes zeros (line 42-46), never fetches real job counts
- **Real data:** Health endpoint and events work; stats are mock

### Studio
- **Purpose:** Capability execution bench (text, image, video, voice, music, scrape, RAG)
- **Completion:** 80%
- **Issues:** All jobs go to mock pipeline; no real provider invocation from dashboard
- **Real data:** Jobs are created in MongoDB; artifacts are generated (mock)

### App Gateway
- **Purpose:** Manage connected external applications
- **Completion:** 60%
- **Issues:** Empty state only; "Connect App" links to /contact page
- **Real data:** Connections CRUD works

### Brand Library
- **Purpose:** Scraped brand intelligence repository
- **Completion:** 10%
- **Status:** Pure placeholder — always shows empty state

### Proof Runner
- **Purpose:** Artifact validation and download
- **Completion:** 70%
- **Issues:** No filtering, no search, no pagination
- **Real data:** Displays artifacts from MongoDB

### Settings
- **Purpose:** API credentials, model defaults, storage config
- **Completion:** 40%
- **Issues:** Form renders but never loads existing values on mount; saves work

---

## PHASE 7: AI PROVIDER AUDIT

### GenX
- **Configured:** Env var GENX_API_KEY + GENX_BASE_URL
- **Client:** genx-client.ts (213 lines) — submit/poll/download for video
- **Worker adapter:** GenxVideoAdapter — handles video_generation, avatar_generation
- **Streaming:** No (polling at 5s intervals, 10min timeout)
- **Status:** Built, not invoked from dashboard

### Groq
- **Configured:** Env var GROQ_API_KEY
- **Client:** groq-client.ts (275 lines) — chat, STT (Whisper), TTS (Orpheus)
- **Worker adapter:** GroqTextAdapter + GroqVoiceAdapter
- **Streaming:** No (standard fetch)
- **Status:** Built, most feature-rich provider

### Together AI
- **Configured:** Env var TOGETHER_API_KEY
- **Client:** together-client.ts (106 lines) — image generation + embeddings
- **Worker adapter:** TogetherImageAdapter
- **Streaming:** No
- **Status:** Built, handles images and RAG embeddings

### MiMo
- **Configured:** Declared in PROVIDER_KEYS, settings page has key input
- **Client:** NONE — no implementation exists
- **Worker adapter:** NONE
- **Status:** Declaration only, experimental placeholder

---

## PHASE 8: VOICE

- **TTS:** Groq Orpheus v1 English, 200-char chunking with WAV concatenation
- **STT:** Groq Whisper Large V3, multipart upload
- **Streaming:** None — standard HTTP round-trips
- **Realtime:** Socket.io installed but unused
- **Music:** No live provider — falls back to mock WAV generation
- **Dashboard:** Studio has Voice tab with TTS/STT execution

---

## PHASE 9: AGENT SYSTEM

**Not implemented.** No agent, planner, executor, or reasoning loop exists. The codebase has `tool_use` as a declared capability but no tool dispatch loop, no function calling, no ReAct pattern. The worker's `getAdapterForCapability()` is static routing, not dynamic planning.

---

## PHASE 10: BUILDER

**Not implemented.** No website builder, app builder, deployment pipeline, preview system, or publishing workflow exists in the frontend. The Prisma schema has `Campaign`, `CampaignItem`, `GeneratedAsset`, `PublishingSchedule` models — indicating the designed scope — but no frontend or backend code implements them.

---

## PHASE 11: WORKSPACE

- **Projects:** PlaygroundProject model exists in Prisma; no frontend
- **Files:** Local filesystem at /var/www/amarktai/storage
- **Artifacts:** Working — mock pipeline generates SVG, WAV, Markdown
- **Jobs:** Working — BullMQ queue built, mock setTimeout chain active
- **Memory:** MemoryEntry model in Prisma; no frontend; RAG pipeline built

---

## PHASE 12: AUTHENTICATION

- **JWT:** HMAC-SHA256 via Web Crypto API, bcryptjs password hashing
- **Cookies:** iron-session listed as dependency but never imported
- **Sessions:** localStorage-based (JWT stored client-side)
- **RBAC:** None — single admin role only
- **Middleware:** No Next.js middleware.ts for route protection
- **Dashboard guard:** Client-side only (localStorage check in layout.js)

---

## PHASE 13: DATABASE

### Prisma Schema (60+ models)

**Core:** AdminUser, Product, ApiKey
**App Intelligence:** AppIntegration, AppMetricDefinition, AppMetricPoint, AppEvent, VpsResourceSnapshot, DashboardWidgetConfig
**AI Providers:** AiProvider, ModelRegistryEntry, ModelDiscoveryCache, ProviderCapabilityMap, BudgetProfile, ProviderBudget
**Brain/Orchestration:** BrainEvent, MemoryEntry, AppAiProfile, AppAgent, AppAgentLearningLog, CapabilityRegistry
**Jobs/Pipeline:** AppConnection, AppApiKey, Job, UsageMeter, AppBudgetConfig
**Artifacts:** Artifact, BatchJob, BatchJobItem
**Workflows:** WorkflowDefinition, WorkflowRun
**Prompts:** PromptTemplate, PromptTemplateVersion, PromptABTest
**Content:** Campaign, CampaignItem, GeneratedAsset, AssetVersion, PublishingSchedule, PublishingResult, CampaignAnalytics, RecurringCampaignSchedule
**Video/Music:** VideoGenerationJob, MusicGenerationJob
**Voice/Avatar:** VoiceLibrary, AvatarLibrary, AssistantAvatarConfig
**Workspace:** WorkspaceConfig, WorkspaceSession, PlaygroundProject
**GitHub:** GitHubConfig, GitHubPushLog, RepoWorkspace, RepoTask, RepoPatch
**Assistant:** AssistantConversation, AssistantMessage, AssistantMemory
**Strategy:** AppStrategyRecord
**Webhooks:** WebhookRegistrationRecord, WebhookDeliveryRecord
**Healing:** HealingRecord
**Integration:** IntegrationConfig
**Intelligence:** AppIntelligenceProfile
**System:** SystemAlert, ManagerAgentLog
**Marketing:** ContactSubmission, WaitlistEntry
**Fine-Tuning:** FineTuneJob

**Actual database in production:** MongoDB (not MariaDB/Prisma)

---

## PHASE 14: DOCKER

| Service | Image | Ports | Health | Restart |
|---------|-------|-------|--------|---------|
| mariadb | mariadb:11 | 3306 | mariadb-admin ping | unless-stopped |
| redis | redis:7-alpine | 6379 | redis-cli ping | unless-stopped |
| qdrant | qdrant/qdrant:latest | 6333, 6334 | curl healthz | unless-stopped |
| api | amarktai/api:latest | 3001 | fetch /health | unless-stopped |
| worker | amarktai/worker:latest | — | process.exit(0) | unless-stopped |
| dashboard | amarktai/dashboard:latest | 3000 | fetch / | unless-stopped |

**Issues:** No USER directive (containers run as root), Redis/MariaDB/Qdrant exposed on host without auth, entrypoint uses --accept-data-loss on every boot.

---

## PHASE 15: SECURITY

### Critical Issues
1. Hardcoded admin credentials in server.ts, seed.ts, deploy scripts
2. Catch-all API has zero authentication on all endpoints
3. JWT stored in localStorage (XSS-exploitable)
4. No Next.js middleware for route protection
5. User input interpolated into SVG markup (stored XSS)

### High Issues
6. CORS origin: true reflects any origin
7. X-Frame-Options: ALLOWALL enables clickjacking
8. No rate limiting on login endpoint
9. Redis/MariaDB/Qdrant exposed on host without auth
10. --accept-data-loss on every container boot

### Medium Issues
11. Containers run as root
12. No CSP script-src directive
13. Error messages leak internal details
14. No HSTS header
15. MariaDB root password in healthcheck command

---

## PHASE 16: PERFORMANCE

- **Bundle size:** Not optimized (all shadcn/ui components imported regardless of usage)
- **API latency:** Mock pipeline ~4.5s per job (setTimeout chains)
- **Database:** MongoDB direct access, no connection pooling configuration
- **Caching:** No application-level caching; Next.js standalone serves pre-rendered pages
- **Streaming:** None implemented

---

## PHASE 17: CODE QUALITY

**Dead code:**
- hooks/use-toast.js (replaced by sonner)
- hooks/use-mobile.jsx (never imported)
- lib/dataAccess.js (server-side, unused)
- lib/constants/testIds/* (never referenced)
- app/providers.js (React Query wrapper, never mounted)
- 39 shadcn/ui components installed but never imported

**Duplicate code:**
- Two parallel backends (Fastify API vs catch-all route)
- Two database systems (Prisma/MariaDB vs MongoDB)
- Mock pipeline duplicates what worker adapters do

**Technical debt:**
- catch-all route is 405 lines of inline backend code
- No TypeScript in the Next.js app (all .js files)
- No linting enforcement
- No test coverage (empty tests/ directory)

---

## PHASE 18: BLUEPRINT COMPARISON

### Intended: AI Operating System
- Unified Aiva experience ❌ (no Aiva assistant frontend)
- Orchestration ❌ (static routing only)
- Autonomous execution ❌ (no agent loop)
- Workspace ❌ (no file editor, no project management)
- Memory ❌ (RAG built, no memory UI)
- Planning ❌ (no planner/solver)
- Provider abstraction ✅ (well-designed in packages/providers)
- Modular architecture ✅ (monorepo structure is sound)
- Scalability ⚠️ (Docker Compose, not Kubernetes)

---

## PHASE 19: MISSING FEATURES (Complete List)

### Critical Missing
1. Aiva AI Assistant frontend (chat interface)
2. Agent execution loop (planner → executor → verifier)
3. Real-time streaming (SSE or WebSocket)
4. Server-side authentication middleware
5. Workspace file editor
6. Project management system

### High Missing
7. Memory/knowledge UI
8. Voice conversation interface
9. Website builder
10. App builder
11. Deployment pipeline
12. GitHub integration frontend
13. Billing/usage dashboard
14. RBAC and permissions
15. Webhook management UI
16. Campaign management UI

### Medium Missing
17. Model catalog browser
18. Provider health dashboard
19. Fine-tuning UI
20. Batch processing UI
21. Prompt template editor
22. A/B testing UI
23. Analytics dashboard
24. Notification system
25. Audit log viewer

### Low Missing
26. Avatar library management
27. Voice library management
28. Strategy engine UI
29. Self-healing dashboard
30. Marketing automation UI
31. Publishing scheduler UI

---

## PHASE 20: RECOMMENDATIONS

### Critical Priority
1. **Unify backend** — Remove catch-all route, wire dashboard to Fastify API
2. **Add auth middleware** — Next.js middleware.ts for route protection
3. **Remove hardcoded credentials** — Use env vars exclusively
4. **Fix XSS vulnerabilities** — Sanitize SVG interpolation, add CSP

### High Priority
5. **Activate Prisma/MariaDB** — Migrate from MongoDB to designed schema
6. **Enable BullMQ worker** — Replace mock setTimeout pipeline
7. **Add streaming** — SSE for chat, job progress, voice
8. **Build Aiva frontend** — The central AI assistant interface

### Medium Priority
9. **Clean dead code** — Remove 39 unused components, dead hooks, unused libs
10. **Add tests** — Unit tests for providers, integration tests for API
11. **Implement workspace** — File editor, project management
12. **Add memory UI** — Long-term memory management interface

### Low Priority
13. **TypeScript migration** — Convert .js files to .ts/.tsx
14. **Bundle optimization** — Tree-shake unused components
15. **Add MiMo provider** — Implement actual client
16. **Marketing automation** — Campaign builder UI

---

## PHASE 21: ROADMAP (Optimal Implementation Order)

```
Phase 1: Foundation (Weeks 1-2)
├── Unify backend (remove catch-all, wire to Fastify)
├── Add Next.js auth middleware
├── Fix security issues (credentials, XSS, CORS)
└── Activate Prisma/MariaDB

Phase 2: Core Engine (Weeks 3-4)
├── Enable BullMQ worker with live providers
├── Add SSE streaming to API
├── Build Aiva chat frontend
└── Implement real-time job progress

Phase 3: Workspace (Weeks 5-6)
├── File editor with syntax highlighting
├── Project management (create, archive, search)
├── Artifact browser with preview
└── GitHub integration (push, PR, deploy)

Phase 4: Intelligence (Weeks 7-8)
├── Memory/knowledge UI
├── Agent execution loop
├── Prompt template editor
└── Provider health dashboard

Phase 5: Voice & Media (Weeks 9-10)
├── Voice conversation interface
├── Real-time TTS/STT streaming
├── Image/video generation UI
└── Music studio

Phase 6: Builder (Weeks 11-12)
├── Website builder
├── App builder
├── Deployment pipeline
└── Preview/publish system

Phase 7: Enterprise (Weeks 13-14)
├── RBAC and permissions
├── Billing/usage dashboard
├── Campaign management
├── Analytics dashboard
└── Webhook management
```

---

## PHASE 22: SCORING

| Subsystem | Score (1-10) | Notes |
|-----------|-------------|-------|
| Infrastructure | 7 | Docker Compose solid, Nginx configured, SSL working |
| Backend | 4 | Fastify well-built but not active; catch-all is mock |
| Frontend | 5 | Clean UI, good component library, but mostly placeholder |
| Dashboard | 4 | 6 pages, 4 functional, all connected to mock backend |
| Providers | 6 | 3 of 4 implemented, well-abstracted, no streaming |
| Voice | 3 | TTS/STT built but not streaming, no conversation UI |
| Workspace | 2 | Schema designed, no frontend |
| Memory | 2 | RAG pipeline built, no memory UI |
| Agents | 1 | No implementation |
| Builder | 0 | No implementation |
| Security | 3 | Critical vulnerabilities (hardcoded creds, no auth guard, XSS) |
| Performance | 4 | Mock mode, no optimization |
| Code Quality | 4 | Dead code, duplicate backends, no tests |
| Production Readiness | 3 | Runs but in mock mode with security gaps |

**OVERALL SCORE: 3.5 / 10**

**Estimated Completion: 25-30%**

---

## PRODUCTION BLOCKERS

1. Nginx trailing-slash misconfiguration (FIXED this session)
2. Hardcoded admin credentials in source code
3. Catch-all API has zero authentication
4. No server-side auth middleware
5. XSS vulnerability in SVG artifact generation
6. Mock pipeline instead of real provider invocation
7. MongoDB instead of designed MariaDB/Prisma schema

---

## WHAT WORKS TODAY

✅ Docker stack starts and runs
✅ Dashboard loads at https://amarktai.co.za
✅ Login authenticates via JWT
✅ Health endpoint returns status
✅ Studio creates mock jobs
✅ Proof Runner shows generated artifacts
✅ App Gateway shows connections
✅ Contact form submits
✅ Static marketing pages render
✅ SSL/HTTPS configured

## WHAT DOES NOT WORK

❌ Real AI provider invocation from dashboard
❌ Streaming responses
❌ Aiva assistant
❌ Agent execution
❌ Workspace/file editing
❌ Memory management UI
❌ Voice conversation
❌ Website/app builder
❌ Billing/usage tracking
❌ RBAC/permissions
