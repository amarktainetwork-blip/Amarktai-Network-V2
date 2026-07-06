# Backend Next Implementation Plan

This plan starts after the audit PR. It intentionally avoids merging provider-specific behavior before the backend can compile, validate, and prove a narrow job lifecycle.

## Non-Negotiable Guardrails

- Do not reintroduce simulation routes or local generated-asset stand-ins.
- Do not add MongoDB.
- Do not add legacy providers.
- Do not expose provider/model override fields to external apps.
- Do not route normal traffic to DeepInfra.
- Do not call a provider from Studio local state.
- Do not claim a capability is live until API, worker, DB, provider call, artifact persistence, and tests prove it.

## PR 1: Backend Workspace Build Foundation

Title:

`fix: make backend workspaces build and prove contracts`

Goal:

Make the current backend source compile and validate in local/CI commands before adding behavior.

Tasks:

1. Fix workspace TypeScript resolution for `@amarktai/core`, `@amarktai/db`, `@amarktai/artifacts`, and `@amarktai/providers`.
2. Add or adjust root scripts for dependency-ordered backend package builds.
3. Ensure `npm run build --workspace=@amarktai/api` passes from a clean checkout.
4. Ensure `npm run build --workspace=@amarktai/worker` passes from a clean checkout.
5. Ensure `npm run lint --workspace=@amarktai/api` passes.
6. Ensure `npm run lint --workspace=@amarktai/worker` passes.
7. Fix the RAG adapter implicit `any` TypeScript errors.
8. Add a CI-safe Prisma validation command with a placeholder MySQL `DATABASE_URL`.
9. Replace job trace `Math.random` with a production-safe ID generator.
10. Keep provider behavior unchanged.

Acceptance checks:

- `npm test`
- `npm run build`
- `npm run build --workspace=@amarktai/core`
- `npm run build --workspace=@amarktai/db`
- `npm run build --workspace=@amarktai/providers`
- `npm run build --workspace=@amarktai/artifacts`
- `npm run build --workspace=@amarktai/api`
- `npm run build --workspace=@amarktai/worker`
- `npm run lint --workspace=@amarktai/api`
- `npm run lint --workspace=@amarktai/worker`
- `DATABASE_URL=mysql://audit:audit@localhost:3306/amarktai_audit npx prisma validate`

Why first:

The API and worker cannot be safely changed while their own workspace checks fail.

## PR 2: Secure Artifact Delivery

Title:

`fix: secure artifact URLs and ownership checks`

Goal:

Make artifact persistence and file serving internally consistent and safe.

Tasks:

1. Decide one artifact URL source of truth:
   - Use artifact DB IDs in URLs; or
   - Create a dedicated storage-key route that intentionally supports nested keys.
2. Update `saveArtifact` and the serving route consistently.
3. Require app API key or admin auth before serving files.
4. Verify the artifact belongs to the authenticated app unless admin access is used.
5. Add tests for:
   - completed artifact served;
   - missing artifact returns 404;
   - failed/not-ready artifact returns 404 or 409;
   - wrong app cannot read another app artifact;
   - unauthenticated access is rejected.

Acceptance checks:

- Existing tests pass.
- New artifact route tests pass.
- No dashboard UX changes.
- No new provider calls.

## PR 3: Prove Job Ingestion Contract

Title:

`feat: prove app job ingestion contract`

Goal:

Prove `/api/v1/jobs` can create a real job and enqueue it with app authentication, without adding new provider behavior.

Tasks:

1. Add a test fixture/seed path for `AppConnection`, `AppApiKey`, and optional `AppBudgetConfig`.
2. Add integration tests for:
   - missing bearer token;
   - invalid API key;
   - inactive API key;
   - inactive app connection;
   - disallowed capability;
   - provider/model override rejection;
   - insufficient token balance;
   - successful job row creation;
   - successful BullMQ enqueue.
3. Confirm token decrement behavior.
4. Confirm daily budget behavior.
5. Document local MySQL/Redis prerequisites.

Acceptance checks:

- API tests prove DB and Redis integration.
- No provider calls occur in this PR.
- No artifacts are generated in this PR.

## PR 4: Prove First Live Provider Path

