# Cleanup Findings

## Deleted From Production Source

- Deleted `app/api/simulation/[[...path]]/route.js`.
- Deleted the Mongo-backed dashboard data utility `lib/dataAccess.js`.
- Deleted `backend_test.py`, which targeted simulation endpoints.
- Deleted historical reports that claimed Mongo/mock behavior was production truth: `AUDIT_REPORT.md` and `test_result.md`.
- Deleted committed generated outputs under `workspace/artifacts/*`.
- Removed `mongodb` from active dependencies.
- Removed `mongodb` from Next server external packages.

## Kept As Real Contracts

- `lib/dashboard-contract.js` defines the final provider, dashboard, capability, settings, job, artifact, agent, app, and tool contracts.
- `lib/capability-map.js` maps dashboard capability keys to backend canonical capability keys and marks missing/planned backend support explicitly.
- `packages/core/src/providers.ts` locks provider IDs to `genx`, `groq`, `together`, `mimo`, and `deepinfra`.
- `.env.example` keeps keys for the final five provider contracts only.

## Remaining Backend-Pending Dashboard Areas

- Studio execution is disabled for non-chat generation until a real `/api/v1` execution route exists.
- Provider connection tests are disabled until real provider health/test endpoints exist.
- Provider model sync shows contract rows only until backend model catalog discovery exists.
- Proof Runner shows an empty backend-pending state until real job/artifact endpoints are wired.
- Settings save remains local-only until a real Fastify settings endpoint exists.
- System Health displays backend-pending status until it is wired to live `/api/v1/health` checks.
- App Gateway workspace creation remains client-side contract state until backend app/agent provisioning exists.

## Must Not Deploy As Production Proof

- No dashboard page should claim a provider is live without backend proof.
- DeepInfra is included as a final provider, but only as the gated/uncensored lane and fallback model infrastructure where explicitly allowed.
- MiMo is included as a final provider for coding/reasoning contracts.
- Open-source tools remain separate from AI providers: FFmpeg, Sharp, Piper, Redis, Qdrant, BullMQ, Playwright/local crawler, MinIO/local storage, SMTP.
