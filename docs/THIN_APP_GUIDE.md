# Connect a thin app

Create the app in **Apps**, grant atomic and composite capabilities, choose each capability's routing policy, set budgets and webhooks, then create an API key. The raw key is shown once.

Install `@amarktai/sdk`, create `new AmarktAIClient({ apiKey })`, call `execute`, and poll `job`. A route may be requested only when onboarding configured `app_selectable_allowlist`; Orchestra rejects every unapproved provider/model pair. Streaming chat uses `streamChat`, artifacts remain app-authorised, and completed jobs expose immutable route, usage, cost, validation, and fallback evidence.

When an administrator configures a webhook, store the returned `webhookSigningSecret`; like the API key, it is shown only once. Terminal `job.completed` and `job.failed` requests are sent only to that exact configured HTTPS URL. Verify `X-AmarktAI-Signature` as HMAC-SHA256 over `<X-AmarktAI-Timestamp>.<raw request body>` using the signing secret, reject stale timestamps, and deduplicate with `X-AmarktAI-Event-Id` (also supplied as `Idempotency-Key`). A per-request `callbackUrl`, when supplied, must exactly match the configured endpoint.
