# Backend Phase 2 Artifact Security Report

Branch: `fix/secure-artifact-urls-ownership`
PR URL: https://github.com/amarktainetwork-blip/Amarktai-Network-V2/pull/24
Implementation commit opened as: `c8729a3ccc32d138dd5f571fa5ff83e0f4f846c1`

This PR secures and aligns artifact retrieval only. It does not add provider execution, Studio job submission, artifact generation behavior, or new capabilities.

## Files Changed

- `packages/artifacts/src/storage.ts`
- `packages/artifacts/src/manager.ts`
- `packages/artifacts/src/index.ts`
- `apps/api/src/lib/auth-context.ts`
- `apps/api/src/routes/artifacts.ts`
- `tests/artifacts-contract.test.js`
- `BACKEND_PHASE_2_ARTIFACT_SECURITY_REPORT.md`

## Before Command Results

Baseline was run from latest `main` after PR #21, PR #22, and PR #23 were merged.

| Command | Before result |
| --- | --- |
| `npm.cmd test` | Passed: 47 tests |
| `npm.cmd run build` | First attempt timed out at 184 seconds; rerun with longer timeout passed and generated 22 routes |
| `npm.cmd run prisma:validate` | Passed |
| `npx.cmd prisma generate` | Passed |
| `npm.cmd run build:backend` | Passed |
| `npm.cmd run build --workspace=@amarktai/api` | Passed |
| `npm.cmd run build --workspace=@amarktai/worker` | Passed |
| `npm.cmd run lint --workspace=@amarktai/api` | Passed |
| `npm.cmd run lint --workspace=@amarktai/worker` | Passed |

## Current Artifact Flow Before Fix

1. Worker adapters call `saveArtifact`.
2. `saveArtifact` builds an internal storage key with:
   - `appSlug`
   - artifact type
   - current date
   - sanitized filename
3. `storage.put()` writes the file under `STORAGE_ROOT` and returns:
   - `storagePath`
   - `storageUrl`
   - MIME type
   - file size
4. Before this PR, `storageUrl` was generated from the storage key:
   - `/api/v1/artifacts/artifacts/{appSlug}/{type}/{date}/{filename}/file`
5. `saveArtifact` persisted that URL to `Artifact.storageUrl`.
6. The API file route was `GET /api/v1/artifacts/:id/file`.
7. The route passed `:id` to `getArtifactFile(id)`.
8. `getArtifactFile` loaded the artifact by DB ID, checked `status === completed`, read `artifact.storagePath`, and returned the file buffer.
9. The route had no admin JWT check, no app API key check, and no ownership check.
10. Protected artifact files used `Cache-Control: public, max-age=86400`.

## Root Causes

### URL mismatch

The storage driver only knows the storage key, not the DB artifact ID. It was incorrectly constructing a public API URL from the internal storage key. The serving route expects an artifact DB ID, so saved `Artifact.storageUrl` did not match the actual route contract.

### Auth and ownership gap

The artifact route served completed artifacts by ID without first authenticating the caller. It also did not compare the authenticated app connection to `Artifact.appSlug`, so an app API key ownership boundary could not be enforced.

## URL Alignment Fix

- `storage.put()` now returns storage details only and no longer creates a public API URL.
- `saveArtifact()` pre-generates the artifact ID with `crypto.randomUUID()`.
- `saveArtifact()` persists `storageUrl` as `/api/v1/artifacts/${artifact.id}/file`.
- `Artifact.storagePath` remains the internal local storage key.
- `Artifact.storageUrl` no longer exposes local storage key paths.
- Existing storage path traversal protection remains in the storage driver.

Pre-generating the ID is the smallest clean option because it avoids a second DB update and lets Prisma persist the canonical artifact URL in the original create call.

## Auth And Ownership Fix

- Added `apps/api/src/lib/auth-context.ts`.
- `authenticateArtifactAccess()` accepts:
  - admin JWT verified through the existing Fastify JWT mechanism;
  - active external app API keys backed by `AppApiKey` and active `AppConnection`.
