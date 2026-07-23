# AmarktAI Network V2

AmarktAI Network V2 is the central AI capability platform for the AmarktAI dashboard and every connected product app.

An app describes the outcome it needs. The Network authenticates the app, enforces its grants and budgets, chooses an eligible provider and model, executes or queues the work, evaluates quality, stores artifacts and returns immutable evidence.

**Apps never choose providers, models, provider endpoints or provider credentials.**

This README is the primary operating and integration guide for humans and AI coding agents. Read it before changing this repository or connecting an app.

---

## 1. The system in one sentence

AmarktAI Network is a reusable capability layer: thin apps own their product experience and business decisions; the Network owns AI execution, routing, quality, safety, cost, persistence and proof.

---

## 2. Source-of-truth order

When instructions disagree, use this order:

1. Executable code and database schema on the current working branch.
2. `README.md` — architecture, app boundary, integration and operating rules.
3. `packages/core/src/capabilities.ts` — canonical 68-capability catalogue.
4. `packages/core/src/providers.ts` — canonical provider policy.
5. `packages/core/src/executor-registry.ts` and worker handler maps — executable route truth.
6. `docs/app-api-openapi.yaml` — thin-app HTTP contract.
7. `packages/sdk/` — supported TypeScript client contract.
8. Current pull request and exact-head CI evidence.
9. Runbooks under `docs/`.
10. Historical reports, generated audits and old PR descriptions — evidence only, never current operating instructions.

Do not create a second truth file that duplicates these rules.

---

## 3. Canonical provider policy

The runtime provider set is intentional and must not be expanded casually.

| Provider | Role |
|---|---|
| **GenX** | Runtime execution for supported video, image-to-video, video-to-video, voice, transcription, music and text routes. |
| **Together** | Runtime execution for supported image, text, embeddings, reranking, speech and transcription routes. |
| **DeepInfra** | Runtime execution for supported text, streaming, specialist inference, embeddings, reranking and multimodal analysis routes. |
| **Xiaomi MiMo** | Coding-agent tooling only. It is never a production backend execution provider. |
| **Groq** | Removed. It must not reappear in runtime definitions, discovery, executors, environment templates, dashboards or readiness claims. |

Rules:

- Provider definitions live in `packages/core/src/providers.ts`.
- Provider credentials are configured centrally and encrypted at rest.
- Provider/model selection belongs to Orchestra and the worker runtime.
- Apps, app SDKs and user-facing Studio screens must not expose ordinary provider/model selectors.
- A provider is not “live” because a key exists. Live status requires successful health/discovery/execution evidence.
- A discovered model is not executable merely because it appears in a catalogue.
- Do not hardcode a model ID when live account metadata and compatibility routing can select it.

---

## 4. Platform architecture

```text
Thin App / Dashboard
        |
        | Bearer app key or administrator JWT
        v
Fastify API (apps/api)
        |
        | validates app, capability, grants, budget and input contract
        v
MariaDB durable Job + immutable grant snapshot
        |
        v
Redis / BullMQ
        |
        v
Worker (apps/worker)
        |
        +--> Orchestra route selection
        +--> GenX / Together / DeepInfra
        +--> internal FFmpeg workflows
        +--> Qdrant / RAG workflows
        |
        v
Artifact storage + execution/quality/cost evidence
        |
        v
Authorised app response, polling, artifact delivery or webhook
```

Repository layout:

- `app/` — Next.js public site and administrator dashboard.
- `apps/api/` — Fastify API, auth, app contracts, Studio, grants, provider administration, discovery and runtime truth.
- `apps/worker/` — BullMQ processing, provider execution, durable recovery, quality engines, media workflows and webhook delivery.
- `packages/core/` — capabilities, provider policy, Orchestra, executor registry, schemas and reusable workflow contracts.
- `packages/db/` — Prisma schema/access, credentials, schema guards and durable workflow state.
- `packages/providers/` — provider transports, discovery adapters and response normalisation.
- `packages/artifacts/` — artifact persistence and authorised file delivery.
- `packages/sdk/` — thin-app TypeScript client.
- `prisma/` — MariaDB schema and migrations.
- `docs/app-api-openapi.yaml` — public thin-app API definition.
- `scripts/` — proof, validation and release utilities.
- `deploy/` — exact-SHA deployment and rollback tooling.

