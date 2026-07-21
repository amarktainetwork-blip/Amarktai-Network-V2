## Batch A release candidate

Exact head: `d000dbec3a165dc368a009d2489235dfd3c3a4d4`

Provider policy is final:
- Runtime: GenX, Together, DeepInfra
- Coding only: Xiaomi MiMo
- Removed permanently: Groq

The canonical catalogue remains 68 capabilities. Adult remnants remain untouched during this batch and will only be removed in final cleanup after all standard replacements are complete.

## Batch A completed in code

### Step 1 — production activation correction
- exact-SHA deployment and rollback protection;
- MariaDB and artifact backups;
- isolated npm and Playwright caches;
- rollback-image pinning and safe unused-image cleanup;
- 16 GiB pre-build free-space gate;
- clean Nginx validation and HTTP/2 repair;
- duplicate disposable release-fixture build removed from the VPS deployment path;
- authoritative real-service fixture remains mandatory in GitHub CI.

### Step 2 — premium GenX routing and spend controls
- authenticated balance and account-tier pricing lookup;
- per-model cost estimation;
- GenX-only flagship routing;
- account-accessible route enforcement;
- known-pricing requirement;
- maximum-credit ceiling, retained reserve and explicit paid confirmation.

### Step 3 — full-song production
- Full Song Studio dashboard;
- Lyria 3 Pro full-song routing;
- original/user-owned lyrics;
- vocal and instrumental masters;
- durable jobs, credit preflight, playback and authenticated download.

### Step 4 — premium AmarktAI advert benchmark
- immutable six-scene 30-second plan;
- 2–4 flagship candidates per scene;
- premium narration and Lyria music;
- candidate scoring and winner selection;
- FFmpeg normalization, mix, subtitles and stream validation;
- final MP4 saved as a dashboard artifact;
- guarded paid terminal runner.

## Production failures found and fixed

- Worker image storage exhaustion: rollback remained active; host prep now protects live/rollback images, removes only unused images/cache and requires 16 GiB free.
- Compose interpolation: activation exports required build identity before its first read-only Compose command.
- Image-to-video fallback collision: same-execution fallbacks inherit durable provider authority through atomic compare-and-set; genuine competing claims remain blocked.
- Long-form assembly authority: assembly inherits and validates the parent `long_form_video` grant in durable metadata and BullMQ payload.
- Long-form internal dispatch: FFmpeg assembly bypasses provider routing and produces a stream/duration/component-validated final MP4.
- Production advisory: nested Crawlee `brace-expansion` raised narrowly from 2.1.1 to 2.1.2; exact install and production audit pass.

## Exact-head CI

Workflow run `29808954331` for `d000dbec3a165dc368a009d2489235dfd3c3a4d4`:
- locked dependency installation: passed;
- Prisma validation: passed;
- backend compilation: passed;
- complete unit and contract suite: passed;
- dashboard production build: passed;
- router/app, direct-provider, music and long-form static proofs: passed;
- deployment/Compose/shell validation: passed;
- production dependency audit and patch hygiene: passed;
- disposable MariaDB migration verification: passed;
- authoritative real-service API/worker/dashboard/browser fixture: passed (40/40).

## Remaining production gates
1. Deploy exact SHA `d000dbec3a165dc368a009d2489235dfd3c3a4d4` through the canonical activation wrapper.
2. Confirm exact API, worker and dashboard identities.
3. Complete strict live provider/capability proof with zero failures and zero skips.
4. Verify public HTTPS, administrator login, Studio and artifact preview/download.
5. Run the zero-generation premium advert plan and review exact GenX cost.
6. Run paid generation only with an explicit maximum-credit ceiling.
7. Inspect the advert before making any competitiveness claim.

Do not merge or claim production completion until every production gate passes.
