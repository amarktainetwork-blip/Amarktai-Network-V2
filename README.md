# AmarktAI Network V2

AmarktAI Network V2 is the central capability platform used by the AmarktAI dashboard and thin external apps. Apps request a capability and supply business input. They do not choose provider credentials, raw provider endpoints, or unrestricted models. The platform validates policy, selects an eligible route, queues durable work when needed, persists proof and usage, and stores authorised artifacts.

## Canonical provider policy

The active provider policy is intentional:

- **GenX** — runtime execution for video, image-to-video, video-to-video, voice, transcription, music and supported text routes.
- **Together** — runtime execution for image generation and eligible text, embedding, reranking and audio routes.
- **DeepInfra** — runtime execution for text, streaming, specialist inference, embeddings, reranking and other account-accessible routes.
- **Xiaomi MiMo** — coding-agent tooling only. It is never selected by the production backend runtime.
- **Groq** — removed. It must not appear in runtime definitions, discovery, executors, environment templates, dashboard truth or release claims.

The canonical definitions live in `packages/core/src/providers.ts`. Provider status displayed by the API and dashboard must be projected from that source and persisted credential/health evidence.

## Platform architecture

- `app/` — Next.js website and administrator dashboard.
- `apps/api/` — Fastify API, authentication, Studio, app contracts, provider management, model discovery and runtime truth.
- `apps/worker/` — BullMQ execution, provider adapters, recovery, webhook delivery and long-form workflows.
- `packages/core/` — capability catalogue, Orchestra routing, executor registry, policy and workflow contracts.
- `packages/db/` — Prisma access, credentials, schema guards and durable workflow state.
- `packages/providers/` — provider transports and response normalisation.
- `packages/artifacts/` — persistent artifact storage and authorised delivery.
- `packages/sdk/` — thin-app client.
- MariaDB — durable application, job, proof, policy and artifact metadata.
- Redis — BullMQ queues and runtime coordination.
- Qdrant — retrieval/vector storage.
- FFmpeg — media validation and long-form assembly.
- Playwright — browser-backed workflows and release verification.

## Capability truth

`packages/core/src/capabilities.ts` contains the canonical 68-capability catalogue. Catalogue presence does not mean a capability is executable.

The production release candidate currently proves a smaller callable/durable release set derived from registered executors and workflows. A capability is ready only when all of the following are true:

1. its request and output contracts exist;
2. a compatible account-accessible model is discovered;
3. a provider client and executor are registered;
4. required credentials and infrastructure are available;
5. execution completes through the real API and worker;
6. output validation succeeds;
7. required artifacts are persisted and authorised;
8. live proof is stored.

Do not increase readiness counts manually and do not treat model catalogue entries as executable routes.

## Current release branch

The production candidate is maintained on:

```text
feat/production-activation-music-longform
```

Do not deploy an older `main` commit while this release branch remains unmerged. Production deployment must always pin an exact 40-character commit SHA and all running services must report that same SHA.

## Local validation

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

These checks prove code, contracts and the deterministic service fixture. They do **not** replace live provider proof.

## Production configuration

Copy `.env.example` to `.env`, replace every `CHANGE_ME` value and keep the file readable only by the deployment account.

Required production values include:

- MariaDB root and application passwords;
- `DATABASE_URL`;
- `JWT_SECRET`;
- a separate `PROVIDER_KEY_ENCRYPTION_SECRET`;
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`;
- `PUBLIC_API_URL` using HTTPS;
- GenX, Together and DeepInfra credentials, either from the environment or the encrypted provider registry;
- storage, Redis and Qdrant URLs.

MiMo credentials are not used by the backend runtime. Groq credentials must not be configured.

## Deployment paths

There are two different operational situations and they must not be confused.

### Healthy-stack upgrade

Use `deploy/deploy.sh` only when the current MariaDB, Redis, Qdrant, API, worker and dashboard are already healthy and the current release SHA can be used for rollback.

```bash
DEPLOY_SHA=<exact-origin-branch-sha> \
ADMIN_PASSWORD='<admin-password>' \
bash deploy/deploy.sh
```

The script validates the target SHA, creates backups, builds and tests the candidate, deploys Prisma migrations, starts the exact images, verifies build identity and runs strict live release proof.

### Broken or fresh-stack recovery

The current upgrade script deliberately refuses to overwrite an unhealthy or unidentified production stack. For a broken or fresh installation, first restore infrastructure and database access, then run the migration and service startup steps in `docs/PRODUCTION_MIGRATION_RUNBOOK.md`. Do not bypass preflight checks by deleting volumes or using `prisma db push`.

## Required live release gate

A production release is accepted only when all of these pass against the deployed public system:

- API, worker and dashboard health;
- identical build SHA across services;
- MariaDB, Redis, Qdrant, artifact storage and FFmpeg health;
- administrator login, token verification and logout;
- canonical provider and capability truth consistency;
- authenticated model discovery;
- live provider connection tests;
- every release capability submitted through the real API and worker;
- real artifact MIME, size, dimensions/duration and authorised range/download checks;
- fallback and app-grant enforcement;
- long-form scene, voiceover, subtitle, music-bed and final assembly proof when enabled;
- zero failed or skipped checks in strict mode.

The authoritative command is:

```bash
node scripts/proof-production-release-candidate.mjs \
  --base-url https://<public-dashboard-domain> \
  --strict \
  --long-form \
  --json-output /secure/path/release-proof.json
```

## Non-negotiable production rules

- Never run `prisma db push` in production.
- Never use `--accept-data-loss`.
- Never delete MariaDB, Redis, Qdrant or artifact volumes to solve a deployment error.
- Never expose provider/model selectors to ordinary apps or Studio.
- Never mark a provider or capability live from configuration alone.
- Never deploy an unpinned branch name without confirming the exact SHA.
- Keep database, artifact and Qdrant backups before migration or service replacement.
- Preserve the previous immutable images until post-deployment proof passes.

## Supporting documentation

- `docs/PRODUCTION_MIGRATION_RUNBOOK.md` — fresh/broken-stack database and service recovery plus production migration procedure.
- `docs/THIN_APP_GUIDE.md` — app onboarding, SDK, grants, webhooks and artifact authorisation.
- `docs/app-api-openapi.yaml` — thin-app API contract.

Historical PR descriptions and generated audit/model reports are evidence, not operating instructions. This README and executable scripts are the current operational entry points.
