# Backend Capability Readiness Matrix

Status key:

- `ready_in_source`: source path exists, but still depends on global backend build and deployment blockers.
- `partial`: some backend source exists, but capability behavior is incomplete or generic.
- `frontend_pending_backend`: frontend contract exists and backend map marks missing.
- `blocked`: accepted or visible, but current backend path will fail or is unsafe.
- `missing`: no backend canonical capability or execution path found.

## Matrix

| Studio / Product Capability | Dashboard key | Backend canonical key | API accepts | Worker route | Provider path found | Artifact path | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chat | `text.chat` | `chat` | Yes | `text` | Groq chat | Text document | `ready_in_source` | Uses `GroqTextAdapter`; blocked until backend workspaces build. |
| Reasoning | `text.reasoning` | `reasoning` | Yes | `text` | Groq chat | Text document | `partial` | Source routes to Groq, not Mimo. Mimo is contract-only today. |
| Code | `text.code` | `code` | Yes | `text` | Groq chat | Text document | `partial` | Source routes to Groq, not Mimo. No code-specific sandbox/tooling found. |
| Research | `research` | `research` in core, but Studio map marks planned | Yes if called directly | `text` | Groq chat | Text document | `partial` | Core supports it, Studio map still marks planned/missing. Contract mismatch needs resolution. |
| Image generation | `image.generate` | `image_generation` | Yes | `image` | Together image | Image artifact | `ready_in_source` | Uses Together FLUX path; build/deploy proof still missing. |
| Image editing | `image.edit` | `image_edit` | Yes | `image` | Together image | Image artifact | `partial` | Adapter does not show separate edit/inpaint request handling. |
| Short video | `video.generate` | `video_generation` | Yes | `video` | GenX video | Video artifact | `ready_in_source` | Uses submit/poll/download flow; build/deploy proof still missing. |
| Long-form video | `video.longform` | None | No | None | None | None | `frontend_pending_backend` | Explicitly missing in `lib/capability-map.js`. |
| Image-to-video | `video.image_to_video` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| Video edit / remix | `video.edit` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| Music / song | `music.generate` | `music_generation` | Yes | `voice` | Throws backend-pending error | None | `blocked` | `GroqVoiceAdapter` rejects this capability. |
| Voice TTS | `voice.tts` | `tts` | Yes | `voice` | Groq TTS | Audio artifact | `ready_in_source` | Uses Groq audio speech path. |
| Speech-to-text | `voice.stt` | `stt` | Yes | `voice` | Groq Whisper | Transcript artifact | `ready_in_source` | Requires base64 audio input. |
| Avatar generation | `avatar.generate` | `avatar_generation` | Yes | `video` | GenX video adapter | Video artifact | `partial` | Routes to generic video flow; no avatar-specific input/output contract found. |
| Talking avatar | frontend mode only | None | No | None | None | None | `frontend_pending_backend` | Shares avatar frontend schema; no canonical backend key found. |
| Lip-sync avatar | frontend mode only | None | No | None | None | None | `frontend_pending_backend` | Shares avatar frontend schema; no canonical backend key found. |
| Website scrape / BrandPack | `scrape.crawl` | `brand_scrape` | Yes | `scrape` | Crawlee/Playwright local tool | JSON document | `ready_in_source` | Local crawler, not an AI provider. |
| Campaign content | `campaign.generate` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| Social / reel pack | `social.reel_pack` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| RAG ingest | `rag.ingest` | `rag_ingest` | Yes | `rag` | Together embeddings + Qdrant | JSON receipt | `partial` | Source exists, but worker build currently fails partly in RAG adapter. |
| RAG search | `rag.query` | `rag_search` | Yes | `rag` | Together embeddings + Qdrant | JSON result | `partial` | Source exists, but worker build currently fails partly in RAG adapter. |
| App request | `app.request` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| Agent task | `agent.task` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| Workflow automation | `workflow.automation` | None | No | None | None | None | `frontend_pending_backend` | Explicitly planned in frontend map. |
| DeepInfra gated text | `uncensored.text` | None | No | None | None | None | `frontend_pending_backend` | Correctly gated in frontend. Backend capability and policy enforcement are missing. |
| Embeddings | direct core only | `embeddings` | Yes if called directly | `text` | Groq text adapter | Text document | `partial` | Core accepts it, but adapter does not perform embedding semantics. |
| Reranking | direct core only | `reranking` | Yes if called directly | `text` | Groq text adapter | Text document | `partial` | Core accepts it, but adapter does not perform reranking semantics. |
| Multimodal | direct core only | `multimodal` | Yes if called directly | `text` | Groq text adapter | Text document | `partial` | Generic text path only. |
| Tool use | direct core only | `tool_use` | Yes if called directly | `text` | Groq text adapter | Text document | `partial` | No tool execution layer found. |
| Structured output | direct core only | `structured_output` | Yes if called directly | `text` | Groq text adapter | Text document | `partial` | Prompt asks for JSON, but no schema enforcement found. |

## Capability Findings

1. API validation uses canonical capabilities from `packages/core/src/jobs.ts:26`.
2. Provider/model overrides are blocked by `packages/core/src/jobs.ts:68` and enforced in the job route at `apps/api/src/routes/jobs.ts:125`.
3. Worker dispatch depends on `CAPABILITY_PREFIX_MAP` from `packages/core/src/capabilities.ts:79`.
4. The worker registry only has adapters for text, voice, image, video, scrape, and RAG prefixes.
5. Studio has a larger product surface than backend canonical support, and `lib/capability-map.js` is correctly explicit about missing planned backend keys.
6. `music_generation` should not be considered ready even though the API accepts it.
7. `avatar_generation` should not be considered fully ready until a real avatar provider contract is implemented.
8. DeepInfra remains gated and backend-pending, which matches Phase 1 policy.

## First Capability To Prove

After the backend workspace build is fixed, prove one narrow path first:

`chat` through `POST /api/v1/jobs` -> BullMQ -> `GroqTextAdapter` -> text artifact -> `GET /api/v1/jobs/:id`.

Reason:

- Lowest artifact complexity.
- Existing provider client and adapter source exist.
- Clear auth, queue, DB, and artifact lifecycle can be tested end to end.
- Does not require adding new Studio modes or provider-selection UI.

