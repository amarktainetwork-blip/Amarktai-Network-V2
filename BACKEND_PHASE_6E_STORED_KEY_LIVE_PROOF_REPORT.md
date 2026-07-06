# Backend Phase 6E — Stored-Key Live Proof Harness Report

**Branch:** `feat/prove-stored-provider-key-live-execution`
**PR:** (see GitHub)
**Commit:** `feat: prove stored provider key live execution harness`

## Exact Scope

This phase creates a safe, narrow, repeatable live-proof harness for Groq chat and Together image generation using dashboard-stored encrypted keys from the database, not just environment variables.

## What This Proves

1. **Stored-key resolution contract:** `resolveProviderApiKey()` from `@amarktai/db` is the intended entry point for DB-stored keys
2. **DB-first precedence:** Encrypted DB keys resolve before env fallback
3. **Disabled provider blocks execution:** Even with env fallback available
4. **No raw key exposure:** Tests verify no raw keys or ciphertext in exports, outputs, or error messages
5. **Groq chat uses `chat` capability** with stored-key resolution
6. **Together image uses `image_generation` capability** with stored-key resolution
7. **Live proof skips honestly** when `RUN_LIVE_STORED_PROVIDER_TESTS` or DB/secret missing
8. **Full artifact proof available** when `RUN_LIVE_STORED_ARTIFACT_TESTS=true`

## What Remains Unproven

- Live Groq API call (skipped locally, requires `GROQ_API_KEY` in DB + `DATABASE_URL` + encryption secret)
- Live Together image generation (skipped locally, requires `TOGETHER_API_KEY` in DB + `DATABASE_URL` + encryption secret)
- Full artifact persistence through stored-key path (requires `RUN_LIVE_STORED_ARTIFACT_TESTS=true`)

## How the Harness Resolves Keys

1. `resolveProviderApiKey('groq')` queries `AiProvider` table for encrypted key
2. If DB row exists and enabled, decrypts key using `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET`
3. If DB row disabled, throws `ProviderConfigError('disabled')` — no env fallback
4. If DB row empty, falls back to `GROQ_API_KEY` env var
5. If both missing, throws `ProviderConfigError('missing-config')`

## Required Environment Variables

| Variable | Required For | Purpose |
|----------|-------------|---------|
| `DATABASE_URL` | All stored-key operations | Prisma DB connection |
| `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET` | Key decryption | AES-256-GCM decryption |
| `RUN_LIVE_STORED_PROVIDER_TESTS=true` | Live proof execution | Gates live provider calls |
| `RUN_LIVE_STORED_ARTIFACT_TESTS=true` | Full artifact proof | Gates artifact persistence test |

## Required DB State

`AiProvider` table must contain:
- Row with `providerKey='groq'`, `enabled=true`, `apiKey` = encrypted Groq key
- Row with `providerKey='together'`, `enabled=true`, `apiKey` = encrypted Together key

## Skip Behavior

When `RUN_LIVE_STORED_PROVIDER_TESTS` is not true:
```
[stored-key-live-proof] Skipped: RUN_LIVE_STORED_PROVIDER_TESTS not true, DATABASE_URL missing, PROVIDER_KEY_ENCRYPTION_SECRET/JWT_SECRET missing
```

When enabled but DB/secret missing: tests fail with safe error messages from `ProviderConfigError`.

## Live Commands

```bash
# Normal test run (skips live proofs)
npm test

# Run stored-key live proof (requires DB + secret + keys)
RUN_LIVE_STORED_PROVIDER_TESTS=true DATABASE_URL=<url> PROVIDER_KEY_ENCRYPTION_SECRET=<secret> npx vitest run tests/stored-provider-key-live-proof.test.js

# Run with full artifact proof
RUN_LIVE_STORED_ARTIFACT_TESTS=true DATABASE_URL=<url> PROVIDER_KEY_ENCRYPTION_SECRET=<secret> npx vitest run tests/stored-provider-key-live-proof.test.js
```

## Files Changed

| File | Change |
|------|--------|
| `tests/stored-provider-key-live-proof.test.js` | New: 14 tests (11 pass, 3 skipped live) |

## Test Results

```
npm test: 301 passed, 5 skipped (live proofs)
```

## Build Results

```
npm run build: passed (16.1s, 23 pages)
prisma validate: DATABASE_URL not set (expected locally)
npx prisma generate: passed
npm run build --workspace=@amarktai/api: passed
npm run build --workspace=@amarktai/worker: passed
npm run lint --workspace=@amarktai/api: passed
npm run lint --workspace=@amarktai/worker: passed
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
- [x] No video/audio/music/avatar execution
- [x] No Phase 6F started

## Blockers

- DATABASE_URL not set locally (prisma validate requires it)
- Live proof requires DB-stored encrypted keys + encryption secret

## Recommended Next Phase

Phase 6F: VPS live verification — run stored-key proof on VPS with real DB and encrypted provider keys
