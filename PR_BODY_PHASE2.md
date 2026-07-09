## 🎬 Long-Form Video Phase 2: Per-Scene Execution Pipeline

This PR implements Phase 2 of long-form video generation, enabling per-scene video clip generation using the existing `video_generation` capability.

### ✅ What Was Added

#### 1. Execution Module (`packages/core/src/long-form-execution.ts`)
- `buildSceneVideoPrompt()` - Builds enhanced cinematic prompts with style, tone, camera direction, and transitions
- `createSceneExecutionPayloads()` - Creates video_generation payloads for each scene (now accepts executionId parameter)
- `createLongFormExecutionState()` - Initializes execution state tracking
- `updateSceneExecutionState()` - Updates scene status and progress
- `calculateLongFormProgress()` - Calculates overall completion percentage
- `getExecutionSummary()` - Returns execution summary with counts

#### 2. Admin API Routes (`apps/api/src/routes/admin-long-form-video.ts`)
- `POST /api/admin/long-form-video/execute-scenes` - Queue per-scene video generation jobs
  - Supports `dryRun` mode to preview payloads without queueing
  - Accepts existing plan or creates new plan from request
  - Returns execution ID and queued job information
  - **Fixed**: All scene payloads now use the same executionId as the execution state
- `GET /api/admin/long-form-video/executions/:id` - Get execution status
  - Returns scene statuses, progress, artifacts, and provider/model info
  - Updates state from DB job records
  - **New**: Can reconstruct execution state from DB job metadata when in-memory state is missing (e.g., after API restart)
- `GET /api/admin/long-form-video/status` - Get capability status
  - Shows Phase 2 readiness
  - Documents in-memory state limitation and recovery capability

#### 3. Dashboard Update (`app/dashboard/video/page.js`)
- Long-form video section shows "Phase 2 Ready"
- Lists what works now (planning, per-scene generation, tracking)
- Shows what's still pending (stitching, assembly, voiceover, subtitles, music)
- Displays admin API endpoints

#### 4. Audit Update (`scripts/audit-build-completion-map.mjs`)
- Detects execution module existence
- Detects execute-scenes route
- Reports per-scene execution ready
- Still reports final assembly not ready

#### 5. Comprehensive Tests (`tests/long-form-video-scene-execution.test.ts`)
- 38 tests covering all Phase 2 functionality
- **New**: Execution ID consistency tests
  - Verifies `createSceneExecutionPayloads` uses provided executionId
  - Verifies execution state and all scene payloads share one executionId
  - Verifies dryRun returns payloads with the same executionId
  - Verifies non-dryRun queues jobs with matching executionId
  - Verifies status route uses the same executionId
- Prompt building with style/tone/camera/transitions
- Payload creation with duration/aspect ratio/metadata
- Execution state management and progress calculation
- Provider/model override blocking verification
- Brain Router control verification
- Final assembly blocking verification

### 🚀 What Is Executable Now

- ✅ Plan creation with scene splitting
- ✅ Enhanced cinematic prompt building per scene
- ✅ Per-scene video generation via GenX `video_generation`
- ✅ Scene job queuing and tracking
- ✅ Execution state management
- ✅ Progress calculation
- ✅ Brain Router provider/model selection
- ✅ Dry run mode for preview
- ✅ Execution state reconstruction from DB after API restart

### 🚧 What Remains Blocked

- ❌ Scene stitching with ffmpeg (Phase 4)
- ❌ Final artifact assembly (Phase 5)
- ❌ Voiceover backend (Phase 3, if enabled)
- ❌ Subtitle backend (Phase 3, if enabled)
- ❌ Music bed backend (Phase 3, if enabled)
- ❌ Persistent execution state storage (currently in-memory with DB reconstruction)

### 🎯 Video Quality Improvements

Each scene prompt now includes:
- Style and tone prefix (e.g., "cinematic style, dramatic tone")
- Scene title and description
- Visual prompt with detailed imagery
- Camera direction (e.g., "wide_shot_establishing", "tracking_shot")
- Transition hints (e.g., "begins with fade in", "ends with fade out")
- Quality enhancement keywords ("high quality, cinematic, professional")

### 🔧 Execution ID Fix

**Problem**: Previously, `createSceneExecutionPayloads()` and `createLongFormExecutionState()` both generated random execution IDs, causing a mismatch between queued jobs and the returned execution state.

**Solution**: 
- `createSceneExecutionPayloads()` now accepts an `executionId` parameter
- API route creates execution state first, then passes its executionId to payload creation
- All scene payloads now use the same executionId as the execution state
- Status route can match jobs/scenes by the same executionId
- Added 5 new tests to verify execution ID consistency

### 💾 In-Memory State Limitation

**Current State**: Execution state is stored in-memory (lost on API restart)

**Recovery**: Status route can reconstruct execution state from DB job records using `metadataJson.longFormExecutionId` when in-memory state is missing

**Future**: Persistent execution state storage will be added in a future phase

### 🧪 Verification Results

- **Tests:** 926 passed, 5 skipped
- **Build:** Compiled successfully in 17.9s
- **Audit:** Detects Phase 2 components correctly

### 📊 Example Execution Flow

1. Create plan: `POST /api/admin/long-form-video/plan`
2. Execute scenes: `POST /api/admin/long-form-video/execute-scenes`
   - Returns execution ID and queued job IDs
   - All jobs have matching `metadata.longFormExecutionId`
3. Monitor progress: `GET /api/admin/long-form-video/executions/:id`
   - Returns scene statuses, artifacts, progress percentage
   - Can reconstruct from DB if in-memory state is lost
4. When all scenes complete → Ready for Phase 4 (stitching)

### ✅ Confirmations

- ✅ Final stitching/rendering is NOT claimed complete
- ✅ No providers added (still exactly 5)
- ✅ No music wiring started
- ✅ Adult generation remains on hold
- ✅ Apps cannot choose provider/model
- ✅ MiMo remains coding_tools_only
- ✅ No deployment triggered
- ✅ No push to main
- ✅ Execution ID mismatch fixed
- ✅ Execution state can be reconstructed from DB

### 🎯 Next Steps

**Phase 3:** Implement voiceover/subtitles/music bed backends (if enabled in request)  
**Phase 4:** Implement scene stitching with ffmpeg  
**Phase 5:** Implement final assembly pipeline  
**Phase 6:** Implement persistent execution state storage

The long-form video per-scene execution pipeline is now ready for use with consistent execution ID tracking and DB reconstruction capability!
