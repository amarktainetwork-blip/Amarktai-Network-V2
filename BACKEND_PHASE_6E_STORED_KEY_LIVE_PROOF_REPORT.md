# Backend Phase 6E — Stored-Key Live Proof Harness Report

**Branch:** `feat/prove-stored-provider-key-live-execution`
**PR:** #32
**Commit:** `fix: separate Together provider-client proof from artifact proof`

## Exact Scope

This phase creates a safe, narrow, repeatable live-proof harness for Groq chat and Together image generation using dashboard-stored encrypted keys from the database.

## What This Proves

1. **Stored-key resolution contract:** `resolveProviderApiKey()` from `@amarktai/db` is the intended entry point for DB-stored keys
2. **DB-first precedence:** Encrypted DB keys resolve before env fallback
3. **Disabled provider blocks execution:** Even with env fallback available
4. **No raw key exposure:** Tests verify no raw keys or ciphertext in exports, outputs, or error messages
5. **Groq chat uses `chat` capability** with stored-key resolution via `executeWithProvider`
6. **Together provider-client proof** uses `togetherGenerateImage` directly with resolved key — generates image buffer only, no artifact saved
7. **Full artifact proof** uses `executeWithProvider` with `image_generation` — saves artifact through existing artifact manager
8. **Live proof skips honestly** when `RUN_LIVE_STORED_PROVIDER_TESTS` or DB/secret missing

## What Remains Unproven

- Live Groq API call (skipped locally)
- Live Together image generation (skipped locally)
- Full artifact persistence through stored-key path (requires both flags)

## How the Harness Resolves Keys

1. `resolveProviderApiKey('groq')` queries `AiProvider` table for encrypted key
2. If DB row exists and enabled, decrypts key using `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET`
3. If DB row disabled, throws `ProviderConfigError('disabled')` — no env fallback
4. If DB row empty, falls back to `GROQ_API_KEY` env var
5. If both missing, throws `ProviderConfigError('missing-config')`

## Proof Separation

| Proof | Flag(s) Required | Uses | Saves Artifact |
|-------|-----------------|------|----------------|
| Together provider-client | `RUN_LIVE_STORED_PROVIDER_TESTS=true` | `togetherGenerateImage` directly | No |
| Full artifact | `RUN_LIVE_STORED_PROVIDER_TESTS=true` + `RUN_LIVE_STORED_ARTIFACT_TESTS=true` | `executeWithProvider` | Yes |

## Required Environment Variables

| Variable | Required For | Purpose |
|----------|-------------|---------|
| `DATABASE_URL` | All stored-key operations | Prisma DB connection |
| `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET` | Key decryption | AES-256-GCM decryption |
| `RUN_LIVE_STORED_PROVIDER_TESTS=true` | Live proof execution | Gates live provider calls |
| `RUN_LIVE_STORED_ARTIFACT_TESTS=true` | Full artifact proof | Gates artifact persistence test |

## Live Commands

```bash
# Normal test run (skips live proofs)
npm test

# Stored-key live proof (provider-client only, no artifact)
RUN_LIVE_STORED_PROVIDER_TESTS=true DATABASE_URL=<url> PROVIDER_KEY_ENCRYPTION_SECRET=<secret> npx vitest run tests/stored-provider-key-live-proof.test.js

# Full artifact proof (both flags required)
RUN_LIVE_STORED_PROVIDER_TESTS=true RUN_LIVE_STORED_ARTIFACT_TESTS=true DATABASE_URL=<url> PROVIDER_KEY_ENCRYPTION_SECRET=<secret> npx vitest run tests/stored-provider-key-live-proof.test.js
```

## Files Changed

| File | Change |
|------|--------|
| `tests/stored-provider-key-live-proof.test.js` | Fixed: Together proof uses `togetherGenerateImage` directly, artifact proof uses `executeWithProvider` |
| `BACKEND_PHASE_6E_STORED_KEY_LIVE_PROOF_REPORT.md` | Updated: accurate proof separation |

## Exact Command Results

```
npm.cmd test: 301 passed, 5 skipped
npm.cmd run build: passed (9.1s, 23 pages)
npm.cmd run prisma:validate: passed
npx.cmd prisma generate: passed
npm.cmd run build --workspace=@amarktai/api: passed
npm.cmd run build --workspace=@amarktai/worker: passed
npm.cmd run lint --workspace=@amarktai/api: passed
npm.cmd run lint --workspace=@amarktai/worker: passed
npx.cmd vitest run tests/stored-provider-key-live-proof.test.js: 11 passed, 3 skipped
```

## Live Proof Status

**Skipped.** `RUN_LIVE_STORED_PROVIDER_TESTS`, `DATABASE_URL`, and encryption secret not present locally.

## Security Confirmations

- [x] No raw keys printed
- [x] No ciphertext printed
- [x] No fake health/live status
- [x] No provider execution expansion
- [x] No dashboard/Studio changes
- [x] DeepInfra remains gated

## Non-Goals Confirmation

- [x] No new provider capabilities
- [x] No new dashboard UI
- [x] No GenX/Mimo/DeepInfra execution
- [x] No schema changes
- [x] Phase 6F not started
