# VPS Phase 6F — Stored-Key Live Verification Report

**Status:** BLOCKED — Not on actual VPS

## Environment

- **Hostname:** `G` (local Windows machine, not VPS)
- **OS:** Windows
- **Repo path:** `C:\amarktai-agent\Amarktai-Network-V2`
- **Current main commit:** `e6226d5` (PR #32 merge confirmed)

## PR #32 Merge Confirmation

```
e6226d5 Merge pull request #32 from amarktainetwork-blip/feat/prove-stored-provider-key-live-execution
```

Confirmed present in `git log --oneline -5`.

## Blocker Details

This machine is NOT the actual VPS/deployed Linux server. It is a local Windows development machine.

| Requirement | Status |
|-------------|--------|
| Actual VPS | **NO** — local Windows machine |
| `DATABASE_URL` | Not set |
| `PROVIDER_KEY_ENCRYPTION_SECRET` | Not set |
| `JWT_SECRET` | Not set |
| Running API service | No |
| Running worker service | No |
| Running dashboard | No |
| Running DB | No |
| Running Redis | No |
| Encrypted provider keys in DB | Unknown (no DB access) |

## What Cannot Be Verified

1. Dashboard Provider Settings saving Groq/Together keys
2. DB stores encrypted keys
3. `resolveProviderApiKey` resolves from DB with `source: 'database'`
4. Groq stored-key live proof passes
5. Together provider-client proof passes
6. Full artifact proof passes
7. Disabled provider blocks env fallback
8. Artifact retrieval through secure route

## Local Verification Completed

| Check | Result |
|-------|--------|
| `npm test` | 301 passed, 5 skipped |
| `npm run build` | passed (9.6s, 23 pages) |
| `npm run prisma:validate` | passed |
| `npx prisma generate` | passed |
| API build/lint | passed |
| Worker build/lint | passed |
| Stored-key proof test | 11 passed, 3 skipped (no DB/secret) |

## Required for VPS Verification

1. Access to actual deployed VPS (Linux server)
2. `DATABASE_URL` environment variable set
3. `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET` set
4. `AiProvider` table with encrypted Groq and Together keys
5. API, worker, dashboard, DB, Redis running

## VPS Commands to Run

```bash
# 1. Verify environment (no values printed)
node -e "console.log('DATABASE_URL', !!process.env.DATABASE_URL); console.log('PROVIDER_KEY_ENCRYPTION_SECRET', !!process.env.PROVIDER_KEY_ENCRYPTION_SECRET); console.log('JWT_SECRET', !!process.env.JWT_SECRET);"

# 2. Run stored-key live proof
RUN_LIVE_STORED_PROVIDER_TESTS=true npx vitest run tests/stored-provider-key-live-proof.test.js

# 3. Run full artifact proof (both flags required)
RUN_LIVE_STORED_PROVIDER_TESTS=true RUN_LIVE_STORED_ARTIFACT_TESTS=true npx vitest run tests/stored-provider-key-live-proof.test.js
```

## Security Confirmations

- [x] No raw keys printed
- [x] No ciphertext printed
- [x] No fake health/live status
- [x] No provider execution expansion
- [x] No dashboard/Studio changes

## Non-Goals Confirmation

- [x] No new provider capabilities
- [x] No GenX/Mimo/DeepInfra execution
- [x] Phase 6G not started

## Recommended Next Step

Run this verification on the actual deployed VPS where `DATABASE_URL` and encryption secrets are configured.
