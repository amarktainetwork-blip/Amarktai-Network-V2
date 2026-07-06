# Backend Phase 1 Build Foundation Report

Branch: `fix/backend-workspace-build-contracts`
PR URL: https://github.com/amarktainetwork-blip/Amarktai-Network-V2/pull/23
Implementation commit opened as: `ec2a625995a76d1327934220f01a7b2712a002fe`

This PR makes the existing backend compile and validate. It does not add provider execution, Studio job submission, artifact delivery changes, or new capability behavior.

## Files Changed

- `package.json`
- `tsconfig.base.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/routes/jobs.ts`
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/src/adapters/rag-adapter.ts`
- `packages/core/package.json`
- `packages/db/package.json`
- `packages/providers/package.json`
- `packages/providers/tsconfig.json`
- `packages/artifacts/package.json`
- `packages/artifacts/tsconfig.json`
- `scripts/prisma-validate.mjs`
- `tests/phase1-contracts.test.js`
- `BACKEND_PHASE_1_BUILD_FOUNDATION_REPORT.md`

## Before Command Results

Baseline was run from latest `main` after PR #21 and PR #22 were merged.

| Command | Before result |
| --- | --- |
| `npm.cmd test` | Passed: 42 tests |
| `npm.cmd run build` | Passed: Next.js generated 22 routes |
| `npx.cmd prisma generate` | Passed: Prisma Client v5.22.0 generated |
| `npx.cmd prisma validate` | Failed as expected: P1012, missing `DATABASE_URL` at `prisma/schema.prisma:8` |
| placeholder `DATABASE_URL` + `npx.cmd prisma validate` | Passed |
| `npm.cmd run build --workspace=@amarktai/core` | Passed |
| `npm.cmd run build --workspace=@amarktai/db` | Passed |
| `npm.cmd run build --workspace=@amarktai/providers` | Passed after dependency outputs existed |
| `npm.cmd run build --workspace=@amarktai/artifacts` | Passed after dependency outputs existed |
| `npm.cmd run build --workspace=@amarktai/api` | Passed only after shared package `dist` outputs existed |
| `npm.cmd run build --workspace=@amarktai/worker` | Passed only after shared package `dist` outputs existed |
| `npm.cmd run lint --workspace=@amarktai/api` | Passed after shared package `dist` outputs existed |
| `npm.cmd run lint --workspace=@amarktai/worker` | Passed after shared package `dist` outputs existed |

Additional clean-output probe:

- After deleting ignored `dist` outputs, direct `npm.cmd run build --workspace=@amarktai/worker` failed because TypeScript resolved internal package imports through package `exports` pointing at missing `dist`.
- The same clean-output condition was the root risk for direct API and worker workspace checks from a fresh checkout.

## Root Cause

The internal workspace packages publish runtime exports through `dist`. That is correct for runtime, but TypeScript workspace checks for `apps/api` and `apps/worker` were also resolving package-name imports through those `dist` exports. From a clean checkout, those outputs do not exist yet.

API root cause:

- `apps/api` imports `@amarktai/core`, `@amarktai/db`, and `@amarktai/artifacts`.
- Its previous `tsc` script did not know how to build or resolve those workspaces from source.
- Direct API checks were therefore dependent on pre-existing generated package output.

Worker root cause:

- `apps/worker` imports `@amarktai/core`, `@amarktai/db`, `@amarktai/providers`, and `@amarktai/artifacts`.
- Its previous `tsc` script had the same generated-output dependency.
- RAG search-result mapping also now carries explicit `QdrantSearchResult` typing so the old implicit-any blocker cannot return.

## Fix Applied

Workspace build resolution:

- Added TypeScript project references from:
  - `packages/providers` to `packages/core`
  - `packages/artifacts` to `packages/core` and `packages/db`
  - `apps/api` to `packages/core`, `packages/db`, and `packages/artifacts`
  - `apps/worker` to `packages/core`, `packages/db`, `packages/providers`, and `packages/artifacts`
- Enabled `composite` in `tsconfig.base.json`.
- Added root `paths` mappings for internal package names so TypeScript can resolve source contracts while package runtime exports still point at `dist`.
- Changed backend workspace `build` scripts from `tsc` to `tsc -b`.
- Changed backend workspace `lint` scripts from `tsc --noEmit` to `tsc -b --noEmit`.

Backend build script:

- Added root `build:backend`.
- Build order is:
  1. `@amarktai/core`
  2. `@amarktai/db`
  3. `@amarktai/providers`
  4. `@amarktai/artifacts`
  5. `@amarktai/api`
  6. `@amarktai/worker`

Prisma validation:

- Added `scripts/prisma-validate.mjs`.
- Added root `prisma:validate`.
- The script sets `DATABASE_URL` to `mysql://audit:audit@localhost:3306/amarktai_audit` only when no real `DATABASE_URL` exists.
- It runs `prisma validate` only. It does not connect to a database, run migrations, run `db push`, or modify schema.

