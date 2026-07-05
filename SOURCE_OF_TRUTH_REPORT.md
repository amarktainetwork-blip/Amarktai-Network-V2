# Source Of Truth Report

## Phase 1 Hard Cleanup

Phase 1 hard cleanup completed on branch `fix/phase-1-hard-cleanup-no-simulation`.

The repository no longer keeps a hidden fake backend, simulation route, Mongo mock API, fake artifact generator, fake provider tests, or committed generated proof artifacts.

## Provider List

Final provider IDs are locked to:

- `genx`
- `groq`
- `together`
- `mimo`
- `deepinfra`

No active provider contract includes HeyGen, Hugging Face, Qwen, MiniMax, Gemini, OpenAI, Anthropic, Replicate, Lyria, or old provider lists.

## DeepInfra Role

DeepInfra remains included as a final provider.

DeepInfra is modelled as the gated/uncensored provider lane and fallback model infrastructure where explicitly allowed. It is not silently mixed into normal safe flows. The dashboard capability `uncensored.text` is mapped as missing/planned backend key `uncensored_text` until backend gating exists.

## MiMo Role

MiMo remains included as a final provider.

MiMo is modelled as the final coding/reasoning provider contract and remains backend-pending until real provider proof exists.

## Simulation And Mongo Cleanup

- `/api/simulation` is gone.
- `app/api/simulation/[[...path]]/route.js` was deleted.
- The old root catch-all production-looking backend remains absent.
- `lib/dataAccess.js` was deleted.
- `mongodb` was removed from active dependencies.
- `next.config.js` no longer declares MongoDB as a server external package.
- Historical Mongo/mock proof reports were removed.

## Generated Artifacts

Generated fake SVG, WAV, and Markdown artifacts under `workspace/artifacts/*` were removed.

`.gitignore` now ignores generated workspace artifacts and uploads so they are not committed again.

## Dashboard Contract

- `lib/dashboard-contract.js` remains the dashboard contract source for providers, pages, capabilities, studio modes, app fields, agent fields, jobs, artifacts, settings sections, and open-source tools.
- `lib/capability-map.js` remains the dashboard-to-backend capability map.
- `video.longform` remains missing/planned until backend canonical `long_form_video` support exists.
- `uncensored.text` remains missing/planned until backend canonical `uncensored_text` support and gating exist.

## Verification

- `npm install`: passed. Prisma Client generated. NPM still reports one high-severity audit item.
- `npm run build`: passed. Next route output no longer includes `/api/simulation`.
- `npm test`: passed. Vitest reports 1 test file and 22 tests passing.

## Next Step

Prompt 2 should finish the dashboard only.
