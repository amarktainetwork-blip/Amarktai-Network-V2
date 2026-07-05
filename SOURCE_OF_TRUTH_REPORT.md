# Source Of Truth Report

## Branch And Commit

- Branch: `main`
- Starting commit: `a461e94`
- Latest starting commit title: `Merge pull request #16 from amarktainetwork-blip/feat/frontend-ui-perfection`
- Working tree at audit start: clean clone of `origin/main`
- Source of truth: GitHub `main` for `https://github.com/amarktainetwork-blip/Amarktai-Network-V2.git`

## Provider List

Final provider IDs:

- `genx`
- `groq`
- `together`
- `mimo`
- `deepinfra`

DeepInfra is present in dashboard/static provider data, settings, mock provider displays, model catalog mocks, env example, and core provider keys. MiMo is active as the final coding/reasoning provider, not an experimental provider.

## Dashboard Contract

- Created `lib/dashboard-contract.js`.
- Contract exports provider contracts, dashboard pages, capabilities, studio modes, app connection fields, agent fields, artifact display fields, job display fields, settings sections, and open-source tool entries.

## Capability Map

- Created `lib/capability-map.js`.
- Dashboard capability keys now map to backend canonical keys.
- `video.longform` is explicitly marked missing because backend canonical capabilities do not currently include `long_form_video`.

## Mock And Catch-All Status

- Removed active root catch-all `app/api/[[...path]]/route.js`.
- Moved the old Mongo-backed fake artifact/job route to `app/api/simulation/[[...path]]/route.js`.
- Simulation artifact retrieval paths now point to `/api/simulation/artifacts/:id/download`.
- Production dashboard API alignment target is Fastify `/api/v1/*`.
- Added `/api/v1/health` alias to the Fastify health route while preserving `/health`.

## Files Changed

- `.env.example`
- `app/api/[[...path]]/route.js`
- `app/api/simulation/[[...path]]/route.js`
- `app/dashboard/capabilities/page.js`
- `app/dashboard/proof-runner/page.js`
- `app/dashboard/providers/page.js`
- `app/dashboard/settings/page.js`
- `app/dashboard/studio/page.jsx`
- `apps/api/src/routes/health.ts`
- `backend_test.py`
- `components/amarkt/SystemHealthCard.jsx`
- `lib/appdata.js`
- `lib/capability-map.js`
- `lib/dashboard-contract.js`
- `lib/useStudioStore.js`
- `packages/core/src/config.ts`
- `packages/core/src/index.ts`
- `packages/core/src/providers.ts`
- `packages/providers/src/groq-client.ts`
- `prisma/schema.prisma`
- `tsconfig.json`
- `CLEANUP_FINDINGS.md`
- `SOURCE_OF_TRUTH_REPORT.md`

## Build Result

- `npm.cmd install`: passed. Prisma Client generated. NPM reported one high-severity audit item.
- `npm.cmd run build`: passed after narrowing the root Next TypeScript scope so the dashboard build does not type-check unbuilt workspace packages.

## Tests Result

- `npm.cmd test -- --runInBand`: not supported by Vitest; failed with unknown option `--runInBand`.
- `npm.cmd test`: failed because no Vitest test files exist in the repo.

## Next Prompt Recommendation

Prompt 2 should finish the dashboard only.
