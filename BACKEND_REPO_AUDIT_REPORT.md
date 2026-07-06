# Backend Repo Audit Report

Branch: `audit/backend-source-of-truth`
Base: latest `main` after merged PR #19 and PR #20
Scope: audit only. No backend routes, provider adapters, Prisma schema changes, job execution changes, provider calls, generated artifacts, or dashboard UX changes were implemented in this branch.

## Executive Summary

The repository has a real backend skeleton, not a placeholder-only dashboard. The source contains:

- A Fastify API in `apps/api/src/server.ts` with health, auth, jobs, and artifact routes registered at lines 72-75.
- A BullMQ worker in `apps/worker/src/worker.ts` that listens on the canonical jobs queue.
- Shared contracts in `packages/core`.
- Provider clients for GenX, Groq, and Together in `packages/providers`.
- Artifact storage and DB persistence in `packages/artifacts`.
- A MySQL Prisma schema with app connections, API keys, jobs, artifacts, budget config, and usage meter models.
- Docker Compose services for MariaDB, Redis, Qdrant, API, worker, and dashboard.

The backend is not yet production ready. The largest blockers are local workspace build failures for the API and worker, missing Mimo and DeepInfra execution adapters, artifact URL/auth gaps, hardcoded default admin credentials, and frontend-to-backend capability mismatches for several Studio modes.

## Source Of Truth

### Active Provider List

The canonical provider IDs are exactly:

`genx`, `groq`, `together`, `mimo`, `deepinfra`

Evidence:

- `packages/core/src/providers.ts:12` exports `PROVIDER_KEYS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']`.
- `tests/phase1-contracts.test.js:25` asserts core provider IDs are exactly the final five.
- `tests/phase1-contracts.test.js:40` asserts DeepInfra remains gated.

No active dependency named `mongodb` exists in root `package.json`. The old simulation route and old mock schema filename are already covered by tests at `tests/phase1-contracts.test.js:103`, `tests/phase1-contracts.test.js:107`, and `tests/phase1-contracts.test.js:117`.

### Active Capability List

The canonical backend capability keys live in `packages/core/src/capabilities.ts:29`. The current keys are:

`chat`, `reasoning`, `code`, `image_generation`, `image_edit`, `tts`, `stt`, `video_generation`, `music_generation`, `avatar_generation`, `embeddings`, `reranking`, `research`, `multimodal`, `tool_use`, `structured_output`, `brand_scrape`, `rag_ingest`, `rag_search`.

The dashboard-to-backend mapping is explicit in `lib/capability-map.js:4`. Several Studio modes are intentionally marked missing there, including long-form video, image-to-video, video edit/remix, campaign generation, social reel pack, app request, agent task, workflow automation, and gated uncensored text.

## Backend Architecture Map

### API

The API entrypoint is `apps/api/src/server.ts`.

Registered plugins:

- CORS and rate limiting: `apps/api/src/server.ts:61` and `apps/api/src/server.ts:62`.
- Redis, JWT, and global error handler plugins: `apps/api/src/server.ts:66` through `apps/api/src/server.ts:68`.

Registered routes:

- Health routes: `apps/api/src/server.ts:72`.
- Auth routes: `apps/api/src/server.ts:73`.
- Job routes: `apps/api/src/server.ts:74`.
- Artifact routes: `apps/api/src/server.ts:75`.

The API has the following route surface:

- `GET /health` and `GET /api/v1/health`: MariaDB, Redis, and Qdrant checks.
- `POST /api/v1/auth/login` and `GET /api/v1/auth/verify`: admin login and JWT verification.
- `POST /api/v1/jobs`: app API key authentication, capability validation, budget/token checks, job creation, queue push.
- `GET /api/v1/jobs/:id`: authenticated job status lookup scoped to app slug.
- `GET /api/v1/artifacts/:id/file`: artifact file streaming.

Next.js route handlers also exist:

- `app/api/auth/login/route.js:11` proxies login to Fastify `/api/v1/auth/login`.
- `app/api/contact/route.js:27` attempts to forward contact submissions to `/api/v1/contact`, but no Fastify contact route was found. It then accepts locally at `app/api/contact/route.js:43`.

### Job Ingestion

`apps/api/src/routes/jobs.ts:115` registers `POST /api/v1/jobs`.

Important behavior:

- Authenticates `Authorization: Bearer <KEY>` against `prisma.appApiKey`.
- Requires active API key and active app connection.
- Parses `allowedCapabilities` from `AppConnection`.
- Blocks provider/model override fields with `hasBlockedOverrides` at `apps/api/src/routes/jobs.ts:125`.
- Validates request bodies with `CreateJobRequestSchema` at `apps/api/src/routes/jobs.ts:134`.
- Checks daily budget with `prisma.usageMeter.aggregate`.
- Checks token balance using `TOKEN_COST_MULTIPLIER`.
- Creates a `Job` record at `apps/api/src/routes/jobs.ts:186`.
- Pushes a BullMQ job at `apps/api/src/routes/jobs.ts:222`.

Risk:

