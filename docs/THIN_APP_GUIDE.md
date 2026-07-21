# Connect a thin app

Create the app in **Apps**, grant atomic and composite capabilities, choose each capability's routing policy, set budgets and webhooks, then create an API key. The raw key is shown once.

Install `@amarktai/sdk`, create `new AmarktAIClient({ apiKey })`, call `execute`, and poll `job`. Streaming chat uses `streamChat`, artifacts remain app-authorised, and completed jobs expose immutable route, usage, cost, validation, and fallback evidence.

## Ownership boundary

A thin app owns its product experience, domain records and business decisions. It collects the user's brief, chooses the desired outcome, stores domain-specific customer state, presents approvals and displays results. It does not own provider discovery, model selection, execution endpoints, retries, fallback, media assembly, quality evaluation, cost enforcement, artifact storage or execution evidence.

The AmarktAI Network owns those reusable powers. Apps request canonical capabilities and pass domain inputs or resource IDs. They must not send provider, model, route, executor, endpoint or provider credential fields. Orchestra selects execution under capability grants, quality policy, budget, provider health and model availability.

### Marketing App boundary

The Marketing App owns customer onboarding, campaign brief and strategy UX, audience/offer/channel decisions, marketing-calendar UX, CRM and lead context, social-account connection UX, human approval decisions and business performance reporting.

The Network owns authorised brand extraction, versioned Brand Profiles, research/RAG/memory, campaign and media execution, social-ad production, content repurposing, quality and candidate selection, secure connector execution, publishing receipts, artifacts, provenance, budgets and audit evidence. Brand Profiles and generated assets remain isolated by `appSlug` and are referenced by ID from the Marketing App.

## Webhooks

When an administrator configures a webhook, store the returned `webhookSigningSecret`; like the API key, it is shown only once. Terminal `job.completed` and `job.failed` requests are sent only to that exact configured HTTPS URL. Verify `X-AmarktAI-Signature` as HMAC-SHA256 over `<X-AmarktAI-Timestamp>.<raw request body>` using the signing secret, reject stale timestamps, and deduplicate with `X-AmarktAI-Event-Id` (also supplied as `Idempotency-Key`). A per-request `callbackUrl`, when supplied, must exactly match the configured endpoint.
