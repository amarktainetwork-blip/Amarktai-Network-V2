# Backend Phase 5 — Provider Routing Skeleton Report

**Branch:** `feat/prove-provider-routing-skeleton`
**PR:** (see GitHub)
**Commit:** `feat: prove provider routing skeleton`

## Exact Scope

This PR creates the internal routing decision layer that chooses eligible provider candidates for a capability. It does NOT execute providers, call APIs, generate artifacts, or produce outputs.

## What Was Proven

1. **Provider identity:** Only final provider IDs (genx, groq, together, mimo, deepinfra) are valid
2. **Capability routing:** Valid capabilities get candidate lists; unknown capabilities are rejected
3. **Chat/text routing:** Routes to eligible text providers (groq, together, mimo)
4. **Code/reasoning routing:** Routes to eligible text/code providers
5. **Image/video/music/avatar routing:** Routes only if canonical capability exists
6. **RAG/embeddings routing:** Routes only if canonical capability exists
7. **DeepInfra gating:** Not selected by default; only selected with explicit gate flag
8. **Config semantics:** Env var presence means "configured only", not "live"
9. **Missing config:** Does not cause fake provider success
10. **Selection behavior:** Returns selectedProvider or blocked decision with reasons
11. **Deterministic:** Same inputs produce same outputs
12. **No override:** Never accepts app-supplied provider/model
13. **No network:** Router only reads process.env and static maps
14. **Worker integration:** Worker asks router for decision, still fails with not-implemented
15. **No artifacts:** Worker does not create artifacts or set artifactId
16. **No provider calls:** Worker does not call any provider adapter

## What Was Intentionally Not Added

- Provider execution / API calls
- Live provider health checks
- Model selection logic
- Artifact generation
- Dashboard/Studio changes
- Phase 6 live provider execution

## Routing Decision Shape

```typescript
interface ProviderRouteDecision {
  capability: CapabilityKey
  selectedProvider: ProviderKey | null
  selectedModel: string | null      // null in Phase 5
  candidates: ProviderCandidate[]
  executionAllowed: false            // always false in Phase 5
  blocked: boolean
  blockReason: string | null
}
```

## Final Provider List

- `genx` — video, image, audio category support
- `groq` — text, code, audio category support
- `together` — text, image, code, retrieval category support
- `mimo` — text, code category support
- `deepinfra` — text, image category support (gated only)

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/provider-routing.ts` | New: routing skeleton with capability→provider map, config check, DeepInfra gating |
| `packages/core/src/index.ts` | Updated: exports routing types and functions |
| `apps/worker/src/processors/job-processor.ts` | Updated: integrates router into execution placeholder |
| `tests/provider-routing-skeleton.test.js` | New: 38 tests |
| `tests/worker-execution-foundation.test.js` | Updated: adapter tests check for "adapter"/"API call" not provider names |
| `BACKEND_PHASE_5_PROVIDER_ROUTING_SKELETON_REPORT.md` | New: this report |

## Test Commands Run

| Command | Result |
|---------|--------|
| `npm test` | 192 tests passed (47 + 6 + 38 + 33 + 68) |

## Build Commands Run

| Command | Result |
|---------|--------|
| `npm run build` | Passed (11.2s, 22 pages) |
| `prisma validate` | DATABASE_URL not set (expected locally) |
| `npx prisma generate` | Passed |
| `npm run build --workspace=@amarktai/api` | Passed |
| `npm run build --workspace=@amarktai/worker` | Passed |
| `npm run lint --workspace=@amarktai/api` | Passed |
| `npm run lint --workspace=@amarktai/worker` | Passed |

## Confirmation

- [x] DeepInfra remains gated by default
- [x] No provider execution added
- [x] No provider API/network calls added
- [x] No dashboard/Studio changes added
- [x] No fake artifacts/product outputs added
- [x] Phase 6 live provider execution not started
- [x] Final providers: genx, groq, together, mimo, deepinfra (gated only)

## Blockers

- DATABASE_URL not set locally (prisma validate requires it)

## Next Recommended Phase

**Phase 6: Live Provider Execution**
- Wire actual provider API calls into the execution placeholder
- Add provider health checks
- Add model selection logic
- Add artifact creation from real provider output