Title:

`feat: prove Groq chat job execution`

Goal:

Prove one narrow end-to-end provider path.

Capability:

`chat`

Path:

`POST /api/v1/jobs` -> DB job row -> BullMQ -> worker -> `GroqTextAdapter` -> text artifact -> job completed -> status polling.

Tasks:

1. Gate execution on `GROQ_API_KEY`.
2. Add a provider-disabled test path that fails clearly when the key is missing.
3. Add an opt-in live test script for real provider calls.
4. Save a text artifact through `packages/artifacts`.
5. Poll `GET /api/v1/jobs/:id` until completion.
6. Confirm provider and model fields are written by the worker, not by the caller.
7. Confirm external override fields remain rejected.

Acceptance checks:

- Normal tests run without live provider calls.
- Live provider proof runs only when explicitly enabled.
- Artifact is persisted and retrievable through the secured artifact route from PR 2.

## PR 5: Prove Together Image Generation

Title:

`feat: prove Together image artifact generation`

Goal:

Prove image generation with real binary artifact persistence.

Tasks:

1. Gate execution on `TOGETHER_API_KEY`.
2. Prove `image_generation`.
3. Do not claim `image_edit` until edit-specific semantics are implemented.
4. Persist real image artifacts.
5. Verify MIME, size, previewability, and ownership-secured retrieval.

## PR 6: Prove GenX Video Generation

Title:

`feat: prove GenX video job execution`

Goal:

Prove long-running provider jobs with polling.

Tasks:

1. Gate execution on `GENX_API_KEY`.
2. Prove `video_generation`.
3. Capture remote GenX job ID in metadata.
4. Poll without blocking other worker jobs beyond configured concurrency.
5. Persist real MP4 artifacts.
6. Do not claim avatar, music, image-to-video, or video edit unless those request shapes are separately implemented and tested.

## PR 7: Mimo Adapter

Title:

`feat: add Mimo coding and reasoning adapter`

Prerequisites:

- Official Mimo API request/response docs or verified working endpoint.
- Clear model defaults and error handling.
- No dashboard provider override controls.

Tasks:

1. Add Mimo client in `packages/providers`.
2. Add Mimo adapter in worker.
3. Route only approved coding/reasoning capabilities.
4. Add tests proving code/reasoning no longer silently route to Groq if Mimo is the intended source of truth.

## PR 8: DeepInfra Gated Lane

Title:

`feat: add DeepInfra gated text lane`

Prerequisites:

- Backend policy model for gated access.
- Admin approval or app-level entitlement field.
- Audit log for every gated request.
- Tests proving DeepInfra is excluded from normal flows.

Tasks:

1. Add `uncensored_text` or the chosen canonical gated capability to core.
2. Add backend gating checks before queueing.
3. Add DeepInfra client and adapter.
4. Add explicit audit logging.
5. Add tests for denied normal apps, allowed gated apps, and disabled provider config.

## Required Cross-Cutting Work

### Admin Bootstrap

Replace hardcoded default admin credentials with one of:

- explicit seed-only admin creation;
- env-supplied one-time bootstrap password;
- first-run setup flow disabled in production unless a bootstrap token is present.

### Provider Registry

Decide whether `AiProvider` and `ModelRegistryEntry` are the runtime source of truth.

If yes:

- Wire reads into API/worker.
- Add admin mutation path later.
- Add tests proving runtime does not use stale hardcoded provider/model choices.

If no:

- Keep them as future schema only and document that `packages/core` controls runtime routing for now.

### Usage Metering

`UsageMeter` is used for budget checks, but the worker does not yet appear to write successful provider usage back into usage metering. Add usage writes after first live provider proof.

### Webhooks

Jobs store `callbackUrl`, but callback delivery was not found in the worker processor. Add webhook delivery after job completion only after the first provider path is proven.

## Stop Conditions

Pause implementation and re-audit if any PR attempts to:

- add provider/model override fields;
- add broad provider routing before one narrow path is proven;
- make DeepInfra available to normal flows;
- generate local stand-in artifacts;
- change dashboard UX to hide backend gaps;
- reintroduce old provider names or MongoDB.

