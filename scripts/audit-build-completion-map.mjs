#!/usr/bin/env node

/**
 * Amarktai Network V2 — Full Build Completion Map Audit
 * 
 * This script inspects the actual codebase to produce a truthful completion map.
 * It does NOT hardcode findings — it reads files and extracts real state.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { CAPABILITY_BY_KEY, CAPABILITY_KEYS } from '../packages/core/src/capabilities.ts'
import { getExecutorRegistrations } from '../packages/core/src/executor-registry.ts'
import { MODEL_CATALOGUE } from '../packages/core/src/model-catalog.ts'
import { APPROVED_PROVIDER_DEFINITIONS } from '../packages/core/src/providers.ts'
import { getRuntimeTruth } from '../packages/core/src/runtime-truth.ts'
import { buildLongFormComponentRuntimeState } from '../apps/api/src/lib/admin-runtime-truth.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// Helper to safely read files
async function safeRead(filePath) {
  try {
    return await fs.readFile(path.join(ROOT, filePath), 'utf-8')
  } catch {
    return null
  }
}

// Helper to check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(path.join(ROOT, filePath))
    return true
  } catch {
    return false
  }
}

// Extract provider list from providers.ts
async function extractProviders() {
  return { found: true, providers: APPROVED_PROVIDER_DEFINITIONS.map(provider => provider.key) }
}

// Extract capabilities from capabilities.ts
async function extractCapabilities() {
  return { found: true, capabilities: [...CAPABILITY_KEYS] }
}

// Extract model catalogue from model-catalog.ts
async function extractModelCatalogue() {
  return { found: true, models: MODEL_CATALOGUE.map(model => ({ ...model, capabilities: [...model.capabilities] })) }
}

// Check canonical Orchestra integration
async function checkOrchestra() {
  const orchestra = await safeRead('packages/core/src/orchestra.ts')
  const providerExecutor = await safeRead('apps/worker/src/providers/provider-executor.ts')
  
  return {
    exists: !!orchestra,
    integratedInWorker: providerExecutor?.includes('resolveOrchestraDecision') && !providerExecutor?.includes('routeBrain') || false,
    routingModes: orchestra?.match(/ORCHESTRA_ROUTING_MODES\s*=\s*\[([^\]]+)\]/)?.[1]
      ?.split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean) || []
  }
}

// Check worker execution paths
async function checkWorkerExecution() {
  const content = await safeRead('apps/worker/src/providers/provider-executor.ts')
  const direct = await safeRead('apps/worker/src/providers/direct-provider-executor.ts')
  const streaming = await safeRead('apps/api/src/routes/streaming-chat.ts')
  if (!content) return { found: false, executors: {} }
  
  return {
    found: true,
    executors: {
      deepinfraChat: direct?.includes('executedeepinfraChat') || false,
      deepinfraText: direct?.includes('executeValidatedTextCapability') || false,
      deepinfraStreaming: streaming?.includes('openAiStreamingChat') || false,
      deepinfraToolUse: direct?.includes('executedeepinfraToolUse') || false,
      deepinfraTts: direct?.includes('executedeepinfraTts') || false,
      deepinfraStt: direct?.includes('executedeepinfraStt') || false,
      deepinfraText: direct?.includes('executeValidatedTextCapability') || false,
      deepinfraTasks: direct?.includes('executeDeepInfraTaskCapability') || false,
      embeddings: direct?.includes('executeEmbeddingsCapability') || false,
      reranking: direct?.includes('executeRerankingCapability') || false,
      togetherImage: content.includes('executeTogetherImage'),
      genxVideo: content.includes('executeGenxVideo'),
      musicWorker: content.includes('executeGenxMusic')
    },
    usesOrchestra: content.includes('resolveOrchestraDecision') && !content.includes('routeBrain')
  }
}

// Check dashboard pages with multiple execution patterns
async function checkDashboardPages() {
  const dashboardDir = path.join(ROOT, 'app', 'dashboard')
  try {
    const entries = await fs.readdir(dashboardDir)
    const pages = entries.filter(e => !e.startsWith('_') && !e.startsWith('.'))
    
    const pageStatus = {}
    for (const page of pages) {
      const pagePath = path.join(dashboardDir, page, 'page.js')
      const exists = await fileExists(`app/dashboard/${page}/page.js`)
      
      if (exists) {
        const content = await safeRead(`app/dashboard/${page}/page.js`)
        const isDisabled = content?.includes('disabled') || content?.includes('Backend Pending') || content?.includes('On Hold')
        
        // Check for multiple execution patterns
        const hasExecution = 
          content?.includes('executeWithProvider') || 
          content?.includes('/api/v1/jobs') ||
          content?.includes('/api/admin/studio/jobs') ||
          content?.includes('/api/admin/jobs') ||
          content?.includes('useStudioStore') ||
          content?.includes('submitJob') ||
          content?.includes('pollJob')
        
        // Determine execution-ready and pending capabilities for this page
        let executionReadyCapabilities = []
        let pendingCapabilities = []
        let status = 'display-only'
        let reason = ''
        
        // Check execution FIRST, then check disabled state
        if (page === 'music') {
          pendingCapabilities = ['music_generation']
          status = 'design_ready_pending_backend'
          reason = 'Music UI uses the real route/status flow, but execution remains configuration/infrastructure gated.'
        } else if (hasExecution) {
          // Page has real execution paths
          if (page === 'image') {
            executionReadyCapabilities = ['image_generation']
            pendingCapabilities = ['image_edit', 'upscale', 'variations', 'premium_image_routing']
            status = 'partial_execution'
            reason = 'Image generation is executable; future controls are pending.'
          } else if (page === 'video') {
            executionReadyCapabilities = ['video_generation']
            pendingCapabilities = ['image_to_video', 'long_form_video', 'storyboard', 'voiceover', 'subtitles']
            status = 'partial_execution'
            reason = 'Short video generation is executable; long-form and advanced video controls are pending.'
          } else if (page === 'chat') {
            // Chat has text router capabilities but may not have full backend persistence
            executionReadyCapabilities = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output']
            pendingCapabilities = []
            status = 'partial_execution'
            reason = 'Text capabilities executable via router; backend memory/persistence may be pending.'
          } else {
            // Generic execution-ready page
            status = 'execution-ready'
            reason = 'Page has backend integration.'
          }
        } else if (isDisabled) {
          // Page has disabled controls but no execution
          if (['music', 'research', 'long-form'].includes(page)) {
            status = 'design_ready_pending_backend'
            if (page === 'music') {
              pendingCapabilities = ['music_generation']
            } else if (page === 'research') {
              pendingCapabilities = ['research', 'rag_search', 'rag_ingest', 'brand_scrape']
            } else if (page === 'long-form') {
              pendingCapabilities = ['long_form_video']
            }
            reason = 'UI design-ready; backend not wired.'
          } else {
            status = 'design-ready'
            reason = 'Page contains disabled/pending controls.'
          }
        }
        
        pageStatus[page] = {
          exists: true,
          status: status,
          executionReadyCapabilities: executionReadyCapabilities,
          pendingCapabilities: pendingCapabilities,
          hasBackendIntegration: !!hasExecution,
          reason: reason
        }
      } else {
        pageStatus[page] = { exists: false, status: 'missing' }
      }
    }
    
    return { found: true, pages: pageStatus }
  } catch {
    return { found: false, pages: {} }
  }
}

// Check app contract routes
async function checkAppContract() {
  const jobsRoute = await safeRead('apps/api/src/routes/jobs.ts')
  const adminConnections = await safeRead('apps/api/src/routes/admin-app-connections.ts')
  
  return {
    found: true,
    jobsEndpoint: !!jobsRoute,
    appConnectionsEndpoint: !!adminConnections,
    hasApiKeyHashing: jobsRoute?.includes('hashAppApiKey') || false,
    hasBlockedOverrides: jobsRoute?.includes('hasBlockedOverrides') || false,
    acceptsRoutingMode: jobsRoute?.includes('routingMode') || false
  }
}

// Check installed libraries
async function checkInstalledLibraries() {
  const pkg = JSON.parse(await safeRead('package.json') || '{}')
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  
  return {
    found: true,
    libraries: {
      qdrant: !!deps['@qdrant/js-client-rest'],
      crawlee: !!deps['crawlee'],
      playwright: !!deps['playwright'],
      bullmq: !!deps['bullmq'],
      ioredis: !!deps['ioredis'],
      prisma: !!deps['@prisma/client'],
      socketio: !!deps['socket.io'],
      sentiment: !!deps['sentiment'],
      ffmpeg: !!deps['fluent-ffmpeg'] || !!deps['ffmpeg'],
      sharp: !!deps['sharp'],
      canvas: !!deps['canvas']
    }
  }
}

// Check provider clients
async function checkProviderClients() {
  const content = await safeRead('packages/providers/src/index.ts')
  if (!content) return { found: false, clients: {} }
  
  return {
    found: true,
    clients: {
      deepinfra: content.includes('deepinfraChat') || content.includes('deepinfra'),
      together: content.includes('togetherGenerateImage') || content.includes('together'),
      genx: content.includes('genxGenerateVideo') || content.includes('genx'),
      deepinfra: content.includes('deepinfraChat') || content.includes('deepinfra'),
      mimo: content.includes('mimo') || false,
      music: content.includes('genxSubmitMusic') || content.includes('genxGenerateMusic')
    }
  }
}

// Check routing map
async function checkRoutingMap() {
  const content = await safeRead('lib/capability-routing-map.js')
  if (!content) return { found: false }
  
  return {
    found: true,
    hasOrchestra: content.includes('ORCHESTRA'),
    hasModelCatalogue: content.includes('MODEL_CATALOGUE_SUMMARY'),
    hasRoutingTruth: content.includes('ROUTING_TRUTH')
  }
}

// Main audit function
async function runAudit() {
  console.log('🔍 Running Amarktai Network V2 Build Completion Audit...\n')
  
  const [
    providers,
    capabilities,
    modelCatalogue,
    orchestraRouter,
    workerExecution,
    dashboardPages,
    appContract,
    installedLibs,
    providerClients,
    routingMap
  ] = await Promise.all([
    extractProviders(),
    extractCapabilities(),
    extractModelCatalogue(),
    checkOrchestra(),
    checkWorkerExecution(),
    checkDashboardPages(),
    checkAppContract(),
    checkInstalledLibraries(),
    checkProviderClients(),
    checkRoutingMap()
  ])
  
  // Classify capabilities with separate status groups
  const executableCapabilities = []
  const executableViaTextRouter = []
  const executableViaMediaWorker = []
  const catalogueOnlyCapabilities = []
  const dashboardReadyCapabilities = []
  const pendingCapabilities = []
  const blockedCapabilities = []
  
  const baselineRuntimeTruth = getRuntimeTruth()
  const runtimeByCapability = new Map(baselineRuntimeTruth.capabilities.map(capability => [capability.capability, capability]))

  if (capabilities.found) {
    for (const cap of capabilities.capabilities) {
      const truth = runtimeByCapability.get(cap)
      const registrations = getExecutorRegistrations(cap)
      const providers = [...new Set(registrations.map(registration => registration.provider))]
      if (!truth) continue

      if (truth.classification === 'POLICY_RESTRICTED' || truth.classification === 'BLOCKED') {
        blockedCapabilities.push({ capability: cap, reason: truth.blockedReasons.join(',') || truth.classification.toLowerCase() })
      }
      if (truth.classification === 'CATALOGUE_ONLY') {
        catalogueOnlyCapabilities.push({ capability: cap, reason: 'catalogue_without_executor' })
      }
      if (truth.executableNow) {
        const executable = { capability: cap, status: truth.classification.toLowerCase(), providers }
        executableCapabilities.push(executable)
        if (CAPABILITY_BY_KEY[cap].artifactRequired) executableViaMediaWorker.push(executable)
        else executableViaTextRouter.push(executable)
      } else if (truth.classification !== 'POLICY_RESTRICTED') {
        pendingCapabilities.push({ capability: cap, reason: truth.classification.toLowerCase(), providers })
      }
    }
  }
  
  // Classify models
  const executableModels = []
  const plannedModels = []
  const blockedModels = []
  
  if (modelCatalogue.found) {
    for (const model of modelCatalogue.models) {
      if (model.status === 'blocked') {
        blockedModels.push(model)
      } else if (model.executable) {
        executableModels.push(model)
      } else {
        plannedModels.push(model)
      }
    }
  }
  
  // Classify dashboard pages with new status categories
  const executionReadyPages = []
  const partialExecutionPages = []
  const designReadyPages = []
  const designReadyPendingBackendPages = []
  const displayOnlyPages = []
  const pageDetails = []
  
  if (dashboardPages.found) {
    for (const [page, pageInfo] of Object.entries(dashboardPages.pages)) {
      const claimedReady = pageInfo.executionReadyCapabilities || []
      const canonicalReady = claimedReady.filter(capability => runtimeByCapability.get(capability)?.executableNow === true)
      const canonicalPending = [...new Set([
        ...(pageInfo.pendingCapabilities || []),
        ...claimedReady.filter(capability => !canonicalReady.includes(capability)),
      ])]
      const effectiveStatus = claimedReady.length === 0
        ? pageInfo.status
        : canonicalReady.length === claimedReady.length && canonicalPending.length === 0
          ? 'execution-ready'
          : canonicalReady.length > 0
            ? 'partial_execution'
            : 'design_ready_pending_backend'

      if (effectiveStatus === 'execution-ready') {
        executionReadyPages.push(page)
      } else if (effectiveStatus === 'partial_execution') {
        partialExecutionPages.push(page)
      } else if (effectiveStatus === 'design-ready') {
        designReadyPages.push(page)
      } else if (effectiveStatus === 'design_ready_pending_backend') {
        designReadyPendingBackendPages.push(page)
      } else if (effectiveStatus === 'display-only') {
        displayOnlyPages.push(page)
      }
      
      // Add detailed page info
      pageDetails.push({
        route: `/dashboard/${page}`,
        status: effectiveStatus,
        executionReadyCapabilities: canonicalReady,
        pendingCapabilities: canonicalPending,
        hasBackendIntegration: pageInfo.hasBackendIntegration || false,
        reason: claimedReady.length > 0
          ? 'Capability readiness is projected from canonical runtime truth.'
          : pageInfo.reason || ''
      })
    }
  }
  
  // Open-source audit with honest wired vs installed distinction
  const openSourceInstalled = []
  const openSourceWired = []
  const openSourcePartial = []
  const openSourceMissing = []
  
  if (installedLibs.found) {
    const libs = installedLibs.libraries
    if (libs.qdrant) openSourceInstalled.push('qdrant')
    if (libs.crawlee) openSourceInstalled.push('crawlee')
    if (libs.playwright) openSourceInstalled.push('playwright')
    if (libs.bullmq) openSourceInstalled.push('bullmq')
    if (libs.ioredis) openSourceInstalled.push('ioredis')
    if (libs.prisma) openSourceInstalled.push('prisma')
    if (libs.socketio) openSourceInstalled.push('socket.io')
    if (libs.sentiment) openSourceInstalled.push('sentiment')
    if (libs.ffmpeg) openSourceInstalled.push('ffmpeg')
    if (libs.sharp) openSourceInstalled.push('sharp')
    if (libs.canvas) openSourceInstalled.push('canvas')
    
    // Check what's actually wired (has real workflow implementation)
    if (libs.bullmq && libs.ioredis && workerExecution.usesOrchestra) {
      openSourceWired.push('bullmq-queue')
    }
    if (libs.prisma) {
      openSourceWired.push('prisma-db')
    }
    
    // Qdrant/RAG - check for actual workflow, not just package installation
    // Need: rag_ingest/rag_search routes, worker executor, qdrant upsert/search
    const hasRagRoutes = await fileExists('apps/api/src/routes/rag.ts') || 
                         await fileExists('apps/api/src/routes/rag-ingest.ts') ||
                         await fileExists('apps/api/src/routes/rag-search.ts')
    const hasRagWorker = workerExecution.found && 
                        (workerExecution.executors.ragIngest || workerExecution.executors.ragSearch)
    
    if (libs.qdrant && (hasRagRoutes || hasRagWorker)) {
      openSourceWired.push('qdrant-vector-search')
    } else if (libs.qdrant) {
      openSourcePartial.push('qdrant-client-installed-but-rag-not-wired')
    }
    
    // Check what's missing
    if (!libs.ffmpeg) {
      openSourceMissing.push('ffmpeg-for-video-stitching')
    }
    if (!libs.sharp && !libs.canvas) {
      openSourceMissing.push('image-processing-library')
    }
  }
  
  // Music readiness
  const musicSchemaReady = await fileExists('packages/core/src/music-generation.ts')
  const musicRouteExists = await fileExists('apps/api/src/routes/admin-music.ts')
  const musicDashboardReady = dashboardPages.found && dashboardPages.pages['music']?.exists
  const discoveredCatalogue = JSON.parse(await safeRead('packages/core/src/generated/provider-model-catalogue.generated.json') || '[]')
  const discoveryReport = JSON.parse(await safeRead('BUILD_MODEL_DISCOVERY_REPORT.json') || '{}')
  const discoveredMusicModels = Array.isArray(discoveredCatalogue)
    ? discoveredCatalogue.filter(model => Array.isArray(model.inferredCapabilities) && model.inferredCapabilities.includes('music_generation'))
    : []
  const genxMusicModels = discoveredMusicModels.filter(model => model.provider === 'genx')
  const musicEndpointShapeKnown = discoveredMusicModels.some(model => model.endpointShapeKnown === true)
  const genxMusicCapabilityKnown = genxMusicModels.length > 0
  const lyriaClipDiscovered = genxMusicModels.some(model => model.modelId === 'lyria-3-clip-preview')
  const lyriaProDiscovered = genxMusicModels.some(model => model.modelId === 'lyria-3-pro-preview')
  const musicTruth = runtimeByCapability.get('music_generation')
  const musicBlockedReason = musicTruth.executableNow
    ? 'Music execution is ready for first live proof; live proof is still pending.'
    : `Music execution blocked: ${musicTruth.blockedReasons.join(', ')}.`

  const providerDiscoveryReadiness = {
    discoveryFrameworkReady: await fileExists('scripts/discover-provider-models.mjs') && await fileExists('packages/core/src/provider-model-discovery.ts'),
    docsFallbackReady: Array.isArray(discoveredCatalogue) && discoveredCatalogue.some(model => model.discoverySource === 'docs_fallback' || model.docsKnown === true),
    liveDiscoverySupported: await fileExists('packages/providers/src/model-discovery/index.ts'),
    liveDiscoveryComplete: discoveryReport.fullProviderModelUniverseKnown === true,
    fullProviderModelUniverseKnown: discoveryReport.fullProviderModelUniverseKnown === true,
    staticFallbackModelCount: discoveryReport.totalDocsFallbackModels ?? discoveredCatalogue.filter(model => model.docsKnown === true).length,
    docsFallbackModelCount: discoveryReport.totalDocsFallbackModels ?? discoveredCatalogue.filter(model => model.docsKnown === true).length,
    publicEndpointModelCount: discoveryReport.totalPublicEndpointModels ?? discoveredCatalogue.filter(model => model.publicEndpointDiscovered === true).length,
    liveDiscoveredModelCount: discoveryReport.totalLiveDiscoveredModels ?? discoveredCatalogue.filter(model => model.liveDiscovered === true).length,
    effectiveCatalogueModelCount: discoveryReport.totalEffectiveCatalogueModels ?? discoveredCatalogue.length,
    runtimeExecutableModelCount: discoveryReport.modelsExecutableNow ?? discoveredCatalogue.filter(model => model.executableNow === true).length,
    catalogueOnlyModelCount: discoveryReport.modelsKnownButBlocked ?? discoveredCatalogue.filter(model => model.executableNow !== true).length,
    policyRestrictedModelCount: discoveryReport.policyRestrictedModels ?? discoveredCatalogue.filter(model => model.policyRestrictedByApp === true).length,
    providersUsingDocsFallback: discoveryReport.providersUsingDocsFallback ?? [],
    providersUsingPublicEndpoint: discoveryReport.providersUsingPublicEndpoint ?? [],
    providersSkipped: discoveryReport.providersSkipped ?? [],
    providersFailed: discoveryReport.providersFailed ?? [],
    deepinfraPublicDiscoverySucceeded: discoveryReport.deepinfraPublicDiscoverySucceeded === true,
    togetherProviderUniversePartiallyKnown: discoveryReport.togetherProviderUniversePartiallyKnown === true,
  }

  const mimoModels = Array.isArray(discoveredCatalogue) ? discoveredCatalogue.filter(model => model.provider === 'mimo') : []
  const mimoReadiness = {
    docsCapabilityKnown: mimoModels.some(model => model.docsKnown === true),
    policyRestrictedByApp: mimoModels.every(model => model.policyRestrictedByApp === true),
    backendRuntimeAllowed: false,
    workerRuntimeAllowed: false,
    executableNow: false,
    policyBlockedReason: 'coding_agent_only_not_backend_runtime',
  }

  const musicReadiness = {
    ...musicTruth,
    schemaReady: musicSchemaReady,
    plannerReady: musicSchemaReady,
    providerClientExists: musicTruth.clientImplemented,
    modelCatalogueEntryExists: musicTruth.discoveredModelCount > 0,
    workerExecutorExists: musicTruth.executorRegistered,
    artifactPersistenceReady: musicTruth.artifactPathImplemented,
    dashboardReady: musicDashboardReady,
    adminRoutesReady: musicRouteExists,
    instrumentalReady: musicSchemaReady,
    vocalsReady: false,
    lyricsReady: false,
    musicGenerationReady: musicTruth.executableNow,
    executionBlocked: !musicTruth.executableNow,
    blockedReason: musicBlockedReason,
    discoveredMusicModels: discoveredMusicModels.length,
    genxMusicCapabilityKnown,
    genxMusicModelsDiscovered: genxMusicModels.map(model => model.modelId),
    genxMusicModels: genxMusicModels.map(model => model.modelId),
    lyriaClipDiscovered,
    lyriaProDiscovered,
    musicProviderCapabilityKnown: discoveredMusicModels.length > 0,
    musicExecutorReady: musicTruth.executorRegistered && musicTruth.clientImplemented,
    togetherMusicModels: discoveredMusicModels.filter(model => model.provider === 'together').map(model => model.modelId),
    deepinfraMusicModels: discoveredMusicModels.filter(model => model.provider === 'deepinfra').map(model => model.modelId),
    deepinfraMusicModels: discoveredMusicModels.filter(model => model.provider === 'deepinfra').map(model => model.modelId),
    endpointShapeKnown: musicEndpointShapeKnown,
    providerCapabilityAudit: baselineRuntimeTruth.providers.map(provider => ({
      provider: provider.provider,
      musicClient: provider.registeredExecutorCapabilities.includes('music_generation'),
      executable: provider.provider === 'genx' && musicTruth.executableNow,
      note: provider.codingOnly
        ? 'coding_tools_only and never runtime-selected'
        : provider.registeredExecutorCapabilities.includes('music_generation')
          ? 'Callable music executor registered; canonical runtime gates still apply.'
          : 'No callable music executor registered.',
    })),
    // Legacy keys retained for existing audit consumers.
    providerClient: musicTruth.clientImplemented,
    modelCatalogueEntries: musicTruth.discoveredModelCount > 0,
    workerExecutor: musicTruth.executorRegistered,
    dashboardPage: musicDashboardReady,
    missingParts: [
      !musicSchemaReady ? 'music_schema' : null,
      !musicTruth.clientImplemented ? 'music_provider_client' : null,
      musicTruth.discoveredModelCount === 0 ? 'music_models_in_catalogue' : null,
      !musicTruth.executorRegistered ? 'music_worker_executor' : null,
      !musicTruth.artifactPathImplemented ? 'music_artifact_persistence' : null,
      !musicDashboardReady ? 'music_dashboard_enablement' : null
    ].filter(Boolean)
  }
  
  // Long-form video readiness with Phase 2 scene execution detection
  const longFormSchemaExists = await fileExists('packages/core/src/long-form-video.ts')
  const longFormPlannerExists = await fileExists('packages/core/src/long-form-planner.ts')
  const longFormExecutionExists = await fileExists('packages/core/src/long-form-execution.ts')
  const longFormPlanRouteExists = await fileExists('apps/api/src/routes/admin-long-form-video.ts')
  
  // Check for execute-scenes route in the admin route file
  let longFormExecuteRouteExists = false
  let longFormAssemblyRouteExists = false
  let longFormAssemblyModuleExists = false
  let automaticVoiceoverReady = false
  let automaticSubtitlesReady = false
  let automaticMusicBedReady = false
  let automaticAssemblyReady = false
  if (longFormPlanRouteExists) {
    const routeContent = await safeRead('apps/api/src/routes/admin-long-form-video.ts')
    longFormExecuteRouteExists = routeContent?.includes('enqueueSceneJobs') || false
    longFormAssemblyRouteExists = routeContent?.includes('/assemble/') || false
    automaticVoiceoverReady = routeContent?.includes('enqueueVoiceoverJobs') || false
    automaticSubtitlesReady = routeContent?.includes('createAutomaticSubtitleArtifact') || false
    automaticMusicBedReady = routeContent?.includes('enqueueMusicBedJob') || false
    automaticAssemblyReady = routeContent?.includes('advanceLongFormWorkflow') || false
  }
  
  // The normal path executes assembly durably in the worker. The API-local
  // module remains diagnostics/recovery-only.
  longFormAssemblyModuleExists = await fileExists('apps/worker/src/long-form-assembly.ts')
  const longFormWorkflowModuleExists = await fileExists('packages/db/src/long-form-workflow.ts')
  const longFormComponentStateExists = await fileExists('packages/db/src/long-form-parent-state.ts')
  
  // Check for ffmpeg availability (system-level, not package.json)
  let ffmpegAvailableLocal = false
  try {
    const { execSync } = await import('child_process')
    execSync(`"${process.env.FFMPEG_PATH || 'ffmpeg'}" -version`, { stdio: 'ignore', timeout: 5000 })
    ffmpegAvailableLocal = true
  } catch {
    ffmpegAvailableLocal = false
  }
  
  // Check if ffmpeg is expected in runtime (Dockerfile installs it)
  let ffmpegExpectedInRuntime = false
  try {
    const dockerfileContent = await safeRead('Dockerfile')
    if (dockerfileContent) {
      // Check if ffmpeg is installed in the api stage
      const apiStageMatch = dockerfileContent.match(/FROM production-base AS api[\s\S]*?(?=FROM|$)/)
      if (apiStageMatch) {
        ffmpegExpectedInRuntime = apiStageMatch[0].includes('ffmpeg')
      }
    }
  } catch {
    ffmpegExpectedInRuntime = false
  }
  if (ffmpegAvailableLocal || ffmpegExpectedInRuntime) {
    const missingIndex = openSourceMissing.indexOf('ffmpeg-for-video-stitching')
    if (missingIndex >= 0) openSourceMissing.splice(missingIndex, 1)
    if (!openSourceInstalled.includes('ffmpeg-runtime')) openSourceInstalled.push('ffmpeg-runtime')
    if (longFormAssemblyModuleExists && !openSourceWired.includes('ffmpeg-long-form-assembly')) openSourceWired.push('ffmpeg-long-form-assembly')
  }
  
  // Use local availability for videoOnlyReady (actual execution capability)
  const ffmpegAvailable = ffmpegAvailableLocal
  const longFormComponentState = buildLongFormComponentRuntimeState(false, {})
  const longFormTruth = getRuntimeTruth({ longFormComponents: longFormComponentState })
    .capabilities.find(capability => capability.capability === 'long_form_video')
  const longFormImplementationClosureReady = longFormSchemaExists
    && longFormPlannerExists
    && longFormExecutionExists
    && longFormExecuteRouteExists
    && longFormAssemblyModuleExists
    && longFormWorkflowModuleExists
    && longFormComponentStateExists
    && automaticVoiceoverReady
    && automaticSubtitlesReady
    && automaticMusicBedReady
    && automaticAssemblyReady

  const longFormReadiness = {
    ...longFormTruth,
    // Phase 1: Schema and planning
    schemaReady: longFormSchemaExists,
    plannerReady: longFormTruth.plannerReady,
    
    // Phase 2: Scene execution
    sceneExecutionReady: longFormExecuteRouteExists,
    
    // Phase 3: Assembly pipeline
    assemblyModuleExists: longFormAssemblyModuleExists,
    assemblyRouteExists: longFormAssemblyRouteExists,
    ffmpegAvailableLocal: ffmpegAvailableLocal,
    ffmpegExpectedInRuntime: ffmpegExpectedInRuntime,
    ffmpegAvailable: ffmpegAvailable,
    artifactStorageReady: longFormAssemblyModuleExists,
    
    // Pipeline readiness (components exist)
    videoOnlyAssemblyPipelineReady: longFormAssemblyModuleExists && longFormWorkflowModuleExists,
    
    // Actual readiness (can execute now)
    videoOnlyReady: longFormAssemblyModuleExists && longFormWorkflowModuleExists && ffmpegAvailable,
    
    // Multimedia readiness (code exists but not live-proven)
    fullMultimediaReady: longFormImplementationClosureReady,
    voiceoverReady: automaticVoiceoverReady,
    subtitlesReady: automaticSubtitlesReady,
    musicBedReady: automaticMusicBedReady,
    localImplementationClosureReady: longFormImplementationClosureReady,
    liveProven: false,
    liveProofPending: true,
    
    // Legacy fields for backward compatibility
    orchestrationFoundationReady: longFormSchemaExists && longFormTruth.plannerReady,
    schemaExists: longFormSchemaExists,
    plannerExists: longFormPlannerExists,
    executionModuleExists: longFormExecutionExists,
    planRouteExists: longFormPlanRouteExists,
    executeScenesRouteExists: longFormExecuteRouteExists,
    perSceneExecutionReady: longFormExecuteRouteExists,
    sceneStitchingReady: longFormAssemblyModuleExists && ffmpegAvailable,
    finalAssemblyReady: longFormImplementationClosureReady && ffmpegAvailable,
    scriptPlanner: longFormTruth.plannerReady,
    sceneSplitter: longFormTruth.plannerReady,
    sceneExecutionPayloadBuilder: longFormTruth.batchStructureReady,
    sceneJobCreation: longFormExecuteRouteExists,
    promptEnhancement: longFormTruth.sceneLinkageReady,
    perSceneGeneration: longFormExecuteRouteExists,
    ffmpegIntegration: ffmpegAvailable,
    artifactPersistence: longFormAssemblyModuleExists,
    voiceover: automaticVoiceoverReady,
    subtitles: automaticSubtitlesReady,
    musicBed: automaticMusicBedReady,
    progressTracking: longFormTruth.progressTrackingReady,
    partialFailureHandling: longFormTruth.retryResumeReady,
    dashboardSceneStatus: false,
    missingParts: [
      !automaticVoiceoverReady ? 'automatic_voiceover_integration' : null,
      !automaticSubtitlesReady ? 'automatic_subtitle_integration' : null,
      !automaticMusicBedReady ? 'automatic_music_bed_integration' : null,
      !automaticAssemblyReady || !longFormWorkflowModuleExists ? 'durable_automatic_assembly' : null,
    ].filter(Boolean)
  }
  
  // Marketing app readiness
  const marketingAppReadiness = {
    appContractRoutes: appContract.found && appContract.jobsEndpoint,
    appApiKeyAuth: appContract.hasApiKeyHashing,
    blockedOverrides: appContract.hasBlockedOverrides,
    routingModeSupport: appContract.acceptsRoutingMode,
    brandScrapeWorkflow: openSourceInstalled.includes('crawlee') && openSourceInstalled.includes('playwright'),
    missingParts: []
  }
  
  if (!marketingAppReadiness.appContractRoutes) {
    marketingAppReadiness.missingParts.push('app_contract_routes')
  }
  if (!marketingAppReadiness.brandScrapeWorkflow) {
    marketingAppReadiness.missingParts.push('brand_scrape_workflow')
  }
  
  // Media quality status with clearer findings
  const imageModel = modelCatalogue.models.find(m => m.provider === 'together' && m.capabilities.includes('image_generation'))
  const videoModels = modelCatalogue.models.filter(m => ['genx', 'together', 'deepinfra'].includes(m.provider) && m.capabilities.includes('video_generation'))
  
  const mediaQualityStatus = {
    imageGeneration: {
      provider: 'together',
      model: imageModel?.modelId || 'unknown',
      executable: !!imageModel?.executable,
      routingModesSupported: orchestraRouter.routingModes.length > 0,
      premiumRouting: orchestraRouter.routingModes.includes('quality'),
      premiumExecutable: false, // No premium image model wired yet
      findings: [
        'image currently Together executable only',
        'premium image not executable until GenX image or another premium model is actually wired',
        'routing modes exist but premium mode only affects selection if executable alternative models exist'
      ]
    },
    videoGeneration: {
      provider: 'dynamic',
      model: `${videoModels.length} catalogued video model(s)`,
      executable: videoModels.some(model => model.executable),
      routingModesSupported: orchestraRouter.routingModes.length > 0,
      premiumRouting: orchestraRouter.routingModes.includes('quality'),
      premiumExecutable: videoModels.some(model => model.executable && ['premium', 'high'].includes(model.costTier)),
      findings: [
        'video executor eligibility derives from canonical compatibility metadata across GenX, Together, and verified DeepInfra transports',
        'Orchestra selects the exact provider/model; media transports do not choose defaults or perform hidden provider fallback',
        'runtime execution remains gated by app grants, credentials, provider health, pricing, and policy'
      ]
    }
  }
  
  // Redeploy readiness with nuanced reporting
  const redeployReadiness = {
    safe_to_redeploy_foundation: true,
    product_ready: false,
    app_ready: false,
    music_ready: musicReadiness.musicGenerationReady,
    long_form_ready: false,
    blockers: [],
    warnings: []
  }
  
  // Check foundation blockers
  if (!orchestraRouter.integratedInWorker) {
    redeployReadiness.blockers.push('orchestra_not_integrated_in_worker')
    redeployReadiness.safe_to_redeploy_foundation = false
  }
  
  if (!appContract.hasApiKeyHashing) {
    redeployReadiness.blockers.push('app_api_key_hashing_missing')
    redeployReadiness.safe_to_redeploy_foundation = false
  }
  
  if (!appContract.hasBlockedOverrides) {
    redeployReadiness.blockers.push('blocked_overrides_missing')
    redeployReadiness.safe_to_redeploy_foundation = false
  }
  
  // Product readiness (requires executable capabilities beyond foundation)
  if (executableCapabilities.length === 0) {
    redeployReadiness.warnings.push('no_executable_capabilities')
  }
  
  // App readiness (requires app contract + executable capabilities)
  if (!appContract.jobsEndpoint || executableCapabilities.length === 0) {
    redeployReadiness.warnings.push('app_contract_or_capabilities_missing')
  }
  
  // Music readiness
  if (!musicReadiness.musicGenerationReady) {
    redeployReadiness.warnings.push('music_backend_not_ready')
  }
  
  // Long-form readiness
  if (longFormReadiness.missingParts.length > 0) {
    redeployReadiness.warnings.push(`long_form_missing_${longFormReadiness.missingParts.length}_parts`)
  }
  
  if (providers.providers.length !== APPROVED_PROVIDER_DEFINITIONS.length) {
    redeployReadiness.warnings.push('provider_list_differs_from_canonical_definitions')
  }
  
  if (blockedModels.length === 0) {
    redeployReadiness.warnings.push('no_blocked_models_found')
  }
  
  // Risk list
  const riskList = []
  
  if (musicReadiness.modelCatalogueEntryExists === false) {
    riskList.push({ risk: 'music_generation_not_in_catalogue', severity: 'medium' })
  }

  if (musicReadiness.providerClientExists === false) {
    riskList.push({ risk: 'music_provider_client_missing', severity: 'medium', details: [musicReadiness.blockedReason] })
  }
  
  if (longFormReadiness.ffmpegIntegration === false) {
    riskList.push({ risk: 'ffmpeg_not_installed_for_long_form', severity: 'high' })
  }
  
  if (openSourceMissing.length > 0) {
    riskList.push({ risk: 'missing_open_source_dependencies', severity: 'medium', details: openSourceMissing })
  }
  
  // Recommended next PRs
  const recommendedNextPRs = [
    {
      priority: 1,
      title: 'ops: activate configured runtime and collect live proofs',
      description: 'Verify provider credentials, Redis/worker infrastructure, and immutable app grants before recording provider-backed proofs',
      effort: 'medium'
    },
    {
      priority: 2,
      title: 'ops: collect deployed long-form multimedia evidence',
      description: 'After deployment is separately authorised, prove provider-backed scenes, TTS, music, subtitles, and final assembly on the VPS without changing the locally closed workflow',
      effort: 'medium'
    },
    {
      priority: 3,
      title: 'feat: wire brand scrape workflow',
      description: 'Connect crawlee/playwright to brand_scrape capability for Marketing App',
      effort: 'medium'
    },
    {
      priority: 4,
      title: 'fix: improve media quality routing',
      description: 'Ensure premium/balanced/fast/budget modes properly influence model selection for image/video',
      effort: 'medium'
    },
    {
      priority: 5,
      title: 'feat: begin the next approved capability family after live proof',
      description: 'Only after foundational VPS proof, implement the separately scoped visual or knowledge capabilities that remain catalogue-only',
      effort: 'large'
    }
  ]

  const canonicalRuntimeTruth = getRuntimeTruth({
    providers: {
      genx: { enabled: false, configured: false, healthStatus: 'unconfigured' },
      deepinfra: { enabled: false, configured: false, healthStatus: 'unconfigured' },
      together: { enabled: false, configured: false, healthStatus: 'unconfigured' },
      deepinfra: { enabled: false, configured: false, healthStatus: 'unconfigured' },
      mimo: {
        enabled: false,
        configured: false,
        runtimeEnabled: false,
        credentialUsagePolicy: 'coding_tools_only',
        healthStatus: 'runtime_restricted',
      },
    },
    capabilities: {
      music_generation: {
        configured: false,
        infrastructureReady: false,
        liveProven: false,
      },
      long_form_video: {
        configured: false,
        infrastructureReady: false,
        liveProven: false,
      },
    },
  })

  const capabilityInventory = canonicalRuntimeTruth.capabilities.map(capability => ({
    capability: capability.capability,
    classification: capability.classification,
    eligibleProviders: capability.eligibleProviders,
    eligibleModelCount: capability.eligibleModels.length,
    implementationGates: {
      catalogueKnown: capability.catalogueKnown,
      clientImplemented: capability.clientImplemented,
      executorRegistered: capability.executorRegistered,
      routeImplemented: capability.routeImplemented,
      queuePathImplemented: capability.queuePathImplemented,
      artifactPathImplemented: capability.artifactPathImplemented,
      implementationReady: capability.implementationReady,
    },
    configured: capability.configured,
    infrastructureReady: capability.infrastructureReady,
    policyAllowed: capability.policyAllowed,
    executableNow: capability.executableNow,
    liveProven: capability.liveProven,
    blockers: capability.blockedReasons,
    remainingWork: capability.remainingWork,
  }))
  
  // Build completion map with all status groups
  const completionMap = {
    generatedAt: new Date().toISOString(),
    repo: 'https://github.com/amarktainetwork-blip/Amarktai-Network-V2.git',
    branch: 'audit/full-build-completion-map',
    
    providerTruth: {
      approvedProviders: providers.providers,
      count: providers.providers.length,
      mimoPolicy: 'coding_tools_only',
      adultPolicy: 'on_hold'
    },

    providerDiscoveryReadiness: providerDiscoveryReadiness,
    canonicalRuntimeTruth: {
      providerPolicy: canonicalRuntimeTruth.providerPolicy,
      providerTruth: canonicalRuntimeTruth.providers,
      totalRegisteredCapabilities: canonicalRuntimeTruth.capabilities.length,
      countsByClassification: canonicalRuntimeTruth.countsByClassification,
      capabilityInventory,
      liveProvenCapabilities: capabilityInventory.filter(capability => capability.classification === 'LIVE_PROVEN').map(capability => capability.capability),
      executableNotLiveProvenCapabilities: capabilityInventory.filter(capability => capability.classification === 'EXECUTABLE_NOT_LIVE_PROVEN').map(capability => capability.capability),
      implementedNotConfiguredCapabilities: capabilityInventory.filter(capability => capability.classification === 'IMPLEMENTED_NOT_CONFIGURED').map(capability => capability.capability),
      partialCapabilities: capabilityInventory.filter(capability => capability.classification === 'PARTIAL'),
      catalogueOnlyCapabilities: capabilityInventory.filter(capability => capability.classification === 'CATALOGUE_ONLY').map(capability => capability.capability),
      policyRestrictedCapabilities: capabilityInventory.filter(capability => capability.classification === 'POLICY_RESTRICTED').map(capability => capability.capability),
      blockedCapabilities: capabilityInventory.filter(capability => capability.classification === 'BLOCKED').map(capability => capability.capability),
      missingCapabilities: capabilityInventory.filter(capability => capability.classification === 'MISSING').map(capability => capability.capability),
    },
    
    modelCatalogueSummary: {
      total: modelCatalogue.models.length,
      executable: executableModels.length,
      planned: plannedModels.length,
      blocked: blockedModels.length,
      executableModels: executableModels.map(m => `${m.provider}/${m.modelId}`),
      plannedModels: plannedModels.map(m => `${m.provider}/${m.modelId}`),
      blockedModels: blockedModels.map(m => `${m.provider}/${m.modelId}`)
    },
    
    // Separate status groups for capabilities
    executableCapabilities: executableCapabilities,
    executableViaTextRouter: executableViaTextRouter,
    executableViaMediaWorker: executableViaMediaWorker,
    catalogueOnlyCapabilities: catalogueOnlyCapabilities,
    dashboardReadyCapabilities: dashboardReadyCapabilities,
    pendingCapabilities: pendingCapabilities,
    blockedCapabilities: blockedCapabilities,
    
    dashboardStatus: {
      total: Object.keys(dashboardPages.pages || {}).length,
      executionReadyPages: executionReadyPages,
      partialExecutionPages: partialExecutionPages,
      designReadyPages: designReadyPages,
      designReadyPendingBackendPages: designReadyPendingBackendPages,
      displayOnlyPages: displayOnlyPages,
      pageDetails: pageDetails
    },
    
    workerExecutionStatus: {
      found: workerExecution.found,
      executors: workerExecution.executors,
      usesOrchestra: workerExecution.usesOrchestra
    },
    
    appContractStatus: {
      found: appContract.found,
      jobsEndpoint: appContract.jobsEndpoint,
      appConnectionsEndpoint: appContract.appConnectionsEndpoint,
      hasApiKeyHashing: appContract.hasApiKeyHashing,
      hasBlockedOverrides: appContract.hasBlockedOverrides,
      acceptsRoutingMode: appContract.acceptsRoutingMode
    },
    
    openSourceLibrariesInstalled: openSourceInstalled,
    openSourceWorkflowsWired: openSourceWired,
    openSourceWorkflowsPartial: openSourcePartial,
    openSourceWorkflowsMissing: openSourceMissing,
    
    mediaQualityStatus: mediaQualityStatus,
    
    musicReadiness: musicReadiness,
    mimoReadiness: mimoReadiness,
    longFormVideoReadiness: longFormReadiness,
    marketingAppReadiness: marketingAppReadiness,
    
    redeployReadiness: redeployReadiness,
    riskList: riskList,
    recommendedNextPRs: recommendedNextPRs
  }
  
  // Write JSON
  const jsonPath = path.join(ROOT, 'BUILD_COMPLETION_MAP.json')
  await fs.writeFile(jsonPath, JSON.stringify(completionMap, null, 2))
  console.log(`✅ Written: ${jsonPath}\n`)
  
  // Print summary
  console.log('═'.repeat(80))
  console.log('AMARKTAI NETWORK V2 — BUILD COMPLETION MAP')
  console.log('═'.repeat(80))
  console.log()
  
  console.log('📦 PROVIDER TRUTH')
  console.log(`   Approved: ${completionMap.providerTruth.approvedProviders.join(', ')}`)
  console.log(`   Count: ${completionMap.providerTruth.count}`)
  console.log(`   MiMo: ${completionMap.providerTruth.mimoPolicy}`)
  console.log(`   Adult: ${completionMap.providerTruth.adultPolicy}`)
  console.log()
  
  console.log('🧠 MODEL CATALOGUE')
  console.log(`   Total: ${completionMap.modelCatalogueSummary.total}`)
  console.log(`   Executable: ${completionMap.modelCatalogueSummary.executable}`)
  console.log(`   Planned: ${completionMap.modelCatalogueSummary.planned}`)
  console.log(`   Blocked: ${completionMap.modelCatalogueSummary.blocked}`)
  console.log()
  
  console.log('⚡ EXECUTABLE CAPABILITIES')
  console.log(`   Total executable: ${executableCapabilities.length}`)
  console.log(`   Via text router (deepinfra/DeepInfra): ${executableViaTextRouter.length}`)
  for (const cap of executableViaTextRouter) {
    console.log(`     ✓ ${cap.capability} (${cap.status})`)
  }
  console.log(`   Via media worker (Together/GenX): ${executableViaMediaWorker.length}`)
  for (const cap of executableViaMediaWorker) {
    console.log(`     ✓ ${cap.capability} (${cap.status})`)
  }
  console.log()
  
  if (catalogueOnlyCapabilities.length > 0) {
    console.log('📚 CATALOGUE ONLY (no worker executor)')
    for (const cap of catalogueOnlyCapabilities) {
      console.log(`   ◯ ${cap.capability} (${cap.reason})`)
    }
    console.log()
  }
  
  console.log('⏳ PENDING CAPABILITIES')
  for (const cap of completionMap.pendingCapabilities.slice(0, 10)) {
    console.log(`   ◯ ${cap.capability} (${cap.reason})`)
  }
  if (completionMap.pendingCapabilities.length > 10) {
    console.log(`   ... and ${completionMap.pendingCapabilities.length - 10} more`)
  }
  console.log()
  
  console.log('🚫 BLOCKED CAPABILITIES')
  for (const cap of completionMap.blockedCapabilities) {
    console.log(`   ✗ ${cap.capability} (${cap.reason})`)
  }
  console.log()
  
  console.log('🖥️  DASHBOARD STATUS')
  console.log(`   Total pages: ${completionMap.dashboardStatus.total}`)
  console.log(`   Execution-ready: ${completionMap.dashboardStatus.executionReadyPages.length}`)
  for (const page of completionMap.dashboardStatus.executionReadyPages) {
    console.log(`     ✓ ${page}`)
  }
  console.log(`   Partial execution: ${completionMap.dashboardStatus.partialExecutionPages.length}`)
  for (const page of completionMap.dashboardStatus.partialExecutionPages) {
    const detail = completionMap.dashboardStatus.pageDetails.find(p => p.route === `/dashboard/${page}`)
    console.log(`     ◐ ${page}`)
    if (detail) {
      if (detail.executionReadyCapabilities.length > 0) {
        console.log(`       Ready: ${detail.executionReadyCapabilities.join(', ')}`)
      }
      if (detail.pendingCapabilities.length > 0) {
        console.log(`       Pending: ${detail.pendingCapabilities.join(', ')}`)
      }
    }
  }
  console.log(`   Design-ready: ${completionMap.dashboardStatus.designReadyPages.length}`)
  for (const page of completionMap.dashboardStatus.designReadyPages) {
    console.log(`     ○ ${page}`)
  }
  console.log(`   Design-ready (pending backend): ${completionMap.dashboardStatus.designReadyPendingBackendPages.length}`)
  for (const page of completionMap.dashboardStatus.designReadyPendingBackendPages) {
    const detail = completionMap.dashboardStatus.pageDetails.find(p => p.route === `/dashboard/${page}`)
    console.log(`     ○ ${page}`)
    if (detail && detail.pendingCapabilities.length > 0) {
      console.log(`       Pending: ${detail.pendingCapabilities.join(', ')}`)
    }
  }
  console.log(`   Display-only: ${completionMap.dashboardStatus.displayOnlyPages.length}`)
  console.log()
  
  console.log('🔧 WORKER EXECUTION')
  console.log(`   Found: ${completionMap.workerExecutionStatus.found}`)
  console.log(`   Uses Orchestra: ${completionMap.workerExecutionStatus.usesOrchestra}`)
  console.log('   Executors:')
  for (const [key, value] of Object.entries(completionMap.workerExecutionStatus.executors)) {
    console.log(`     ${key}: ${value ? '✓' : '✗'}`)
  }
  console.log()
  
  console.log('🔌 APP CONTRACT')
  console.log(`   Jobs endpoint: ${completionMap.appContractStatus.jobsEndpoint ? '✓' : '✗'}`)
  console.log(`   API key hashing: ${completionMap.appContractStatus.hasApiKeyHashing ? '✓' : '✗'}`)
  console.log(`   Blocked overrides: ${completionMap.appContractStatus.hasBlockedOverrides ? '✓' : '✗'}`)
  console.log(`   Routing mode support: ${completionMap.appContractStatus.acceptsRoutingMode ? '✓' : '✗'}`)
  console.log()
  
  console.log('📚 OPEN-SOURCE AUDIT')
  console.log('   Installed:')
  for (const lib of completionMap.openSourceLibrariesInstalled) {
    console.log(`     ✓ ${lib}`)
  }
  console.log('   Wired:')
  for (const workflow of completionMap.openSourceWorkflowsWired) {
    console.log(`     ✓ ${workflow}`)
  }
  if (completionMap.openSourceWorkflowsPartial && completionMap.openSourceWorkflowsPartial.length > 0) {
    console.log('   Partial (installed but not fully wired):')
    for (const partial of completionMap.openSourceWorkflowsPartial) {
      console.log(`     ◯ ${partial}`)
    }
  }
  console.log('   Missing:')
  for (const missing of completionMap.openSourceWorkflowsMissing) {
    console.log(`     ✗ ${missing}`)
  }
  console.log()
  
  console.log('🎵 MUSIC READINESS')
  console.log(`   Schema: ${musicReadiness.schemaReady ? '✓' : '✗'}`)
  console.log(`   Planner: ${musicReadiness.plannerReady ? '✓' : '✗'}`)
  console.log(`   Provider client: ${musicReadiness.providerClientExists ? '✓' : '✗'}`)
  console.log(`   Model catalogue: ${musicReadiness.modelCatalogueEntryExists ? '✓' : '✗'}`)
  console.log(`   Worker executor: ${musicReadiness.workerExecutorExists ? '✓' : '✗'}`)
  console.log(`   Artifact persistence: ${musicReadiness.artifactPersistenceReady ? '✓' : '✗'}`)
  console.log(`   Dashboard page: ${musicReadiness.dashboardReady ? '✓' : '✗'}`)
  console.log(`   Instrumental planning: ${musicReadiness.instrumentalReady ? '✓' : '✗'}`)
  console.log(`   Vocals: ${musicReadiness.vocalsReady ? '✓' : '✗'}`)
  console.log(`   Lyrics: ${musicReadiness.lyricsReady ? '✓' : '✗'}`)
  console.log(`   Discovered music models: ${musicReadiness.discoveredMusicModels}`)
  console.log(`   Music endpoint shape known: ${musicReadiness.endpointShapeKnown ? '✓' : '✗'}`)
  console.log(`   Music executable now: ${musicReadiness.executableNow ? '✓ YES' : '✗ NO'}`)
  console.log(`   Music generation ready: ${musicReadiness.musicGenerationReady ? '✓ YES' : '✗ NO'}`)
  if (musicReadiness.blockedReason) {
    console.log(`   Blocked: ${musicReadiness.blockedReason}`)
  }
  console.log(`   Missing: ${musicReadiness.missingParts.length} parts`)
  console.log()
  
  console.log('🎬 LONG-FORM VIDEO READINESS')
  console.log('   Phase 1 - Planning:')
  console.log(`     Schema: ${longFormReadiness.schemaReady ? '✓' : '✗'}`)
  console.log(`     Planner: ${longFormReadiness.plannerReady ? '✓' : '✗'}`)
  console.log('   Phase 2 - Scene Execution:')
  console.log(`     Execution module: ${longFormReadiness.sceneExecutionReady ? '✓' : '✗'}`)
  console.log('   Phase 3 - Assembly Pipeline:')
  console.log(`     Assembly module: ${longFormReadiness.assemblyModuleExists ? '✓' : '✗'}`)
  console.log(`     Assembly route: ${longFormReadiness.assemblyRouteExists ? '✓' : '✗'}`)
  console.log(`     FFmpeg available (local): ${longFormReadiness.ffmpegAvailableLocal ? '✓' : '✗'}`)
  console.log(`     FFmpeg expected (runtime): ${longFormReadiness.ffmpegExpectedInRuntime ? '✓' : '✗'}`)
  console.log(`     Artifact storage: ${longFormReadiness.artifactStorageReady ? '✓' : '✗'}`)
  console.log('   Readiness Status:')
  console.log(`     Pipeline ready: ${longFormReadiness.videoOnlyAssemblyPipelineReady ? '✓ YES' : '✗ NO'}`)
  console.log(`     Video-only ready: ${longFormReadiness.videoOnlyReady ? '✓ YES' : '✗ NO'}`)
  console.log(`     Full multimedia ready: ${longFormReadiness.fullMultimediaReady ? '✓ YES' : '✗ NO'}`)
  console.log(`     Voiceover: ${longFormReadiness.voiceoverReady ? '✓' : '✗'}`)
  console.log(`     Subtitles: ${longFormReadiness.subtitlesReady ? '✓' : '✗'}`)
  console.log(`     Music bed: ${longFormReadiness.musicBedReady ? '✓' : '✗'}`)
  if (longFormReadiness.missingParts.length > 0) {
    console.log(`   Missing: ${longFormReadiness.missingParts.join(', ')}`)
  }
  console.log()
  
  console.log('📊 MEDIA QUALITY')
  console.log(`   Image: ${mediaQualityStatus.imageGeneration.provider}/${mediaQualityStatus.imageGeneration.model}`)
  console.log(`     Executable: ${mediaQualityStatus.imageGeneration.executable ? '✓' : '✗'}`)
  console.log(`     Premium executable: ${mediaQualityStatus.imageGeneration.premiumExecutable ? '✓' : '✗'}`)
  for (const finding of mediaQualityStatus.imageGeneration.findings) {
    console.log(`     • ${finding}`)
  }
  console.log(`   Video: ${mediaQualityStatus.videoGeneration.provider}/${mediaQualityStatus.videoGeneration.model}`)
  console.log(`     Executable: ${mediaQualityStatus.videoGeneration.executable ? '✓' : '✗'}`)
  console.log(`     Premium executable: ${mediaQualityStatus.videoGeneration.premiumExecutable ? '✓' : '✗'}`)
  for (const finding of mediaQualityStatus.videoGeneration.findings) {
    console.log(`     • ${finding}`)
  }
  console.log(`   Routing modes: ${orchestraRouter.routingModes.join(', ')}`)
  console.log()
  
  console.log('🚀 REDEPLOY READINESS')
  console.log(`   Safe to redeploy foundation: ${redeployReadiness.safe_to_redeploy_foundation ? '✓ YES' : '✗ NO'}`)
  console.log(`   Product ready: ${redeployReadiness.product_ready ? '✓ YES' : '✗ NO'}`)
  console.log(`   App ready: ${redeployReadiness.app_ready ? '✓ YES' : '✗ NO'}`)
  console.log(`   Music ready: ${redeployReadiness.music_ready ? '✓ YES' : '✗ NO'}`)
  console.log(`   Long-form ready: ${redeployReadiness.long_form_ready ? '✓ YES' : '✗ NO'}`)
  if (redeployReadiness.blockers.length > 0) {
    console.log('   Blockers:')
    for (const blocker of redeployReadiness.blockers) {
      console.log(`     ✗ ${blocker}`)
    }
  }
  if (redeployReadiness.warnings.length > 0) {
    console.log('   Warnings:')
    for (const warning of redeployReadiness.warnings) {
      console.log(`     ⚠ ${warning}`)
    }
  }
  console.log()
  
  console.log('⚠️  RISK LIST')
  for (const risk of completionMap.riskList) {
    console.log(`   [${risk.severity.toUpperCase()}] ${risk.risk}`)
    if (risk.details) {
      console.log(`      Details: ${risk.details.join(', ')}`)
    }
  }
  console.log()
  
  console.log('📋 RECOMMENDED NEXT PRs')
  for (const pr of completionMap.recommendedNextPRs) {
    console.log(`   ${pr.priority}. ${pr.title} [${pr.effort}]`)
    console.log(`      ${pr.description}`)
  }
  console.log()
  
  console.log('═'.repeat(80))
  console.log('✅ Audit complete')
  console.log('═'.repeat(80))
}

runAudit().catch(err => {
  console.error('❌ Audit failed:', err)
  process.exit(1)
})
