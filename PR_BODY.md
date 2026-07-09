## 🎬 Long-Form Video Phase 1: Orchestration Foundation

This PR adds the **orchestration foundation** for long-form video generation. It does NOT implement final video rendering.

### ✅ What Was Added

#### 1. Schema & Types (`packages/core/src/long-form-video.ts`)
- `LongFormVideoRequestSchema` - Request validation
- `LongFormVideoPlanSchema` - Plan structure
- `LongFormSceneSchema` - Individual scene definition
- `LongFormRenderStepSchema` - Render pipeline steps
- `LongFormVideoArtifactPlanSchema` - Artifact tracking
- Status enums and validation helpers
- `LONG_FORM_VIDEO_STATUS` capability status

#### 2. Deterministic Planner (`packages/core/src/long-form-planner.ts`)
- `createLongFormVideoPlan(request)` - Creates plan without AI
- Splits target duration across scenes
- Generates scene prompts and visual directions
- Creates render steps with dependencies
- Identifies missing dependencies
- Marks executability status

#### 3. Admin API Route (`apps/api/src/routes/admin-long-form-video.ts`)
- `POST /api/admin/long-form-video/plan` - Create plan (no execution)
- `GET /api/admin/long-form-video/status` - Get capability status
- Admin-protected endpoints
- Returns plan with missing dependencies and next steps

#### 4. Dashboard Update (`app/dashboard/video/page.js`)
- Long-form video card shows "Phase 1 Ready"
- Displays orchestration foundation status
- Lists missing dependencies
- Shows admin API endpoint

#### 5. Audit Update (`scripts/audit-build-completion-map.mjs`)
- Detects schema file existence
- Detects planner file existence
- Detects admin route existence
- Reports orchestration foundation ready
- Still reports final assembly not ready

#### 6. Comprehensive Tests (`tests/long-form-video-orchestration-foundation.test.js`)
- 33 tests covering all functionality
- Schema validation tests
- Plan creation tests
- Duration splitting tests
- Scene count tests
- Render step tests
- Missing dependency tests
- Capability status tests
- Provider/model override blocking tests

### 🚀 What Is Executable Now

- ✅ Schema validation
- ✅ Plan creation
- ✅ Scene splitting
- ✅ Admin API for planning
- ✅ Per-scene video generation **possible** (using existing `video_generation`)

### 🚧 What Is Still Blocked

- ❌ Scene execution pipeline (Phase 2)
- ❌ ffmpeg/stitching (Phase 4)
- ❌ Voiceover backend (if enabled)
- ❌ Subtitle backend (if enabled)
- ❌ Music bed backend (if enabled)
- ❌ Final artifact assembly (Phase 5)

### 📊 Missing Dependencies

1. `ffmpeg/stitching` - Scene stitching and final assembly
2. `voiceover_backend` - TTS for scene narration (if enabled)
3. `subtitle_backend` - Subtitle generation (if enabled)
4. `music_bed_backend` - Background music (if enabled)
5. `final_assembly_pipeline` - Combine all elements

### 🧪 Test Results

- **Tests:** 888 passed, 5 skipped
- **Build:** Compiled successfully in 23.5s
- **Audit:** Detects Phase 1 foundation correctly

### 📝 Example Plan Output

```json
{
  "id": "uuid",
  "prompt": "A documentary about space exploration",
  "totalDurationSeconds": 120,
  "storyboard": {
    "scenes": [
      {
        "sceneNumber": 1,
        "title": "Introduction",
        "visualPrompt": "...",
        "durationSeconds": 30,
        "status": "planned"
      }
    ]
  },
  "renderSteps": [
    { "type": "scene_generation", "status": "ready" },
    { "type": "final_assembly", "status": "blocked" }
  ],
  "missingDependencies": ["ffmpeg/stitching", "final_assembly_pipeline"],
  "executableNow": false,
  "perSceneVideoGenerationPossible": true
}
```

### ✅ Confirmations

- ✅ No final long-form rendering claimed complete
- ✅ No providers added (still exactly 5)
- ✅ No music wiring started
- ✅ Adult generation remains on hold
- ✅ Apps cannot choose provider/model
- ✅ MiMo remains coding_tools_only
- ✅ No deployment triggered
- ✅ No push to main

### 🎯 Next Steps

**Phase 2:** Implement per-scene video generation using existing `video_generation` capability
**Phase 3:** Implement voiceover/subtitles/music bed (if enabled in request)
**Phase 4:** Implement scene stitching with ffmpeg
**Phase 5:** Implement final assembly pipeline

### 📦 Files Changed (8 files, +1071 lines)

- `packages/core/src/long-form-video.ts` (NEW)
- `packages/core/src/long-form-planner.ts` (NEW)
- `packages/core/src/index.ts` (updated exports)
- `apps/api/src/routes/admin-long-form-video.ts` (NEW)
- `apps/api/src/server.ts` (route registration)
- `app/dashboard/video/page.js` (UI update)
- `scripts/audit-build-completion-map.mjs` (audit update)
- `tests/long-form-video-orchestration-foundation.test.js` (NEW)
