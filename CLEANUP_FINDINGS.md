# Cleanup Findings

## Safe To Delete Now

- `workspace/artifacts/*` are generated simulation artifacts committed to the repo. They should not be part of production source of truth.
- `test_result.md` records old mock-route validation and should not be used as current deployment evidence.
- `AUDIT_REPORT.md` is historical audit context only. It still describes the old `/api/*` catch-all path and four-provider state.

## Keep For Dashboard Simulation

- `app/api/simulation/[[...path]]/route.js` keeps the old Mongo-backed fake job/artifact flow behind an explicit simulation route.
- `lib/mockSchemas.js` still drives the Studio form renderer for dashboard-only contract coverage.
- `backend_test.py` now targets `/api/simulation/*` and should be treated as a simulation smoke test, not production proof.
- `components/amarkt/SystemHealthCard.jsx` still uses local demo state for display while pointing its contract endpoint metadata at `/api/v1/health`.

## Keep For Backend Integration

- `apps/api/src/routes/*` are the Fastify backend route modules and should become the production dashboard integration target.
- `packages/core/src/capabilities.ts` remains the backend canonical capability source.
- `packages/core/src/providers.ts` now defines the final provider IDs: `genx`, `groq`, `together`, `mimo`, `deepinfra`.
- `packages/providers/src/*` contains live client/adaptor support that should be wired through the worker, not through the Next dashboard.
- `prisma/schema.prisma` remains the database schema and was only comment-aligned for provider examples.

## Must Not Deploy As Production

- `app/api/simulation/[[...path]]/route.js` fabricates SVG, WAV, and Markdown artifacts and must not be treated as real provider proof.
- `workspace/artifacts/*` are generated outputs and must not be used as production artifacts.
- Dashboard-local settings persistence in `app/dashboard/settings/page.js` is a frontend placeholder until a real Fastify `/api/v1/*` settings route exists.
- Historical claims in `AUDIT_REPORT.md` and `test_result.md` predate this cleanup and must not be used to claim the backend is live.

## Notes

- The ambiguous root catch-all route `app/api/[[...path]]/route.js` was removed from active production routing.
- Demo-only API behavior now lives under `/api/simulation/*`.
- Production dashboard integration should target Fastify `/api/v1/*` routes.
