# Dashboard Production Cleanup Report

**Branch:** `fix/hide-backend-diagnostics-production-dashboard`
**PR:** (see GitHub)
**Commit:** `fix: hide backend diagnostics from production dashboard`

## Pages Changed

- `app/dashboard/app-gateway/page.js` - Apps page cleanup
- `app/dashboard/jobs/page.js` - Work Library cleanup
- `app/dashboard/capabilities/page.js` - Capability Library cleanup
- `app/dashboard/settings/page.js` - Settings cleanup
- `app/dashboard/studio/page.jsx` - Studio polish
- `lib/dashboard-contract.js` - Removed defaultProvider, renamed Jobs to Work Library
- `tests/phase1-contracts.test.js` - Added production cleanup tests

## What Was Hidden or Moved

| Item | Before | After |
|------|--------|-------|
| App Contract Drawer | Visible sidebar card | Hidden under Developer details accordion |
| JSON payload | Always visible | Hidden under Developer details |
| apiKeyStatus | Visible text | Hidden under Developer details |
| webhookSecretStatus | Visible text | Hidden under Developer details |
| Workspace State | Visible sidebar card | Removed from normal view |
| Provider attempts panel | Visible card | Hidden under Admin diagnostics |
| Signed URL status | Visible card | Hidden under Admin diagnostics |
| Webhook delivery status | Visible card | Hidden under Admin diagnostics |
| Proof status | Visible card | Hidden under Admin diagnostics |
| Backend key / Required env | Visible in capability cards | Hidden under Developer matrix |
| Hard-coded fallback order | Visible in Settings | Replaced with Runtime Policy |

## App Page Final State

- Title: "Apps"
- Shows: App Templates grid (9 templates: Marketing, Horse Management, Crypto, Adult Creator, CRM, Customer Service, Music, Education, Legal)
- Each template shows: name, description, status badge, "Connect after backend" button
- Create App wizard: 4-step flow (App Identity, Agent Provisioning, Brand Vault, Capabilities)
- Developer details: collapsed accordion with contract fields, API key status, webhook secret

## Work Library Final State

- Title: "Work Library"
- Subtitle: "Creations, drafts, and generated assets will appear here after Studio execution is connected."
- Tabs: All, Images, Videos, Music, Voice, Avatars, Documents, Drafts
- Search bar
- Empty state: "No creations yet. Create something in Studio and your work will appear here."
- CTA: "Open Studio"
- Admin diagnostics: collapsed accordion with job records, artifact storage, proof/cost details

## Capability Library Final State

- Title: "Capability Library"
- Subtitle: "Explore what AmarktAI can create and orchestrate. Runtime routing is selected by the platform."
- Groups: Chat & Reasoning, Image, Video, Music & Voice, Avatar, Brand & Marketing, Knowledge / RAG, Apps & Agents, Gated
- Each card shows: capability name, description, "Studio UI ready" badge, "Runtime selected" text
- DeepInfra card: "Gated lane, Requires explicit gating, Not used in normal safe flows"
- Developer matrix: collapsed accordion with backend capability mapping

## Settings Final State

- Tabs: Provider Keys, Runtime Policy, Storage, Workers, Webhooks, Security
- Provider Keys: shows 5 final providers with env keys
- Runtime Policy: "The backend runtime selects providers and models by capability, quality, speed, cost, policy, and availability."
- Routing mode: "Runtime selected"
- DeepInfra: "Gated only, excluded from normal flows"
- No hard-coded fallback order

## Studio Polish Summary

- "Advanced" tab renamed to "Developer"
- "Backend contract" renamed to "Developer contract"
- "Provider routing" renamed to "Runtime routing"
- Capability-specific preview labels (e.g., "Song preview will appear here", "Video/storyboard preview will appear here")
- Capability-specific asset labels (e.g., "Reference tracks / stems", "Source clips / frames")
- Preview tab shows "Backend connection required" button
- Runtime selected text preserved

## Confirmation

- [x] Normal user-facing pages no longer expose backend contract/debug UI
- [x] Provider routing is runtime-selected
- [x] DeepInfra gated only
- [x] STUDIO_MODES has no defaultProvider

## Build Result

```
npm run build -> Compiled successfully in 20.5s
22 static pages generated
```

## Test Result

```
npm test -> 49 tests passed (160ms)
```

## Manual QA Checklist

- [x] Apps page shows templates, not raw contract JSON
- [x] Work Library shows clean empty state, not backend debug panels
- [x] Capability Library shows user-facing groups, not backend keys/env
- [x] Settings shows Runtime Policy, not hard-coded fallback order
- [x] Studio Developer tab contains contract/routing/proof details
- [x] Studio Preview shows capability-specific labels
- [x] All backend debug details hidden under collapsed accordions
- [x] No defaultProvider in STUDIO_MODES
- [x] Final providers exactly: GenX, Groq, Together, MiMo, DeepInfra
- [x] No banned providers
- [x] No mock/simulation/fake code