- Trace IDs are generated with `Math.random` at `apps/api/src/routes/jobs.ts:186`. This is not simulation behavior, but it should be replaced with `crypto.randomUUID()` or equivalent for production-grade traceability.

### Worker

`apps/worker/src/worker.ts` starts a BullMQ worker on the canonical queue. `apps/worker/src/processors/job-processor.ts:17` processes jobs.

Flow:

- Marks DB job as `processing` at `apps/worker/src/processors/job-processor.ts:25`.
- Routes by capability prefix at `apps/worker/src/processors/job-processor.ts:43`.
- Marks successful jobs as `completed` at `apps/worker/src/processors/job-processor.ts:54`.
- Marks failed jobs as `failed` at `apps/worker/src/processors/job-processor.ts:69`.

The adapter registry is in `apps/worker/src/adapters/index.ts:26` through `apps/worker/src/adapters/index.ts:31`.

Registered adapters:

- `GroqTextAdapter`
- `GroqVoiceAdapter`
- `TogetherImageAdapter`
- `GenxVideoAdapter`
- `ScrapeAdapter`
- `RagAdapter`

No Mimo adapter and no DeepInfra adapter are registered.

### Provider Clients

Provider client functions exist for:

- Groq chat, STT, and TTS: `packages/providers/src/groq-client.ts:47`, `packages/providers/src/groq-client.ts:95`, `packages/providers/src/groq-client.ts:133`.
- Together image generation: `packages/providers/src/together-client.ts:41`.
- Together embeddings: `packages/providers/src/embeddings-client.ts:25`.
- GenX video submit, poll, and download: `packages/providers/src/genx-client.ts:50`, `packages/providers/src/genx-client.ts:92`, `packages/providers/src/genx-client.ts:141`.

No Mimo client and no DeepInfra client were found.

### Database

Prisma uses MySQL:

- `prisma/schema.prisma:6` declares the datasource.
- `prisma/schema.prisma:7` sets `provider = "mysql"`.
- `prisma/schema.prisma:8` reads `DATABASE_URL`.

Key backend models found:

- `AdminUser`: `prisma/schema.prisma:11`
- `AiProvider`: `prisma/schema.prisma:191`
- `ModelRegistryEntry`: `prisma/schema.prisma:426`
- `Artifact`: `prisma/schema.prisma:921`
- `AppBudgetConfig`: `prisma/schema.prisma:966`
- `UsageMeter`: `prisma/schema.prisma:996`
- `AppConnection`: `prisma/schema.prisma:1750`
- `AppApiKey`: `prisma/schema.prisma:1771`
- `Job`: `prisma/schema.prisma:1786`

`AiProvider` and `ModelRegistryEntry` exist in schema, but no active `prisma.aiProvider` or `prisma.modelRegistryEntry` usage was found in `apps`, `packages`, `app`, or `lib`.

### Artifacts

Artifact persistence exists:

- `saveArtifact` writes files and creates DB rows in `packages/artifacts/src/manager.ts`.
- `getArtifactFile` loads by artifact ID at `packages/artifacts/src/manager.ts:94`.
- The Fastify file route calls `getArtifactFile(id)` at `apps/api/src/routes/artifacts.ts:12`.

Blocking mismatch:

- The storage driver generates `storageUrl` from the storage key at `packages/artifacts/src/storage.ts` rather than the DB artifact ID.
- The route expects an artifact ID at `apps/api/src/routes/artifacts.ts:12`.
- Because storage keys include nested slashes, the generated URL shape is not compatible with `/api/v1/artifacts/:id/file`.

Security gap:

- `GET /api/v1/artifacts/:id/file` does not authenticate or verify app ownership before serving artifacts.

### Deployment

Deployment files exist:

- `docker-compose.yml:11` starts services.
- MariaDB: `docker-compose.yml:13`.
- Redis: `docker-compose.yml:35`.
- Qdrant: `docker-compose.yml:52`.
- API: `docker-compose.yml:70`.
- Worker: `docker-compose.yml:99`.
- Dashboard: `docker-compose.yml:126`.
- `.env.example:11` includes `DATABASE_URL`.
- `.env.example:14` includes `REDIS_URL`.
- `.env.example:17` includes `QDRANT_URL`.
- `.env.example:45` and `.env.example:46` include dashboard API URL variables.

The Dockerfile builds shared packages before API and worker at `Dockerfile:40`. This is important because local workspace API/worker builds currently fail when those internal package outputs are absent.

## Current Blockers

1. API and worker workspace TypeScript builds fail locally.

   Commands run:

   - `npm run build --workspace=@amarktai/api`
   - `npm run build --workspace=@amarktai/worker`
   - `npm run lint --workspace=@amarktai/api`
   - `npm run lint --workspace=@amarktai/worker`

   Result:

   - API cannot resolve internal workspace packages such as `@amarktai/core`, `@amarktai/artifacts`, and `@amarktai/db`.
   - Worker cannot resolve `@amarktai/artifacts`, `@amarktai/db`, `@amarktai/providers`, and `@amarktai/core`.
   - Worker also reports implicit `any` issues in `apps/worker/src/adapters/rag-adapter.ts`.

   Likely root cause: app workspace TypeScript builds resolve package exports to `dist`, but local package build order/project references/path aliases are not wired for single-workspace builds. Docker builds packages first, but local and CI commands need a source-of-truth path too.