Infrastructure:

- **MariaDB** — apps, grants, jobs, usage, proofs, policies and artifact metadata.
- **Redis** — BullMQ and runtime coordination.
- **Qdrant** — vector retrieval storage.
- **Artifact storage** — generated and uploaded files, isolated by app authority.
- **FFmpeg/FFprobe** — media inspection, frame extraction, transcoding and assembly.
- **Playwright** — browser workflows and browser-level acceptance proof.

---

## 5. Capability truth and readiness

`packages/core/src/capabilities.ts` contains the canonical **68-capability catalogue**.

Catalogue membership does not equal production readiness.

A capability is executable only when all of the following are true:

1. Canonical request and output contracts exist.
2. The requesting app has an enabled capability grant.
3. A compatible account-accessible model is discovered or a valid internal executor exists.
4. A provider client and worker executor are registered.
5. Required credentials and infrastructure are healthy.
6. The request passes policy, isolation, rights and budget checks.
7. Work completes through the real API and worker path.
8. Output validation succeeds.
9. Required artifacts are persisted and authorised.
10. Usage, route, quality and fallback evidence are stored.
11. Required live proof passes.

Never:

- increase readiness counts manually;
- call catalogue entries “working” without executable proof;
- treat model discovery as execution proof;
- return mock/fixture evidence as live-provider evidence;
- mark a composite workflow complete because only one child capability works.

Apps must query their effective capability/policy endpoints rather than hardcoding a permanent readiness list.

---

## 6. The thin-app ownership boundary

### 6.1 What a thin app owns

A connected app owns:

- its user experience;
- customer onboarding;
- domain-specific records and relationships;
- collection of user intent and business inputs;
- selection of the desired **capability or outcome**;
- app-specific workflow screens;
- app-specific permissions before calling the Network;
- human approval and rejection decisions;
- displaying status, previews, evidence and results;
- business analytics and domain reporting;
- references to Network resources such as artifact, Brand Profile, memory or execution IDs.

Examples:

- The Marketing App decides the audience, offer, channel, campaign dates and approval decision.
- A Horse App stores horses, owners, medical history and stable records.
- A CRM stores leads, companies, pipelines and sales activity.
- An Education App stores learners, courses and enrolments.

### 6.2 What the Network owns

The Network owns reusable AI powers:

- provider and model discovery;
- provider credentials;
- routing and fallback;
- capability grants and policy enforcement;
- budgets and usage metering;
- durable jobs, retries and recovery;
- quality evaluation and candidate selection;
- reusable research, browser, memory and RAG execution;
- media inspection, transformation and assembly;
- reusable Brand Profiles, voice profiles and avatar profiles;
- artifact persistence and authorised delivery;
- webhook delivery and receipts;
- provenance, route, cost, validation and quality evidence;
- reusable publishing connector execution when enabled.

### 6.3 Forbidden app authority

A thin app must never send or control:

- `provider`;
- `model`;
- `route`;
- `executorId`;
- provider endpoint/base URL;
- provider API key;
- raw provider request bodies;
- an internal dashboard execution profile;
- fabricated quality scores or live-proof flags.

If an existing app contains these fields, remove them from its UI, API payloads, database authority and business logic.

---

## 7. Building a new app

Follow this sequence. Do not start by copying provider code into the app.

### Step 1 — define the app’s domain

Write down:

- the user roles;
- domain entities the app owns;
- user outcomes;
- which data remains in the app;
- which reusable resources should live in the Network;
- where human approval is required;
- expected artifacts and callbacks.

### Step 2 — map outcomes to canonical capabilities

Use canonical capability names from `packages/core/src/capabilities.ts`.

Prefer outcome-oriented app actions:

```text
“Create a 30-second product advert”
“Transcribe this customer call”
“Answer from this company knowledge base”
“Generate a product image”
“Create a voiceover”
```

Do not design actions around providers:

```text
“Run GenX model X”          # wrong
“Use Together endpoint Y”   # wrong
“Let the user pick a model” # wrong for ordinary apps
```

Composite business outcomes may require multiple canonical capabilities. The Network should own reusable orchestration; the app should not manually reproduce provider workflows.

### Step 3 — register the app centrally

In the administrator control centre:

