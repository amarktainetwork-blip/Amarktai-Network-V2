# Backend Phase 6C - Secure Provider Keys Report

Branch: `feat/secure-provider-key-storage-runtime-resolver`
Implementation commit SHA: `427c8d2795fcfd2bcc46d161da426baf5c51b5d3`

## Scope

This phase adds secure server-side provider key storage and runtime key resolution. It does not add provider execution, Brain routing, dashboard UI, Studio changes, schema changes, fake health checks, or live provider checks.

## Files Inspected Before Coding

- `prisma/schema.prisma`
- `packages/core/src/config.ts`
- `packages/core/src/providers.ts`
- `packages/core/src/provider-routing.ts`
- `packages/providers/src/groq-client.ts`
- `packages/providers/src/together-client.ts`
- `apps/worker/src/providers/provider-executor.ts`
- `apps/api/src/server.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/plugins/jwt.ts`
- `apps/api/src/lib/auth-context.ts`
- existing provider/config/auth tests under `tests/`
- root, API, worker, providers, DB, and core package manifests

## What Was Implemented

- AES-256-GCM provider-key encryption and safe masking helpers in `@amarktai/core`.
- Canonical DB-backed provider credential resolver in `@amarktai/db`.
- DB-first runtime resolution with env fallback for local/dev proof compatibility.
- Optional injected `apiKey` support for the proven Groq chat and Together image provider clients.
- Worker executor injection of resolved keys before provider calls.
- Admin Fastify routes for provider credential list/save/clear.
- Focused tests for encryption, masking, resolver behavior, API safety, injected key execution, and existing Groq/Together preservation.

## Encryption Model

Provider keys are encrypted with Node `crypto` using AES-256-GCM. Each encrypted value uses a random 12-byte IV and stores:

`v1:<iv>:<tag>:<ciphertext>`

The encryption key is derived with SHA-256 from `PROVIDER_KEY_ENCRYPTION_SECRET`. `JWT_SECRET` is accepted as an existing server-secret fallback, but production should set `PROVIDER_KEY_ENCRYPTION_SECRET`.

Raw keys are never stored in `maskedPreview`, never returned by API responses, and never intentionally included in error strings.

## Runtime Resolution Order

`resolveProviderApiKey(providerKey)`:

1. Validates `providerKey` against the final provider IDs: `genx`, `groq`, `together`, `mimo`, `deepinfra`.
2. Looks up `AiProvider`.
3. If an enabled DB row has encrypted `apiKey`, decrypts and returns it with source `database`.
4. If no DB key exists, falls back to that provider's env var only.
5. If neither exists, throws a safe `ProviderConfigError`.
6. If a DB key exists but the provider is disabled, execution is blocked.

`getProviderCredentialStatus(providerKey)` returns safe status only: provider key, display name, enabled/configured booleans, source, masked preview, metadata, health fields, and no raw key or ciphertext.

## Admin Routes

Added:

- `GET /api/admin/providers`
- `PUT /api/admin/providers/:providerKey`
- `DELETE /api/admin/providers/:providerKey/key`

All routes require admin JWT auth through the existing Fastify JWT helper.

The routes return only safe provider status. They never return raw keys, decrypted keys, encrypted ciphertext, or `apiKey` fields.

Saving a non-empty `apiKey` encrypts it, stores `maskedPreview`, and sets `healthStatus` to `configured`. It does not mark a provider as `healthy` because no real health check is run in this phase.

Metadata updates without `apiKey` do not erase existing stored keys. Clear requests remove `apiKey` and `maskedPreview` safely.

## Intentionally Not Added

- No dashboard UI.
- No Studio changes.
- No schema changes.
- No new provider execution.
- No GenX, Mimo, or DeepInfra execution.
- No DeepInfra activation.
- No video, audio, music, or avatar execution.
- No fake provider health or fake live status.
- No final Brain routing changes.
- No provider/model selection by apps or Studio.

## Verification Results

Final command results:

- `npm.cmd test`: passed. Test files: 11 passed. Tests: 274 passed, 2 skipped.
- `npm.cmd run build`: passed. Next.js compiled successfully and generated 22 routes.
- `npm.cmd run prisma:validate`: passed. Prisma schema is valid.
- `npx.cmd prisma generate`: passed. Prisma Client v5.22.0 generated.
- `npm.cmd run build --workspace=@amarktai/api`: passed.
- `npm.cmd run build --workspace=@amarktai/worker`: passed.
- `npm.cmd run lint --workspace=@amarktai/api`: passed.
- `npm.cmd run lint --workspace=@amarktai/worker`: passed.

## Confirmations

- Groq chat execution remains covered and passes with injected resolved keys.
- Together image execution remains covered and passes with injected resolved keys.
- Env fallback remains available for development/proof compatibility.
- DB-backed keys take precedence over env fallback.
- Raw keys are not returned from status or admin routes.
- Ciphertext is not returned from status or admin routes.
- Saved key health status is `configured`, not fake `healthy`.
- DeepInfra remains gated.
- Phase 6C does not start final Brain routing.

## Blockers

No current code blockers. Live provider health was intentionally not tested or claimed.
