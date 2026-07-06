# Backend Provider Readiness Matrix

Active provider policy: only `genx`, `groq`, `together`, `mimo`, and `deepinfra` are in scope.

Status key:

- `wired`: source includes provider client and worker adapter path.
- `partial`: source includes some runtime path but not the full claimed capability set.
- `contract_only`: provider appears in contracts/config but has no runtime client or adapter.
- `gated_pending`: provider is intentionally gated and not active in normal flows.

## Matrix

| Provider | Canonical ID | Contract present | Env key reader | Client found | Worker adapter found | Actual backend capabilities found | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GenX | `genx` | Yes | `GENX_API_KEY` | Yes | Yes | `video_generation`; generic path also receives `avatar_generation` | `partial` | Video submit/poll/download exists. No music path found. Avatar is routed through generic video behavior. |
| Groq | `groq` | Yes | `GROQ_API_KEY` | Yes | Yes | `chat`, `reasoning`, `code`, generic text, `tts`, `stt` | `wired` | Text and voice paths exist. Some text-like capabilities are generic prompt behavior, not specialized engines. |
| Together | `together` | Yes | `TOGETHER_API_KEY` | Yes | Yes | `image_generation`, `image_edit`, embeddings for RAG | `partial` | Image path exists. Image edit appears routed through generation-style request. Embeddings power RAG. |
| Mimo | `mimo` | Yes | `MIMO_API_KEY` | No | No | None | `contract_only` | Dashboard labels it coding/reasoning provider, but backend routes code/reasoning to Groq today. |
| DeepInfra | `deepinfra` | Yes | `DEEPINFRA_API_KEY` | No | No | None | `gated_pending` | Correctly kept gated/uncensored and backend-pending. No normal flow should route here yet. |

## Provider Evidence

### GenX

- Env reader: `packages/core/src/config.ts:62`.
- Base URL: `packages/core/src/config.ts:68`.
- Client functions:
  - `genxSubmitVideo`: `packages/providers/src/genx-client.ts:50`.
  - `genxPollVideo`: `packages/providers/src/genx-client.ts:92`.
  - `genxDownloadVideo`: `packages/providers/src/genx-client.ts:141`.
- Worker adapter registered at `apps/worker/src/adapters/index.ts:29`.
- Adapter prefix: `apps/worker/src/adapters/genx-video-adapter.ts:28`.

Readiness:

- Video source path exists.
- Long-polling flow exists.
- MP4 artifact persistence exists.
- Build/deploy proof is blocked by workspace TypeScript issues.
- Avatar needs a real provider-specific contract.
- Music is not wired to GenX.

### Groq

- Env reader: `packages/core/src/config.ts:50`.
- Base URL: `packages/core/src/config.ts:86`.
- Client functions:
  - `groqChat`: `packages/providers/src/groq-client.ts:47`.
  - `groqStt`: `packages/providers/src/groq-client.ts:95`.
  - `groqTts`: `packages/providers/src/groq-client.ts:133`.
- Text adapter registered at `apps/worker/src/adapters/index.ts:26`.
- Voice adapter registered at `apps/worker/src/adapters/index.ts:27`.
- Text prefix: `apps/worker/src/adapters/groq-text-adapter.ts:18`.
- Voice prefix: `apps/worker/src/adapters/groq-voice-adapter.ts:20`.

Readiness:

- Chat/text source path exists.
- TTS/STT source path exists.
- Music intentionally fails with backend-pending error.
- Specialized semantics for reranking, embeddings, tool use, and structured output are not implemented despite those core capabilities routing to text.

Note:

The string `openai` appears only as part of Groq's OpenAI-compatible API base URL. It is not an active OpenAI provider.

### Together

- Env reader: `packages/core/src/config.ts:56`.
- Base URL: `packages/core/src/config.ts:87`.
- Image client: `packages/providers/src/together-client.ts:41`.
- Embedding client: `packages/providers/src/embeddings-client.ts:25`.
- Image adapter registered at `apps/worker/src/adapters/index.ts:28`.
- Image prefix: `apps/worker/src/adapters/together-image-adapter.ts:18`.

Readiness:

- Image generation source path exists.
- RAG embedding source path exists.
- Image edit needs a real edit/inpaint-specific contract and provider call if edit behavior is required.

### Mimo

- Env reader: `packages/core/src/config.ts:72`.
- Dashboard provider contract exists with coding/reasoning role.
- No Mimo client was found in `packages/providers/src`.
- No Mimo adapter is registered in `apps/worker/src/adapters/index.ts`.

Readiness:

- Contract only.
- Do not claim code or reasoning is Mimo-backed until a real client, adapter, routing rule, and tests exist.

### DeepInfra

- Env reader: `packages/core/src/config.ts:78`.
- Base URL: `packages/core/src/config.ts:88`.
- Dashboard contract marks it gated and backend-pending.
- `tests/phase1-contracts.test.js:40` verifies DeepInfra exists as the gated uncensored lane.
- `tests/phase1-contracts.test.js:91` verifies `uncensored.text` remains planned until backend support exists.
- No DeepInfra client was found in `packages/providers/src`.
- No DeepInfra adapter is registered in `apps/worker/src/adapters/index.ts`.

Readiness:

- Gated pending only.
- Must remain excluded from normal flows until backend policy enforcement, audit logging, and route gating exist.

## Legacy Provider Audit

Searches for old providers and prohibited runtime wording found no active provider implementation for old provider names. Remaining references are historical reports, tests asserting absence, or dependency names such as Vitest's internal `@vitest/mocker`.

The active source of truth is the final five provider IDs in `packages/core/src/providers.ts:12`.

## Provider Implementation Order

Recommended sequence:

1. Fix backend workspace build and tests before provider work.
2. Prove Groq chat end to end.
3. Prove Together image generation end to end.
4. Fix artifact URL/auth before exposing generated files.
5. Prove GenX video end to end.
6. Add Mimo only after official request/response shape is confirmed.
7. Add DeepInfra only with explicit gated policy, admin/audit controls, and tests proving it is excluded from normal flows.

