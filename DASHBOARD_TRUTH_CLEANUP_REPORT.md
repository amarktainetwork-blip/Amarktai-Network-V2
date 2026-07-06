# Dashboard Truth Cleanup Report

**Branch:** `fix/remove-fake-dashboard-flows`
**PR:** (see GitHub)
**Commit:** `fix: remove fake dashboard flows before backend wiring`

## Pages Changed

- `app/dashboard/app-gateway/page.js` - Removed fake app cards, clean empty state
- `app/dashboard/jobs/page.js` - Removed tabs/search, clean empty state
- `app/dashboard/capabilities/page.js` - "Visible in Studio" instead of "Studio UI ready"
- `app/dashboard/providers/page.js` - Removed COVERAGE, env keys, proof badges
- `app/dashboard/settings/page.js` - Removed "Save local draft", disabled inputs
- `app/dashboard/agents/page.js` - Clean empty state, no fake shell
- `app/dashboard/brand-library/page.js` - Clean empty state, no fake sections
- `app/dashboard/studio/page.jsx` - Fixed SCHEMA_MAP, lifted state, no fake assistant
- `lib/useStudioStore.js` - Removed fake app/workspace creation, no setTimeout
- `tests/phase1-contracts.test.js` - Added truth cleanup tests

## Fake-Looking UI Removed

| Page | Removed | Replaced With |
|------|---------|---------------|
| Apps | 9 fake app template cards with statuses | "No apps connected yet" empty state |
| Apps | "Ready to configure" / "Connect after backend" badges | "Backend connection required" disabled button |
| Apps | Working-looking Create App wizard | Collapsed "Connection draft" section |
| Apps | "App Contract Drawer" JSON | Removed from normal view |
| Work Library | Active tabs and search bar | Clean empty state only |
| Work Library | "No backend jobs loaded" | "No creations yet" |
| Capability Library | "Studio UI ready" badge | "Visible in Studio" |
| Providers | COVERAGE object, env var boxes, proof boxes, missing_key | "Not connected" / "Gated only" badges |
| Providers | Model Catalog table with contract order | Removed |
| Settings | "Save local draft" button + toast | Removed |
| Settings | Editable inputs for storage/workers/webhooks | Disabled until backend |
| Settings | Open-source tool switches | Disabled with "Available" badge |
| Agents | "Agent grid shell", "No backend agents loaded" | "No agents created yet" |
| Agents | "contract_ready", "backend_pending" badges | Removed |
| Brand Library | "Brand Details Panel", "ui_ready", section cards | "No BrandPacks yet" |
| Brand Library | "Awaiting real BrandPack artifact data" | Removed |

## Local Fake State Removed

| Item | Before | After |
|------|--------|-------|
| `createWorkspace` | Created fake local app with `Date.now()` ID | Returns `{ ok: false, reason: 'backend_required' }` |
| `createApp` | Created fake local app with `Date.now()` ID | Returns `{ ok: false, reason: 'backend_required' }` |
| `appendBackendPendingChatNotice` | Used `setTimeout` to fake assistant response | Removed |
| `requestGeneration` | Simulated backend_pending state | Removed |
| `PROVIDER_STATE` / `MODEL_CONTRACTS` | Exposed as fake model catalog | Removed from store |

## Studio Schema Map Fix

```js
const SCHEMA_MAP = {
  image_edit: 'image',    // was missing
  voice_stt: 'voice',     // was missing
  talking_avatar: 'avatar',
  lip_sync: 'avatar',
}
```

## Studio Send Behavior After Cleanup

- User can type in Director
- Send button adds user draft to local chat history only
- No fake assistant response is generated
- No `setTimeout` simulation
- Static notice shown when chat is empty: "Draft your request below. Backend connection required to submit."

## Work Library Final State

- Title: "Work Library"
- Clean empty state: "No creations yet"
- Subtitle: "Create something in Studio once backend execution is connected."
- CTA: "Open Studio"
- Admin diagnostics collapsed accordion (job records, artifact storage)

## Apps Final State

- Title: "Apps"
- Clean empty state: "No apps connected yet"
- "Backend connection required" disabled button
- "Supported app types" collapsed accordion (plain text list)
- "Connection draft" collapsed section with disabled final action

## Providers Final State

- Title: "Providers"
- Cards show: name, role, description, "Not connected" or "Gated only" badge
- No COVERAGE, env keys, proof boxes, missing_key
- Developer details collapsed with env keys only

## Settings Final State

- Tabs: Provider Keys, Runtime Policy, Storage, Workers, Webhooks, Security
- Provider keys: disabled inputs with env key labels, "Backend required" buttons
- Runtime Policy: "Runtime selected", "Backend controlled", "DeepInfra gated only"
- All other tabs: disabled with "after backend settings route is wired" message
- No "Save local draft" button or toast

## Agents Final State

- "No agents created yet" empty state
- "Create agent — backend required" disabled button
- "Agent builder preview" collapsed accordion

## Brand Library Final State

- "No BrandPacks yet" empty state
- "Create BrandPack — backend required" disabled button
- Developer details collapsed accordion

## Confirmation

- [x] No backend implementation was added
- [x] No provider calls were added
- [x] No new API routes were added
- [x] No fake/simulation/mock/MongoDB code was added
- [x] Apps no longer shows fake app cards
- [x] Store no longer creates fake local apps/workspaces
- [x] Studio no longer simulates backend assistant response
- [x] image_edit and voice_stt schemas resolve correctly

## Build Result

```
npm run build -> Compiled successfully in 17.0s
22 static pages generated
```

## Test Result

```
npm test -> 42 tests passed (38ms)
```