1. Create the app record and unique `appSlug`.
2. Configure allowed origins if the app calls directly from a trusted browser environment.
3. Grant only required capabilities.
4. Configure each grant’s quality, fallback, budget, latency, artifact, memory and RAG policy.
5. Configure webhook URL when asynchronous notifications are needed.
6. Create an app API key.
7. Store the raw API key securely; it is shown once.
8. Store the webhook signing secret securely; it is shown once.

Never place provider credentials inside an app.

### Step 4 — install the SDK

```bash
npm install @amarktai/sdk
```

```ts
import { AmarktAIClient } from '@amarktai/sdk'

const network = new AmarktAIClient({
  apiKey: process.env.AMARKTAI_APP_API_KEY!,
  baseUrl: process.env.AMARKTAI_NETWORK_URL ?? 'https://network.amarktai.com',
})
```

Use the app key on a trusted server whenever possible. Do not expose long-lived keys in public client bundles.

### Step 5 — discover effective app authority

```ts
const capabilities = await network.capabilities()
const policy = await network.policy()
const usage = await network.usage()
```

Use these responses to enable or disable app features honestly. Do not assume every catalogue capability is currently granted or executable.

### Step 6 — submit a simple capability job

```ts
const created = await network.execute({
  capability: 'image_generation',
  prompt: 'Premium studio product photograph of a blue running shoe',
  input: {
    width: 1024,
    height: 1024,
  },
}) as { jobId: string }
```

The payload describes the desired output. It contains no provider or model field.

### Step 7 — poll durable status

```ts
const job = await network.job(created.jobId)
```

Treat the database job status as authoritative. Typical asynchronous states include:

```text
planned -> queued -> processing -> completed
                         |-> failed
                         |-> cancelling -> cancelled
```

Composite workflows expose additional phases such as quality analysis, human approval, assembly or publishing.

### Step 8 — retrieve authorised artifacts

```ts
const metadata = await network.artifact('artifact-id')
const response = await network.artifactFile('artifact-id', { download: true })

if (!response.ok) throw new Error(`Artifact download failed: ${response.status}`)
const bytes = new Uint8Array(await response.arrayBuffer())
```

Artifact rules:

- Apps may access only artifacts authorised for their `appSlug` or explicit shared-resource policy.
- Keep the bearer key in the `Authorization` header, never in a URL.
- Use HTTP Range requests for large audio/video previews.
- Do not copy internal storage paths into app records.
- Store the artifact ID and business relationship in the app.

### Step 9 — implement webhooks for long-running work

Webhook delivery is allowed only to the administrator-configured HTTPS URL.

Expected headers include:

```text
X-AmarktAI-Timestamp
X-AmarktAI-Signature
X-AmarktAI-Event-Id
Idempotency-Key
```

Verify HMAC-SHA256 over:

```text
<X-AmarktAI-Timestamp>.<raw request body>
```

using the stored webhook signing secret.

