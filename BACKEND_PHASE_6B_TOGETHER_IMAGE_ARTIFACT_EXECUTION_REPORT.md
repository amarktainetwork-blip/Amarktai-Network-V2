# Backend Phase 6B - Together Image Artifact Execution Report

Branch: `feat/prove-together-image-artifact-execution`
Commit SHA: see PR head and final Codex summary. This report does not self-record a commit hash because amending the report changes the hash.
Provider proven: `together`
Capability proven: `image_generation`

## Exact Scope

This PR proves one new live-capable provider/capability path:

External app job ingestion -> BullMQ queue -> worker -> internal execution gate -> Together image generation -> existing artifact manager -> DB Job completion with a real artifact reference.

This PR does not add dashboard UX, Studio job submission, provider/model selection, new queues, new backend frameworks, schema changes, GenX execution, Mimo execution, DeepInfra execution, video/audio/music/avatar execution, or fake outputs.

## Brain Architecture Guardrail

The Phase 6B execution support map is a temporary proof gate only:

- `chat` is currently proven through `groq`.
- `image_generation` is currently proven through `together`.

This is not final Brain routing. The long-term Brain must keep provider/model selection internal and dynamic based on capability support, proven live status, provider health, cost tier, latency tier, quality tier, task complexity, context requirements, safety/policy requirements, user/app budget, fallback availability, output modality, and retry history.

Apps and Studio still cannot choose providers or models. Future Brain work must preserve multi-model orchestration, subtask routing, cheap reliable model use for simple subtasks, and stronger model use only where quality, reasoning, safety, or final review requires it.

## Files Changed

- `apps/worker/src/providers/provider-executor.ts`
- `apps/worker/src/processors/job-processor.ts`
- `tests/together-image-execution-contract.test.js`
- `tests/together-image-live-proof.test.js`
- `BACKEND_PHASE_6B_TOGETHER_IMAGE_ARTIFACT_EXECUTION_REPORT.md`

No dashboard, Studio, app UX, Prisma schema, API route, queue, or provider source-of-truth files were changed.

## Implementation

`provider-executor.ts` now has a narrow internal execution support map for proven paths only. It allows:

- `chat` -> `groq`
- `image_generation` -> `together`

For `image_generation`, the executor:

- requires Together config to be present before execution;
- ignores app-supplied provider/model fields;
- uses `TOGETHER_DEFAULT_IMAGE_MODEL`;
- calls `togetherGenerateImage`;
- requires a non-empty image `Buffer`;
- saves the first image through `saveArtifact`;
- returns `provider: "together"`, the internal model, `artifactId`, and safe JSON output metadata.

The worker completion path now writes `artifactId` only when an executor returns one. It also clears `error` on completion, keeps `progress: 100`, and stores safe output metadata.

## Artifact Contract

Artifact persistence uses the existing artifact manager:

- artifact type: `image`
- artifact subtype: `image_generation`
- provider: `together`
- model: Together result model, requested internally with `TOGETHER_DEFAULT_IMAGE_MODEL`
- data: `Buffer`
- MIME type: provider MIME, expected `image/png`
- storage URL: existing secured artifact URL contract from `saveArtifact`

Artifact storage field/path used:

- Artifact row `storagePath`: internal local storage path such as `artifacts/{appSlug}/image/...`
- Artifact row `storageUrl`: secured API URL such as `/api/v1/artifacts/{artifactId}/file`

Job output storage field used:

- Job `artifactId`: saved artifact ID
- Job `output`: safe JSON metadata containing artifact ID, artifact URL, MIME type, file size, width, and height

Raw base64 image data is not stored in Job output.

## Mocked Unit Proof

`tests/together-image-execution-contract.test.js` proves with mocked provider/artifact/DB boundaries:

- Together image execution requires `TOGETHER_API_KEY`.
- Together is called only for `image_generation`.
- The internal Together model is used.
- App-supplied provider/model overrides are ignored.
- Successful image buffers are parsed.
- Empty image arrays and empty buffers fail safely.
- HTTP/API failures fail safely and do not create artifacts.
- API keys are redacted from errors/results.
- Unit tests do not call the network.
- `chat` still executes through Groq only.
- `image_generation` executes through Together only, even when GenX is configured.
- GenX, Groq, Mimo, and DeepInfra do not execute for image jobs.
- DeepInfra remains gated.
- Non-image capabilities do not execute Together.
- `saveArtifact` receives a Buffer and canonical image artifact metadata.
- Worker updates Job to `processing`, then `completed` on success.
- Worker writes provider, model, artifactId, output metadata, progress 100, completedAt, and clears error.
- Worker marks failed and throws on Together error so BullMQ records failure.
- No artifact is created on provider failure or empty image output.

## Unmocked Live Harness

`tests/together-image-live-proof.test.js` is unmocked for provider calls. It imports the real Together provider client and only runs when both are true:

- `RUN_LIVE_TOGETHER_TESTS=true`
- `TOGETHER_API_KEY` is present

The local environment did not have `TOGETHER_API_KEY`, so the live proof skipped honestly.

Live proof command:

`RUN_LIVE_TOGETHER_TESTS=true npx vitest run tests/together-image-live-proof.test.js`

Local PowerShell equivalent run:

`$env:RUN_LIVE_TOGETHER_TESTS='true'; npx.cmd vitest run tests/together-image-live-proof.test.js`

Result:

- Test files: 1 passed
- Tests: 1 passed, 1 skipped
- Skip reason: `TOGETHER_API_KEY` missing

`DATABASE_URL` was also not present locally. The live provider proof intentionally avoids requiring local DB access so a missing database does not hide provider-client proof status.

## Verification Results

Commands run and exact results:

- `npm.cmd test`: passed. Test files: 9 passed. Tests: 251 passed, 2 skipped.
- `npm.cmd run build`: passed. Next.js compiled successfully and generated 22 routes.
- `npm.cmd run prisma:validate`: passed. Prisma schema is valid.
- `npx.cmd prisma generate`: passed. Prisma Client v5.22.0 generated.
- `npm.cmd run build --workspace=@amarktai/api`: passed.
- `npm.cmd run build --workspace=@amarktai/worker`: passed.
- `npm.cmd run lint --workspace=@amarktai/api`: passed.
- `npm.cmd run lint --workspace=@amarktai/worker`: passed.
- `$env:RUN_LIVE_TOGETHER_TESTS='true'; npx.cmd vitest run tests/together-image-live-proof.test.js`: passed with honest skip. Test files: 1 passed. Tests: 1 passed, 1 skipped.

## Confirmations

- Provider used: `together`
- Capability proven: `image_generation`
- Model used: `TOGETHER_DEFAULT_IMAGE_MODEL` (`black-forest-labs/FLUX.1-schnell-Free`)
- No provider/model user override added.
- No dashboard or Studio changes.
- No fake output.
- No fake artifacts.
- No raw base64 stored in Job output.
- No GenX execution for image jobs.
- No Groq execution for image jobs.
- No Mimo execution.
- No DeepInfra execution.
- Groq chat execution remains covered and passing.
- DeepInfra remains gated.
- Phase 6C was not started.

## Blockers

No code, test, build, Prisma, or lint blockers remain.

Live Together provider proof was skipped locally because `TOGETHER_API_KEY` was not present. Run the live proof in an environment with that key to prove the real provider response.

## Recommended Next Phase

If this PR is reviewed and merged cleanly, the next phase should be a narrow live-provider proof run in an environment with `TOGETHER_API_KEY`, or the next planned backend proof gate. Do not start Phase 6C from this PR.