- `canAccessArtifact()` allows:
  - admins to read any artifact;
  - apps to read only artifacts whose `Artifact.appSlug` matches the connection app slug.
- The jobs route auth behavior was not changed.
- Existing login behavior was not changed.
- Raw tokens are not logged or exposed.

## Route Behavior

| Case | Result |
| --- | --- |
| Missing or invalid auth | `401`, artifact existence is not checked first |
| Valid app key, artifact belongs to another app | `404` to avoid leaking existence |
| Artifact does not exist | `404` |
| Artifact status is not `completed` | `409`, `Artifact is not ready` |
| Artifact storage file is missing | `404`, `Artifact file not found` |
| Completed artifact + valid admin JWT | file response |
| Completed artifact + owning app API key | file response |
| Cache header | `private, max-age=3600` |
| Route identifier | artifact ID only; storage path is never accepted from the URL |

## Tests Added

Added `tests/artifacts-contract.test.js` covering:

- `saveArtifact` persists `/api/v1/artifacts/{artifact.id}/file`.
- public `storageUrl` does not contain `artifacts/{appSlug}/{type}/...`.
- internal `storagePath` still starts with `artifacts/`.
- auth helper accepts admin JWT context.
- auth helper accepts same-app API key context.
- app auth context cannot access another app slug.
- `getArtifactFile` refuses non-completed artifacts.
- `getArtifactFile` refuses missing storage files.
- route source requires auth before artifact lookup.
- route source returns 409 for not-ready artifacts.
- route source uses private cache, not public cache.
- route source does not define a storage-key wildcard route.
- no provider execution was added in touched runtime files.
- no Studio/dashboard job routes were added.
- no MongoDB dependency was added.
- final provider list remains exactly `genx`, `groq`, `together`, `mimo`, `deepinfra`.

DB-backed Fastify route integration tests are still a remaining gap because this repository does not yet include a reusable API test harness with isolated Prisma data and JWT/test key fixtures. This PR adds focused unit/source contract coverage without introducing a new database harness or auth framework.

## After Command Results

| Command | After result |
| --- | --- |
| `git status` | Showed only Phase 2 artifact-security files modified/untracked before commit |
| `npm.cmd test` | Passed: 53 tests |
| `npm.cmd run build` | Passed: Next.js generated 22 routes |
| `npm.cmd run prisma:validate` | Passed |
| `npx.cmd prisma generate` | Passed: Prisma Client v5.22.0 generated |
| `npm.cmd run build:backend` | Passed |
| `npm.cmd run build --workspace=@amarktai/api` | Passed |
| `npm.cmd run build --workspace=@amarktai/worker` | Passed |
| `npm.cmd run lint --workspace=@amarktai/api` | Passed |
| `npm.cmd run lint --workspace=@amarktai/worker` | Passed |

## Confirmations

- No provider execution added.
- No calls to GenX, Groq, Together, Mimo, or DeepInfra added.
- No Studio job submission added.
- No dashboard job routes added.
- No dashboard UX changed.
- No artifact generation behavior added.
- No new capabilities added.
- No MongoDB added.
- No fake, mock, simulation, or generated product data added.
- No S3, R2, MinIO, signed URL, range request, or artifact listing work added.
- DeepInfra remains gated only.
- Provider/model override blocking remains unchanged.

## Remaining Blockers

- No DB-backed Fastify route integration harness exists yet.
- Admin bootstrap credentials remain a separate production blocker.
- Contact forwarding still references `/api/v1/contact`, which is not implemented in Fastify.
- Mimo remains contract/config only.
- DeepInfra remains gated backend-pending only.
- `music_generation` remains backend-pending.
- `avatar_generation` still routes through generic video behavior.
- No end-to-end job ingestion proof with DB and Redis has been added yet.
- No live provider path has been proven yet.

## Recommended Next PR

`feat: prove app job ingestion contract`

Recommended scope:

- Add isolated API integration fixtures for `AppConnection`, `AppApiKey`, and optional `AppBudgetConfig`.
- Prove `/api/v1/jobs` auth, allowlist, override rejection, budget/token behavior, DB job row creation, and queue push.
- Do not add provider execution in that PR.