Trace ID:

- Replaced jobs route trace ID generation from `Math.random` to `node:crypto` `randomUUID()`.
- The route contract, auth, queue behavior, status behavior, and response shape were not changed.

RAG TypeScript:

- Added explicit `QdrantSearchResult` typing in `apps/worker/src/adapters/rag-adapter.ts`.
- No RAG behavior, Qdrant behavior, provider calls, or artifact behavior changed.

Tests:

- Added guardrails for:
  - job route source not using `Math.random`;
  - provider/model override fields remaining blocked;
  - no dashboard/Studio job submission API routes;
  - no Mimo or DeepInfra runtime execution adapters;
  - `build:backend` and `prisma:validate` scripts existing.

## After Command Results

| Command | After result |
| --- | --- |
| `npm.cmd test` | Passed: 47 tests |
| `npm.cmd run build` | Passed: Next.js generated 22 routes |
| `npm.cmd run prisma:validate` | Passed |
| `npx.cmd prisma generate` | Passed: Prisma Client v5.22.0 generated |
| `npm.cmd run build:backend` | Passed |
| `npm.cmd run build --workspace=@amarktai/core` | Passed |
| `npm.cmd run build --workspace=@amarktai/db` | Passed |
| `npm.cmd run build --workspace=@amarktai/providers` | Passed |
| `npm.cmd run build --workspace=@amarktai/artifacts` | Passed |
| `npm.cmd run build --workspace=@amarktai/api` | Passed |
| `npm.cmd run build --workspace=@amarktai/worker` | Passed |
| `npm.cmd run lint --workspace=@amarktai/api` | Passed |
| `npm.cmd run lint --workspace=@amarktai/worker` | Passed |
| clean-output `npm.cmd run build --workspace=@amarktai/api` | Passed |
| clean-output `npm.cmd run build --workspace=@amarktai/worker` | Passed |

Final verification was run before opening the PR.

## Behavior Confirmations

- Provider behavior unchanged.
- No provider calls added.
- No GenX, Groq, Together, Mimo, or DeepInfra execution was added.
- No Studio job submission added.
- No dashboard API job routes added.
- No artifacts behavior changed.
- No new capabilities added.
- No dashboard UX changed.
- No app, agent, or BrandPack wiring added.
- No MongoDB dependency or route added.
- No fake, mock, simulation, or generated-content stand-ins added.
- DeepInfra remains gated only and is not routed for normal traffic.
- Provider/model override blocking remains in place.

## Remaining Blockers

- Artifact URL generation and artifact serving route are still not aligned.
- Artifact serving still needs auth and app ownership checks.
- Hardcoded default admin bootstrap credentials still need replacement.
- Mimo remains contract/config only.
- DeepInfra remains gated backend-pending only.
- `music_generation` remains backend-pending.
- `avatar_generation` still routes through generic video behavior.
- Contact forwarding still references `/api/v1/contact`, which is not implemented in Fastify.
- No end-to-end job ingestion proof with DB and Redis has been added yet.
- No live provider path has been proven yet.

## Recommended Next PR

`fix: secure artifact URLs and ownership checks`

Recommended scope:

- Align stored artifact URLs with the serving route.
- Require API key or admin auth to read artifact files.
- Verify artifact app ownership.
- Add tests for completed, missing, failed/not-ready, unauthorized, and wrong-app artifact file access.
- Do not add provider execution in that PR.