Node verification example:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyAmarktAIWebhook(input: {
  rawBody: Buffer
  timestamp: string
  signature: string
  secret: string
  nowMs?: number
}): boolean {
  const now = input.nowMs ?? Date.now()
  const timestampMs = Number(input.timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000) return false

  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.`)
    .update(input.rawBody)
    .digest('hex')

  const supplied = input.signature.replace(/^sha256=/, '')
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}
```

Also:

- reject stale timestamps;
- deduplicate by `X-AmarktAI-Event-Id`/`Idempotency-Key`;
- make webhook processing idempotent;
- fetch the job from the Network before making irreversible business changes;
- do not trust a per-request callback URL unless it exactly matches the configured endpoint.

### Step 10 — add app acceptance tests

At minimum prove:

- valid and invalid app authentication;
- denied capabilities return a stable 403 error;
- payloads contain no provider/model authority;
- jobs remain isolated by `appSlug`;
- artifacts remain isolated by `appSlug`;
- webhook signature, timestamp and replay protection;
- duplicate submissions or webhook deliveries are idempotent;
- cancellation behavior;
- budget enforcement;
- human approval gates for composite workflows;
- app UI does not claim completion before Network completion.

---

## 8. Updating an existing app to connect to the Network

Use this migration checklist.

### 8.1 Inventory the current app

Find all:

- direct provider SDK imports;
- provider API URLs;
- provider keys and environment variables;
- model selectors;
- hardcoded model names;
- generation endpoints;
- retry/fallback code;
- local AI usage/cost tables;
- generated-file storage;
- webhook/callback handlers;
- mock “AI completed” states;
- provider-specific database columns.

### 8.2 Classify each responsibility

Move these to the Network:

- provider calls;
- model selection;
- fallback;
- AI job queues;
- AI usage/cost metering;
- reusable quality scoring;
- generated artifact storage;
- generic transcription, generation, research, RAG and media execution;
- reusable connector execution.

Keep these in the app:

- domain entities;
- customer/business state;
- app-specific permissions;
- the user brief;
- business workflow screens;
- app-specific human decisions;
- references to Network job/resource/artifact IDs.

### 8.3 Replace direct calls

Before:

```ts
const result = await provider.generate({
  model: userSelectedModel,
  apiKey: process.env.PROVIDER_KEY,
  prompt,
})
```

After:

```ts
const result = await network.execute({
  capability: 'video_generation',
  prompt,
  input: {
    duration: 15,
    aspectRatio: '9:16',
  },
})
```

### 8.4 Remove app-side provider authority

Delete or de-authorise:

- provider/model dropdowns;
- provider API-key settings;
- provider status derived from app environment variables;
- direct provider fallback logic;
- provider/model columns used as user instructions;
- routes that proxy arbitrary provider payloads.

Provider/model may be displayed **after execution** as immutable evidence returned by the Network. It must not be a normal app request field.

### 8.5 Migrate generated files

New generated outputs must use Network artifact storage.

For historical files:

- retain the app’s existing records;
- migrate deliberately with ownership metadata when required;
- never fabricate Network artifact IDs;
- never point app users at private filesystem paths.

### 8.6 Migrate asynchronous state

Replace local “fire-and-forget” generation with:

- a stored Network `jobId` or composite `executionId`;
- polling or signed webhooks;
- app-side business state derived from Network status;
- explicit failure/retry/revision UX;
- human approval only at the correct Network phase.

### 8.7 Prove isolation before cutover

Use two app records and prove that neither can read the other’s:

- jobs;
- artifacts;
- Brand Profiles;
- memory namespaces;
- RAG namespaces;
- usage;
- execution status.

### 8.8 Remove old provider secrets

After cutover:

- revoke app-specific provider keys;
- remove secrets from app environments and CI;
- remove provider packages no longer needed;
- scan git history and secret stores according to the organisation’s incident procedure;
- retain only the AmarktAI app key and webhook secret in the app.

---

## 9. Composite workflow pattern

A composite workflow is more than a sequence of provider calls. It must be durable, resumable, policy-controlled and evidence-backed.

A correct composite workflow typically includes:

1. authenticated app request;
2. validated domain/resource references;
3. preflight of every capability grant required by later phases;
4. immutable grant snapshots stored before paid work;
5. parent job/execution record;
6. child jobs with deterministic trace and ownership metadata;
7. provider-neutral queue payloads;
8. quality/rights/safety gates;
9. candidate ranking where appropriate;
10. human approval at defined phases;
11. internal assembly or transformation;
12. final artifact validation;
13. usage, cost, route and provenance evidence;
14. final webhook/receipt;
15. idempotent resume and recovery behavior.

Do not hide an unfinished phase by returning `completed` early.

---

## 10. Marketing App integration

The Marketing App is a thin product app, not a second AI runtime.

### Marketing App owns

- customer and workspace UX;
- campaign brief and strategy decisions;
- audience, offer, channel and schedule choices;
- CRM/lead context;
- social-account connection UX;
- campaign calendar;
- human approval/rejection;
- business performance reporting.

### Network owns

- evidence-backed Brand Profiles;
- authorised brand/site extraction;
- reusable search, browser, RAG and memory execution;
- campaign/media execution;
- social-ad candidate generation;
- multimodal quality analysis;
- candidate selection;
- media variants, captions, thumbnails and delivery artifacts;
- social-copy generation and validation;
- publishing connector execution and receipts when enabled;
- artifacts, provenance, budgets and audit evidence.

### Brand Profiles

A Brand Profile is a versioned Network resource isolated by `appSlug`.

The app stores the `brandProfileId` and business relationship. The Network stores the reusable brand evidence, voice, visual rules, claims, prohibited claims, disclaimers, source evidence, confidence and rights declaration.

SDK methods:

```ts
await network.brandProfiles()
await network.brandProfile(brandProfileId)
await network.createBrandProfile(profile)
await network.updateBrandProfile(brandProfileId, profile)
await network.archiveBrandProfile(brandProfileId)
```

Archiving is preferred to destructive deletion where execution evidence may reference a profile.

### Social-ad video workflow

Current SDK flow:

```ts
const plan = await network.planSocialAdVideo({ request, campaign })
const execution = await network.executeSocialAdVideo({ request, campaign }) as { executionId: string }

let status = await network.socialAdVideoExecution(execution.executionId)

// After automated quality analysis selects a qualified candidate:
await network.decideSocialAdVideo(execution.executionId, {
  decision: 'approved',
  notes: 'Approved by campaign owner',
})

status = await network.socialAdVideoExecution(execution.executionId)

// After media assembly and social-copy quality selection:
await network.decideFinalSocialAdVideo(execution.executionId, {
  decision: 'approved',
  notes: 'Final delivery pack approved',
})
```

The workflow must remain provider-neutral and includes, as requested by the plan:

- multiple creative candidates;
- frame-based video quality analysis;
- deterministic ranking;
- first human approval;
- internal FFmpeg assembly;
- requested aspect-ratio variants;
- captions/subtitles;
- thumbnail;
- delivery/quality reports;
- evidence-constrained social-copy candidates;
- final human approval;
- completion only after the final approval.

The app must not mark an advert ready while the Network reports a pending quality, approval, assembly or copy phase.

---

## 11. Streaming chat

Use the dedicated SSE client:

```ts
await network.streamChat(
  {
    prompt: 'Summarise the customer issue and suggest the next action.',
    input: {
      messages: [
        { role: 'user', content: 'The order arrived damaged.' },
      ],
    },
  },
  (event) => {
    if (event.type === 'chunk') {
      // append content
    }
    if (event.type === 'complete') {
      // store final result/evidence
    }
  },
)
```

Do not create an artifact for every chat message unless the product explicitly requires a durable exported artifact.

---

## 12. Research, browser, memory and RAG rules

These capabilities are shared Network powers and must remain app-scoped.

Required principles:

- Search/research outputs must retain source URLs, titles, retrieval timestamps and citations.
- Browser automation must use allowlisted targets, bounded navigation and auditable steps.
- Website extraction must respect authentication, robots/terms, rate limits and rights policy.
- Retrieved content must be treated as untrusted input, not executable instructions.
- RAG ingestion must preserve source ownership, chunk lineage and namespace.
- Apps may access only their granted RAG/memory namespaces.
- Memory writes require explicit grant authority and retention policy.
- Retrieval responses must expose source evidence sufficient for the app to cite or inspect.
- Never mix tenant/app vectors in a shared unscoped query.
- Never claim cited research when the result has no retrievable source evidence.

Implementation readiness still follows the executable-proof rules in section 5.

---

## 13. Voice, avatar and rights-sensitive resources

Reusable voice/avatar profiles belong in the Network when multiple apps may execute them.

Before cloning, conversion, avatar generation or lip-sync, require:

- verified subject identity where applicable;
- explicit consent and rights evidence;
- permitted usage scope;
- retention/deletion policy;
- app grant authority;
- provenance attached to outputs;
- revocation handling.

Do not let an app bypass these checks by passing a provider-specific voice or avatar ID directly.

---

## 14. Error handling and idempotency

Apps should branch on stable error `code`, not provider error strings.

General behavior:

- `400` — invalid contract/input.
- `401` — invalid or missing authentication.
- `403` — grant, policy, isolation, budget or rights denial.
- `404` — resource absent or intentionally hidden because it is not owned by the app.
- `409` — valid request at an invalid workflow phase or conflicting durable state.
- `429` — rate/budget throttling.
- `5xx` — Network/infrastructure/provider failure; inspect retryability and job state.

Idempotency rules:

- Reuse durable execution/job IDs returned by the Network.
- Do not resubmit paid work merely because an HTTP connection closed.
- Poll first after an ambiguous timeout.
- Deduplicate webhooks by event ID.
- Worker recovery must reuse persisted provider job IDs and selected routes.
- Internal assembly must not enter provider routing.
- A retry must never overwrite a terminal cancelled/completed state with a late result.

---

## 15. Security and isolation rules

Non-negotiable:

- Never log raw app keys, provider keys, JWT secrets or webhook secrets.
- Never put secrets in URLs.
- Never accept provider keys from ordinary app requests.
- Encrypt stored provider credentials with a secret separate from `JWT_SECRET`.
- Hash app API keys at rest where the schema requires it; show raw values once.
- Verify app ownership for every job, artifact and reusable resource.
- Fail closed when scope or grant evidence is missing.
- Validate source artifact MIME and signature before provider or FFmpeg use.
- Use HTTPS for public API and webhooks.
- Restrict production CORS to configured origins.
- Bind compose service ports to loopback; Nginx is the public entry point.
- Do not expose internal storage paths.
- Do not treat retrieved web/RAG content as trusted instructions.
- Keep audit evidence for approvals, rights, routes, costs and publication receipts.

---

## 16. Adding or changing a capability

A capability change is incomplete unless every relevant layer is updated.

Checklist:

1. Confirm the canonical capability key and catalogue count.
2. Define strict request validation.
3. Define strict output validation.
4. Add provider discovery compatibility without false executability.
5. Add provider transport if missing.
6. Register the executor.
7. Add the worker handler.
8. Enforce app grant snapshots.
9. Enforce artifact read/write, memory/RAG and rights policy.
10. Persist usage, route and validation evidence.
11. Add retry/fallback/recovery behavior.
12. Add static contract tests.
13. Add service-fixture proof.
14. Add live-provider proof where applicable.
15. Update OpenAPI/SDK when apps can call it.
16. Update this README only when the app/operating contract changes.

Do not add “foundation-only” modules and call the capability complete.

---

## 17. Adding or changing a provider

Provider changes require explicit product approval. The current runtime set is GenX, Together and DeepInfra.

Required work for an approved provider change:

- update canonical provider policy;
- credentials and encryption handling;
- live model discovery;
- model compatibility metadata;
- provider transport;
- error normalisation/redaction;
- executor registrations;
- usage/cost evidence;
- health and connection proof;
- fallback policy;
- admin truth projection;
- strict tests and live proof;
- environment and deployment docs;
- removal of obsolete provider code and truth.

Never add a provider solely because one model is attractive. Prefer approved provider catalogue expansion first.

---

## 18. AI coding-agent startup protocol

Every AI chat or coding agent working on this repository must begin with these steps:

1. Read this entire README.
2. Inspect the current branch, open PR and exact head SHA.
3. Read `git status` and recent commits in the actual working copy when terminal access exists.
4. Do not clone another copy when an authorised working repository already exists.
5. Inspect executable code before trusting old reports or chat summaries.
6. Confirm the canonical provider policy.
7. Confirm the 68-capability catalogue is unchanged unless the task explicitly changes it.
8. Identify whether the task belongs to the app or the Network boundary.
9. Search for existing reusable code before creating another subsystem.
10. Preserve app isolation, immutable grants, provider-neutral requests and artifact authority.
11. Never claim “working”, “live”, “complete” or “ready” without the required proof.
12. Make focused code changes, add tests, run/build, commit and inspect CI.
13. Do not deploy until the complete candidate is green and an exact deployment SHA is approved.
14. Do not alter production data destructively.
15. Do not add Groq or make MiMo a backend runtime provider.
16. Do not add provider/model selectors to ordinary apps.
17. Do not remove governed legacy functionality until its approved replacement set is fully implemented and proven.
18. Keep dashboard/public-site redesign until backend contracts are stable and the design is agreed.

When connecting an app, follow sections 6–10 rather than inventing a new integration pattern.

---

## 19. Development and validation

Install and validate from the repository root:

```bash
npm ci
npm run prisma:validate
npx prisma generate --schema=./prisma/schema.prisma
npm run build:backend
npm test
npm run build
npm run audit
npm run proof
node scripts/proof-direct-provider-capabilities.mjs --static --strict
docker compose config
```

These checks prove code, contracts and deterministic service behavior. They do not replace live-provider or public production proof.

Before merging a major workflow, also prove:

- real MariaDB/Redis/Qdrant service fixture;
- job recovery and idempotency;
- app isolation;
- artifact preview/range/download;
- provider-neutral app payloads;
- quality and approval phases;
- no secret leakage;
- exact-head CI success.

---

## 20. Production configuration

Copy `.env.example` to `.env`, replace every `CHANGE_ME` and restrict file permissions.

Required production values include:

- MariaDB root and application passwords;
- `DATABASE_URL`;
- `JWT_SECRET`;
- a separate `PROVIDER_KEY_ENCRYPTION_SECRET`;
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`;
- `PUBLIC_API_URL` using HTTPS;
- Redis and Qdrant URLs;
- artifact storage configuration;
- GenX, Together and DeepInfra credentials through approved environment/bootstrap or encrypted registry flows.

MiMo is not a backend runtime credential. Groq must not be configured.

---

## 21. Deployment rules

Release branches and PR numbers change. Never rely on a README-pinned branch name as deployment truth.

Before deployment:

1. Identify the approved PR head.
2. Confirm exact-head CI and required fixture/live proof.
3. Record the exact 40-character SHA.
4. Preserve backups and the previous immutable images.
5. Deploy only that SHA.
6. Verify API, worker and dashboard all report that same SHA.
7. Run strict public proof.
8. Roll back if identity, health, login, provider truth, capability proof or artifact delivery fails.

Healthy-stack upgrade:

```bash
DEPLOY_SHA=<approved-exact-40-character-sha> \
ADMIN_PASSWORD='<admin-password>' \
bash deploy/deploy.sh
```

For a broken or fresh stack, follow `docs/PRODUCTION_MIGRATION_RUNBOOK.md` instead of forcing the healthy-stack script.

Never:

- run `prisma db push` in production;
- use `--accept-data-loss`;
- delete MariaDB, Redis, Qdrant or artifact volumes to repair a deployment;
- force-push or rebase a shared release branch;
- deploy a moving branch name without recording its exact SHA;
- remove previous images before post-deployment proof passes.

---

## 22. Required public release gate

A release is accepted only when all required checks pass against the deployed public system:

- API, worker and dashboard health;
- identical build SHA across services;
- MariaDB, Redis, Qdrant, artifact storage and FFmpeg health;
- administrator login, token verification and logout;
- canonical provider and capability truth consistency;
- authenticated model discovery;
- live provider connection tests;
- every release capability through the real API and worker;
- real artifact MIME, signature, size, dimensions/duration and authorised range/download checks;
- fallback, grant, budget and isolation enforcement;
- required quality and human approval gates;
- enabled composite workflow assembly proof;
- zero failed or skipped checks in strict mode.

Authoritative command:

```bash
node scripts/proof-production-release-candidate.mjs \
  --base-url https://<public-dashboard-domain> \
  --strict \
  --long-form \
  --json-output /secure/path/release-proof.json
```

---

## 23. Definition of done for an app connection

An app is connected only when:

- its app record and grants exist;
- its key authenticates;
- denied capabilities fail closed;
- requests contain no provider/model authority;
- simple and composite jobs complete through the real API/worker;
- status and webhook handling are durable and idempotent;
- jobs and resources are app-isolated;
- artifact preview/download works;
- usage and budgets are visible;
- route/model appear only as post-execution evidence;
- quality and approval gates are represented honestly in the UI;
- failure, cancellation and revision paths work;
- secrets are absent from client code and logs;
- acceptance tests pass.

---

## 24. Definition of done for a Network change

A Network change is complete only when:

- it respects the app/Network ownership boundary;
- it reuses canonical infrastructure rather than creating a duplicate subsystem;
- schemas, routing, worker execution and persistence agree;
- grant and isolation checks are immutable and fail closed;
- provider/model selection remains server-owned;
- quality and output validation are real;
- usage/cost/provenance evidence is durable;
- retries and recovery cannot duplicate paid work;
- unit, contract, build and fixture gates pass;
- live proof exists when the change claims live execution;
- docs/SDK/OpenAPI are updated when the public contract changes;
- no unsupported readiness claim is introduced.

---

## 25. Supporting documentation

- `docs/THIN_APP_GUIDE.md` — concise onboarding reference.
- `docs/app-api-openapi.yaml` — thin-app HTTP contract.
- `docs/PRODUCTION_MIGRATION_RUNBOOK.md` — fresh/broken-stack recovery and migrations.
- `packages/sdk/` — TypeScript client and tests.
- `packages/core/src/capabilities.ts` — canonical capability catalogue.
- `packages/core/src/providers.ts` — canonical provider policy.

This README is the first document every new AI chat, developer and app team should read.