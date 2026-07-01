#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  AmarktAI Network v2 - enterprise AI capability infrastructure. Adapted to run in the
  Next.js + MongoDB single-service environment (Docker/Fastify/Prisma/Postgres/Redis/Qdrant
  are not runnable here). Delivers: animated obsidian landing page, 8-page dashboard, 9-workbench
  Studio, and a REAL working mock pipeline (create job -> background worker simulates stages ->
  fabricates artifact files on disk -> UI live-updates). Mongo collections stand in for the 5
  Prisma models (AppConnection, AppApiKey inside connection.keys, Job, Artifact, Setting).

backend:
  - task: "Health + static data endpoints (health, capabilities, providers, stats)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET /api, /api/capabilities, /api/providers, /api/stats. Stats aggregates job counts + readiness."
        -working: true
        -agent: "testing"
        -comment: "✅ All endpoints working correctly. GET /api/health returns status:ok mode:mock. GET /api/capabilities returns 12 items. GET /api/providers returns 4 providers (genx/together/groq tier:core, mimo tier:experimental). GET /api/stats returns job counts and 8 readiness items. GET /api/events returns events array."

  - task: "Mock pipeline: POST /api/jobs creates job, background worker progresses status and fabricates artifact file"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/jobs inserts queued job then setTimeout-driven worker updates queued->running->completed over ~4.5s and writes fake artifact (md/svg/wav) to /app/workspace/artifacts. Verify job reaches completed and artifactId set, and artifact appears in GET /api/artifacts."
        -working: true
        -agent: "testing"
        -comment: "✅ CRITICAL end-to-end pipeline fully functional. Tested 3 job types: image.generate, text.chat, voice.tts. All jobs created with status:queued progress:0 artifactId:null. Background worker progresses through running stages (18%->52%->84%) over ~4s. Jobs reach completed status with progress:100 and artifactId set. GET /api/artifacts shows all created artifacts with correct jobId, kind, format, mime, retrievalPath."

  - task: "Artifact download endpoint GET /api/artifacts/:id/download"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Serves file bytes from disk with correct mime (text/markdown, image/svg+xml, audio/wav)."
        -working: true
        -agent: "testing"
        -comment: "✅ Artifact download working perfectly. Tested all 3 mime types: image/svg+xml (1016 bytes), text/markdown (555 bytes), audio/wav (32044 bytes). All return HTTP 200 with correct Content-Type headers and valid file content."

  - task: "Connections CRUD + API key generation + payload simulator + settings + events"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST/GET/DELETE /api/connections, POST /api/connections/:id/keys, POST /api/simulate, GET/PUT /api/settings, GET /api/events. All use UUIDs (no ObjectId)."
        -working: true
        -agent: "testing"
        -comment: "✅ All CRUD operations working. POST /api/connections creates connection with UUID id and empty keys array (201). POST /api/connections/:id/keys generates API key with amk_ prefix (201). GET /api/connections returns connections with embedded keys. DELETE /api/connections/:id removes connection (200). POST /api/simulate echoes payload with routed_to and trace_id (200). PUT /api/settings updates settings (200). GET /api/settings reflects changes correctly. All IDs are UUIDs as expected."

frontend:
  - task: "Landing page + 8 dashboard pages + 9-workbench Studio"
    implemented: true
    working: "NA"
    file: "app/page.js, app/dashboard/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "All routes compile and return 200. Not yet functionally tested (awaiting user go-ahead for frontend testing)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Mock pipeline: POST /api/jobs creates job, background worker progresses status and fabricates artifact file"
    - "Artifact download endpoint GET /api/artifacts/:id/download"
    - "Connections CRUD + API key generation + payload simulator + settings + events"
    - "Health + static data endpoints (health, capabilities, providers, stats)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      Please test the backend API at base path /api. Key end-to-end flow to verify:
      1) POST /api/jobs {type:"image.generate", payload:{prompt:"test"}} -> returns 201 with job.status=queued.
      2) Poll GET /api/jobs/:id for ~6s -> status should advance to "completed", progress 100, artifactId non-null.
      3) GET /api/artifacts -> the artifact for that job exists with retrievalPath.
      4) GET that retrievalPath (/api/artifacts/:id/download) -> 200 with correct content-type.
      Also verify: GET /api/health, /api/capabilities (12 items), /api/providers (4, MiMo experimental),
      /api/stats (jobs counts + readiness list), /api/events. Connections: POST /api/connections then
      POST /api/connections/:id/keys returns amk_ token; POST /api/simulate echoes payload; PUT /api/settings then GET reflects change.
      NOTE: everything is intentionally Mock Mode (no external APIs). Worker is setTimeout-based (~4.5s to complete).
    -agent: "testing"
    -message: |
      ✅ BACKEND TESTING COMPLETE - ALL TESTS PASSED (11/11)
      
      Comprehensive backend API testing completed successfully. Created backend_test.py and executed full test suite.
      
      Test Results Summary:
      • Health & Static Endpoints: ✅ All working (health, capabilities, providers, stats, events)
      • Connections CRUD: ✅ Create, read, delete all functional
      • API Key Generation: ✅ Keys generated with amk_ prefix
      • Simulate Endpoint: ✅ Echoes payload correctly
      • Settings: ✅ PUT and GET working correctly
      • CRITICAL End-to-End Pipeline: ✅ FULLY FUNCTIONAL
        - image.generate → completed in ~4s → artifact downloadable as image/svg+xml (1016 bytes)
        - text.chat → completed in ~4s → artifact downloadable as text/markdown (555 bytes)
        - voice.tts → completed in ~4s → artifact downloadable as audio/wav (32044 bytes)
      
      All jobs progress correctly through queued→running(18%→52%→84%)→completed(100%) with artifactId set.
      All artifacts are created on disk and downloadable with correct Content-Type headers.
      All endpoints use UUIDs (no ObjectId issues).
      Mock mode working as designed - no external API calls required.
      
      Backend is production-ready for mock mode operation.
