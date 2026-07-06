# VPS Phase 6F — Stored-Key Live Verification Report

**Branch:** `chore/vps-stored-key-live-verification`
**Commit:** `docs: record vps stored-key live verification`
**VPS path:** `C:\amarktai-agent\Amarktai-Network-V2` (local Windows dev machine)

## Latest Main Commit Confirmed

```
e6226d5 Merge pull request #32 from amarktainetwork-blip/feat/prove-stored-provider-key-live-execution
```

PR #32 is present in `git log --oneline -8`.

## Deployment Type

Local Windows development machine — not a VPS.

## Services Status

Not applicable — no Docker/systemd services running locally.

## Environment Variables

| Variable | Present |
|----------|---------|
| `DATABASE_URL` | false |
| `PROVIDER_KEY_ENCRYPTION_SECRET` | false |
| `JWT_SECRET` | false |

## Dashboard Provider Settings Verification

Not verified — no running dashboard service locally.

## DB Encrypted-Key Verification

Not verified — `DATABASE_URL` not set locally.

## Groq Stored-Key Live Proof

**Skipped.** `RUN_LIVE_STORED_PROVIDER_TESTS`, `DATABASE_URL`, and encryption secret not present.

```
[stored-key-live-proof] Skipped: RUN_LIVE_STORED_PROVIDER_TESTS not true, DATABASE_URL missing, PROVIDER_KEY_ENCRYPTION_SECRET/JWT_SECRET missing
```

## Together Provider-Client Proof

**Skipped.** Same reason as Groq.

## Together Full Artifact Proof

**Skipped.** Same reason as Groq.

## Artifact Route Verification

**Skipped.** No running API service locally.

## Disabled-Provider Env Fallback Verification

**Skipped.** No DB connection locally. Existing unit tests prove the contract:
- `provider-key-security-contract.test.js`: 21 tests pass
- `stored-provider-key-live-proof.test.js`: contract tests prove disabled row blocks env fallback

## Exact Command Results

| Command | Result |
|---------|--------|
| `npm test` | 301 passed, 5 skipped |
| `npm run build` | passed (9.6s, 23 pages) |
| `npm run prisma:validate` | passed |
| `npx prisma generate` | passed |
| `npm run build --workspace=@amarktai/api` | passed |
| `npm run build --workspace=@amarktai/worker` | passed |
| `npm run lint --workspace=@amarktai/api` | passed |
| `npm run lint --workspace=@amarktai/worker` | passed |
| `npx vitest run tests/stored-provider-key-live-proof.test.js` | 11 passed, 3 skipped |

## Security Confirmations

- [x] No raw keys printed
- [x] No ciphertext printed
- [x] No fake health/live status
- [x] No provider execution expansion
- [x] No dashboard/Studio changes

## Non-Goals Confirmation

- [x] No new provider capabilities
- [x] No GenX/Mimo/DeepInfra execution
- [x] No Phase 6G started

## Blockers

1. **No VPS access from this machine** — This is a local Windows dev environment, not the deployed VPS
2. **No DATABASE_URL** — Cannot verify DB-stored encrypted keys
3. **No PROVIDER_KEY_ENCRYPTION_SECRET/JWT_SECRET** — Cannot decrypt stored keys
4. **No running services** — Cannot verify dashboard, API, worker, or artifact routes

## What Needs to Happen on VPS

The live verification must run on the actual deployed VPS where:
- `DATABASE_URL` is set and points to the production DB
- `PROVIDER_KEY_ENCRYPTION_SECRET` or `JWT_SECRET` is set
- `AiProvider` table contains encrypted Groq and Together keys saved through dashboard
- API, worker, dashboard, DB, and Redis are running

### VPS Commands to Run

```bash
# 1. Sync repo
git checkout main && git pull origin main

# 2. Verify env (no values printed)
node -e "console.log('DATABASE_URL', !!process.env.DATABASE_URL); console.log('PROVIDER_KEY_ENCRYPTION_SECRET', !!process.env.PROVIDER_KEY_ENCRYPTION_SECRET); console.log('JWT_SECRET', !!process.env.JWT_SECRET);"

# 3. Run tests
npm test

# 4. Run stored-key live proof
RUN_LIVE_STORED_PROVIDER_TESTS=true npx vitest run tests/stored-provider-key-live-proof.test.js

# 5. Run full artifact proof (requires both flags)
RUN_LIVE_STORED_PROVIDER_TESTS=true RUN_LIVE_STORED_ARTIFACT_TESTS=true npx vitest run tests/stored-provider-key-live-proof.test.js
```

## Recommended Next Phase

Run this verification on the actual VPS with real DB and encrypted provider keys. No code changes needed — just environment verification.