2. Prisma validation requires `DATABASE_URL`.

   `npx prisma validate` fails without `DATABASE_URL` because `prisma/schema.prisma:8` requires it.

   With a temporary MySQL URL, the schema validates:

   `DATABASE_URL=mysql://audit:audit@localhost:3306/amarktai_audit npx prisma validate`

3. Hardcoded default admin credentials exist.

   `apps/api/src/server.ts:27` and `apps/api/src/server.ts:28` define a default admin email/password. `ensureAdminExists` creates that account if no admin exists. This is not acceptable for production without an explicit one-time provisioning path and secret-based initial password.

4. Artifact URL generation and artifact serving are not aligned.

   Stored artifact URLs are based on storage keys; the serving route expects artifact IDs. The serving route also lacks app/API key authorization.

5. Mimo and DeepInfra are contracts/config only.

   Provider IDs and env key readers exist, but no provider clients or worker adapters were found for Mimo or DeepInfra. DeepInfra is correctly gated in dashboard contracts, but no backend enforcement/execution path exists.

6. Some accepted backend capabilities will fail or route incorrectly.

   - `music_generation` is accepted by core and routes to the voice prefix, but `GroqVoiceAdapter` throws a backend-pending error at `apps/worker/src/adapters/groq-voice-adapter.ts:29`.
   - `avatar_generation` routes to the video prefix and lands in `GenxVideoAdapter`, but no avatar-specific request contract or adapter behavior was found.
   - `research`, `multimodal`, `tool_use`, `structured_output`, `embeddings`, and `reranking` route to the Groq text adapter. Some may be acceptable as first-pass text outputs, but they are not specialized implementations.

7. Dashboard Studio has more modes than backend canonical capabilities.

   `lib/capability-map.js` correctly marks several modes as missing, including long-form video, image-to-video, video edit/remix, campaign content, social reel pack, app request, agent task, workflow automation, and gated uncensored text.

8. Contact route mismatch.

   Next.js contact attempts to forward to `/api/v1/contact`, but no Fastify contact route was found.

## Verification Results

Commands run on `audit/backend-source-of-truth` from latest `main`:

- `npm test`: passed. Vitest reported 49 passing tests.
- `npm run build`: passed. Next.js built successfully and generated 22 static routes.
- `npx prisma generate`: passed. Prisma Client generated successfully.
- `npx prisma validate`: failed without `DATABASE_URL`, expected for this schema.
- Temporary-env Prisma validation: passed with a MySQL `DATABASE_URL`.
- `npm run build --workspace=@amarktai/api`: failed on unresolved internal workspace package imports.
- `npm run build --workspace=@amarktai/worker`: failed on unresolved internal workspace package imports plus worker RAG implicit `any` errors.
- `npm run lint --workspace=@amarktai/api`: failed on the same unresolved imports.
- `npm run lint --workspace=@amarktai/worker`: failed on the same unresolved imports plus RAG implicit `any` errors.

## Recommended First Backend PR

The first real backend implementation PR should be:

`fix: make backend workspaces build and prove job contract`

Scope:

- Fix workspace TypeScript/source-of-truth build resolution for `packages/*`, `apps/api`, and `apps/worker`.
- Add a root script that builds shared packages and then API/worker in dependency order.
- Add CI-friendly backend checks:
  - `prisma validate` with a safe test `DATABASE_URL`.
  - API workspace build.
  - Worker workspace build.
  - Core/provider/artifact package builds.
- Fix the RAG implicit `any` TypeScript issues.
- Replace job trace `Math.random` with a deterministic production-safe ID generator.
- Do not add new providers or route behavior in this PR.

Reason:

The backend cannot be safely extended until the existing API/worker source compiles predictably outside the Dockerfile. This PR creates the clean foundation for subsequent provider and artifact work without changing user-facing behavior.

## Recommended Next PRs After Build Foundation

1. `fix: secure and align artifact delivery`

   - Change artifact URL generation to use artifact IDs or change serving route shape intentionally.
   - Authenticate artifact file access.
   - Verify app ownership.
   - Add tests for completed, missing, failed, and unauthorized artifact access.

2. `feat: prove app job ingestion with DB and Redis`

   - Add integration tests for API key auth, capability allowlists, budget/token checks, override rejection, DB job row creation, and queue push.
   - Use a test MySQL/Redis harness or clearly documented local service prerequisites.

3. `feat: wire first narrow live provider path`

   - Start with one narrow capability, likely Groq `chat` or Together `image_generation`.
   - Require real env key gating.
   - Persist artifacts.
   - Verify job lifecycle from API request to worker completion.

4. `feat: implement missing final-provider adapters`

   - Add Mimo runtime path for code/reasoning only after API docs and auth flow are confirmed.
   - Add DeepInfra gated runtime path only with explicit backend policy enforcement and audit logging.

