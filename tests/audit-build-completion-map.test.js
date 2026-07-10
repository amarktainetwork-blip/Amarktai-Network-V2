import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const AUDIT_SCRIPT = join(ROOT, 'scripts/audit-build-completion-map.mjs')
const AUDIT_OUTPUT = join(ROOT, 'BUILD_COMPLETION_MAP.json')

describe('Build Completion Audit', () => {
  let auditOutput

  beforeAll(() => {
    // Run the audit script
    execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, stdio: 'pipe' })
    
    // Read the output
    const content = readFileSync(AUDIT_OUTPUT, 'utf-8')
    auditOutput = JSON.parse(content)
  })

  it('audit script exists', () => {
    expect(existsSync(AUDIT_SCRIPT)).toBe(true)
  })

  it('audit script runs without provider keys', () => {
    // Script should run successfully without any env vars
    expect(() => {
      execSync(`node ${AUDIT_SCRIPT}`, { 
        cwd: ROOT, 
        stdio: 'pipe',
        env: { ...process.env, GROQ_API_KEY: '', TOGETHER_API_KEY: '', GENX_API_KEY: '' }
      })
    }).not.toThrow()
  })

  it('audit script writes BUILD_COMPLETION_MAP.json', () => {
    expect(existsSync(AUDIT_OUTPUT)).toBe(true)
    expect(auditOutput).toBeDefined()
    expect(auditOutput.generatedAt).toBeDefined()
  })

  it('audit detects approved providers exactly', () => {
    expect(auditOutput.providerTruth).toBeDefined()
    expect(auditOutput.providerTruth.approvedProviders).toEqual([
      'genx',
      'groq',
      'together',
      'mimo',
      'deepinfra'
    ])
    expect(auditOutput.providerTruth.count).toBe(5)
  })

  it('audit detects executable capabilities', () => {
    expect(auditOutput.executableCapabilities).toBeDefined()
    expect(Array.isArray(auditOutput.executableCapabilities)).toBe(true)
    
    const executableCapIds = auditOutput.executableCapabilities.map(c => c.capability)
    expect(executableCapIds).toContain('chat')
    expect(executableCapIds).toContain('image_generation')
    expect(executableCapIds).toContain('video_generation')
  })

  it('audit detects music pending', () => {
    expect(auditOutput.pendingCapabilities).toBeDefined()
    const pendingCapIds = auditOutput.pendingCapabilities.map(c => c.capability)
    expect(pendingCapIds).toContain('music_generation')
  })

  it('audit detects long_form_video pending', () => {
    expect(auditOutput.pendingCapabilities).toBeDefined()
    const pendingCapIds = auditOutput.pendingCapabilities.map(c => c.capability)
    expect(pendingCapIds).toContain('long_form_video')
  })

  it('audit detects open-source installed vs wired difference', () => {
    expect(auditOutput.openSourceLibrariesInstalled).toBeDefined()
    expect(auditOutput.openSourceWorkflowsWired).toBeDefined()
    expect(auditOutput.openSourceWorkflowsMissing).toBeDefined()
    
    // Should have some libraries installed
    expect(auditOutput.openSourceLibrariesInstalled.length).toBeGreaterThan(0)
    
    // Should have some workflows wired
    expect(auditOutput.openSourceWorkflowsWired.length).toBeGreaterThan(0)
    
    // Should have some missing workflows (like ffmpeg)
    expect(auditOutput.openSourceWorkflowsMissing.length).toBeGreaterThan(0)
  })

  it('audit detects Brain Router exists', () => {
    expect(auditOutput.workerExecutionStatus).toBeDefined()
    expect(auditOutput.workerExecutionStatus.usesBrainRouter).toBe(true)
  })

  it('audit detects worker integration exists', () => {
    expect(auditOutput.workerExecutionStatus).toBeDefined()
    expect(auditOutput.workerExecutionStatus.found).toBe(true)
    expect(auditOutput.workerExecutionStatus.usesBrainRouter).toBe(true)
  })

  it('audit detects app contract exists', () => {
    expect(auditOutput.appContractStatus).toBeDefined()
    expect(auditOutput.appContractStatus.found).toBe(true)
    expect(auditOutput.appContractStatus.jobsEndpoint).toBe(true)
    expect(auditOutput.appContractStatus.hasApiKeyHashing).toBe(true)
    expect(auditOutput.appContractStatus.hasBlockedOverrides).toBe(true)
  })

  it('audit detects external apps cannot choose provider/model', () => {
    expect(auditOutput.appContractStatus).toBeDefined()
    expect(auditOutput.appContractStatus.hasBlockedOverrides).toBe(true)
  })

  it('audit detects adult generation on hold', () => {
    expect(auditOutput.providerTruth).toBeDefined()
    expect(auditOutput.providerTruth.adultPolicy).toBe('on_hold')
    
    expect(auditOutput.blockedCapabilities).toBeDefined()
    const blockedCapIds = auditOutput.blockedCapabilities.map(c => c.capability)
    expect(blockedCapIds.some(id => id.startsWith('adult_'))).toBe(true)
  })

  it('audit detects no unapproved providers', () => {
    expect(auditOutput.providerTruth).toBeDefined()
    const approved = auditOutput.providerTruth.approvedProviders
    const unapproved = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
    
    for (const provider of unapproved) {
      expect(approved).not.toContain(provider)
    }
  })

  it('audit recommends next PRs', () => {
    expect(auditOutput.recommendedNextPRs).toBeDefined()
    expect(Array.isArray(auditOutput.recommendedNextPRs)).toBe(true)
    expect(auditOutput.recommendedNextPRs.length).toBeGreaterThan(0)
    
    // Should have music generation as a recommended PR
    const musicPR = auditOutput.recommendedNextPRs.find(pr => 
      pr.title.toLowerCase().includes('music')
    )
    expect(musicPR).toBeDefined()
    
    // Should have long-form video as a recommended PR
    const longFormPR = auditOutput.recommendedNextPRs.find(pr => 
      pr.title.toLowerCase().includes('long-form')
    )
    expect(longFormPR).toBeDefined()
  })

  it('audit console output does not print stale "3 executable capabilities"', () => {
    const output = execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, encoding: 'utf-8' })
    expect(output).not.toContain('Total executable: 3')
    expect(output).not.toMatch(/Total executable:\s*3\s*\n/)
  })

  it('audit console output does not print simple "Redeploy ready: YES"', () => {
    const output = execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, encoding: 'utf-8' })
    expect(output).not.toContain('Redeploy ready: YES')
    expect(output).not.toContain('Redeploy Ready: YES')
    expect(output).toContain('Safe to redeploy foundation:')
    expect(output).toContain('Product ready:')
    expect(output).toContain('App ready:')
  })

  it('audit console output shows correct executable capability count', () => {
    const output = execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, encoding: 'utf-8' })
    expect(output).toContain('Total executable: 10')
    expect(output).toContain('Via text router (Groq/DeepInfra): 8')
    expect(output).toContain('Via media worker (Together/GenX): 2')
  })

  it('audit console output shows partial_execution for image and video', () => {
    const output = execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, encoding: 'utf-8' })
    expect(output).toContain('Partial execution: 2')
    expect(output).toMatch(/◐ image/)
    expect(output).toMatch(/◐ video/)
  })

  it('audit console output shows design_ready_pending_backend for music and research', () => {
    const output = execSync(`node ${AUDIT_SCRIPT}`, { cwd: ROOT, encoding: 'utf-8' })
    expect(output).toContain('Design-ready (pending backend): 2')
    expect(output).toMatch(/○ music/)
    expect(output).toMatch(/○ research/)
  })

  it('audit output has all required sections', () => {
    const requiredSections = [
      'generatedAt',
      'repo',
      'providerTruth',
      'modelCatalogueSummary',
      'executableCapabilities',
      'executableViaTextRouter',
      'executableViaMediaWorker',
      'catalogueOnlyCapabilities',
      'pendingCapabilities',
      'blockedCapabilities',
      'dashboardStatus',
      'workerExecutionStatus',
      'appContractStatus',
      'openSourceLibrariesInstalled',
      'openSourceWorkflowsWired',
      'openSourceWorkflowsPartial',
      'openSourceWorkflowsMissing',
      'mediaQualityStatus',
      'musicReadiness',
      'longFormVideoReadiness',
      'marketingAppReadiness',
      'redeployReadiness',
      'riskList',
      'recommendedNextPRs'
    ]
    
    for (const section of requiredSections) {
      expect(auditOutput).toHaveProperty(section)
    }
  })

  it('audit detects MiMo is coding_tools_only', () => {
    expect(auditOutput.providerTruth).toBeDefined()
    expect(auditOutput.providerTruth.mimoPolicy).toBe('coding_tools_only')
  })

  it('audit detects model catalogue summary', () => {
    expect(auditOutput.modelCatalogueSummary).toBeDefined()
    expect(auditOutput.modelCatalogueSummary.total).toBeDefined()
    expect(auditOutput.modelCatalogueSummary.executable).toBeDefined()
    expect(auditOutput.modelCatalogueSummary.planned).toBeDefined()
    expect(auditOutput.modelCatalogueSummary.blocked).toBeDefined()
  })

  it('audit detects dashboard status', () => {
    expect(auditOutput.dashboardStatus).toBeDefined()
    expect(auditOutput.dashboardStatus.total).toBeDefined()
    expect(auditOutput.dashboardStatus.executionReadyPages).toBeDefined()
    expect(auditOutput.dashboardStatus.partialExecutionPages).toBeDefined()
    expect(auditOutput.dashboardStatus.designReadyPages).toBeDefined()
    expect(auditOutput.dashboardStatus.designReadyPendingBackendPages).toBeDefined()
    expect(auditOutput.dashboardStatus.displayOnlyPages).toBeDefined()
    expect(auditOutput.dashboardStatus.pageDetails).toBeDefined()
  })

  it('image page is partial_execution with image_generation ready', () => {
    expect(auditOutput.dashboardStatus.partialExecutionPages).toContain('image')
    const imageDetail = auditOutput.dashboardStatus.pageDetails.find(p => p.route === '/dashboard/image')
    expect(imageDetail).toBeDefined()
    expect(imageDetail.status).toBe('partial_execution')
    expect(imageDetail.executionReadyCapabilities).toContain('image_generation')
    expect(imageDetail.pendingCapabilities).toContain('image_edit')
    expect(imageDetail.pendingCapabilities).toContain('upscale')
    expect(imageDetail.pendingCapabilities).toContain('variations')
  })

  it('video page is partial_execution with video_generation ready', () => {
    expect(auditOutput.dashboardStatus.partialExecutionPages).toContain('video')
    const videoDetail = auditOutput.dashboardStatus.pageDetails.find(p => p.route === '/dashboard/video')
    expect(videoDetail).toBeDefined()
    expect(videoDetail.status).toBe('partial_execution')
    expect(videoDetail.executionReadyCapabilities).toContain('video_generation')
    expect(videoDetail.pendingCapabilities).toContain('long_form_video')
  })

  it('image/video are not downgraded to design-ready just because they contain disabled future controls', () => {
    // Image and video should be in partialExecutionPages, not designReadyPages
    expect(auditOutput.dashboardStatus.designReadyPages).not.toContain('image')
    expect(auditOutput.dashboardStatus.designReadyPages).not.toContain('video')
    expect(auditOutput.dashboardStatus.designReadyPendingBackendPages).not.toContain('image')
    expect(auditOutput.dashboardStatus.designReadyPendingBackendPages).not.toContain('video')
  })

  it('music remains design_ready_pending_backend', () => {
    expect(auditOutput.dashboardStatus.designReadyPendingBackendPages).toContain('music')
    const musicDetail = auditOutput.dashboardStatus.pageDetails.find(p => p.route === '/dashboard/music')
    expect(musicDetail).toBeDefined()
    expect(musicDetail.status).toBe('design_ready_pending_backend')
    expect(musicDetail.executionReadyCapabilities).toEqual([])
    expect(musicDetail.pendingCapabilities).toContain('music_generation')
  })

  it('research remains design_ready_pending_backend', () => {
    expect(auditOutput.dashboardStatus.designReadyPendingBackendPages).toContain('research')
    const researchDetail = auditOutput.dashboardStatus.pageDetails.find(p => p.route === '/dashboard/research')
    expect(researchDetail).toBeDefined()
    expect(researchDetail.status).toBe('design_ready_pending_backend')
    expect(researchDetail.executionReadyCapabilities).toEqual([])
    expect(researchDetail.pendingCapabilities.length).toBeGreaterThan(0)
  })

  it('dashboardStatus includes partialExecutionPages', () => {
    expect(auditOutput.dashboardStatus.partialExecutionPages).toBeDefined()
    expect(Array.isArray(auditOutput.dashboardStatus.partialExecutionPages)).toBe(true)
    expect(auditOutput.dashboardStatus.partialExecutionPages.length).toBeGreaterThan(0)
  })

  it('audit detects redeploy readiness', () => {
    expect(auditOutput.redeployReadiness).toBeDefined()
    expect(auditOutput.redeployReadiness.safe_to_redeploy_foundation).toBeDefined()
    expect(auditOutput.redeployReadiness.product_ready).toBeDefined()
    expect(auditOutput.redeployReadiness.app_ready).toBeDefined()
    expect(auditOutput.redeployReadiness.music_ready).toBeDefined()
    expect(auditOutput.redeployReadiness.long_form_ready).toBeDefined()
    expect(auditOutput.redeployReadiness.blockers).toBeDefined()
    expect(auditOutput.redeployReadiness.warnings).toBeDefined()
  })

  it('audit detects risk list', () => {
    expect(auditOutput.riskList).toBeDefined()
    expect(Array.isArray(auditOutput.riskList)).toBe(true)
  })

  it('audit detects media quality status', () => {
    expect(auditOutput.mediaQualityStatus).toBeDefined()
    expect(auditOutput.mediaQualityStatus.imageGeneration).toBeDefined()
    expect(auditOutput.mediaQualityStatus.videoGeneration).toBeDefined()
  })

  it('audit detects music readiness', () => {
    expect(auditOutput.musicReadiness).toBeDefined()
    expect(auditOutput.musicReadiness.schemaReady).toBe(true)
    expect(auditOutput.musicReadiness.plannerReady).toBe(true)
    expect(auditOutput.musicReadiness.providerClientExists).toBe(false)
    expect(auditOutput.musicReadiness.modelCatalogueEntryExists).toBe(true)
    expect(auditOutput.musicReadiness.workerExecutorExists).toBe(false)
    expect(auditOutput.musicReadiness.artifactPersistenceReady).toBe(true)
    expect(auditOutput.musicReadiness.dashboardReady).toBe(true)
    expect(auditOutput.musicReadiness.adminRoutesReady).toBe(true)
    expect(auditOutput.musicReadiness.instrumentalReady).toBe(true)
    expect(auditOutput.musicReadiness.vocalsReady).toBe(false)
    expect(auditOutput.musicReadiness.lyricsReady).toBe(false)
    expect(auditOutput.musicReadiness.musicGenerationReady).toBe(false)
    expect(auditOutput.musicReadiness.executionBlocked).toBe(true)
    expect(auditOutput.musicReadiness.blockedReason).toContain('GenX music capability is known')
    expect(auditOutput.musicReadiness.genxMusicCapabilityKnown).toBe(true)
    expect(auditOutput.musicReadiness.lyriaClipDiscovered).toBe(true)
    expect(auditOutput.musicReadiness.lyriaProDiscovered).toBe(true)
    expect(auditOutput.musicReadiness.musicExecutorReady).toBe(false)
    expect(auditOutput.musicReadiness.providerCapabilityAudit).toHaveLength(5)
    expect(auditOutput.musicReadiness.providerCapabilityAudit.find(p => p.provider === 'mimo')?.note).toContain('coding_tools_only')
    expect(auditOutput.musicReadiness.providerClient).toBeDefined()
    expect(auditOutput.musicReadiness.modelCatalogueEntries).toBeDefined()
    expect(auditOutput.musicReadiness.workerExecutor).toBeDefined()
    expect(auditOutput.musicReadiness.dashboardPage).toBeDefined()
    expect(auditOutput.musicReadiness.missingParts).toBeDefined()
  })

  it('audit reports provider discovery and MiMo policy readiness', () => {
    expect(auditOutput.providerDiscoveryReadiness).toMatchObject({
      discoveryFrameworkReady: true,
      docsFallbackReady: true,
      liveDiscoverySupported: true,
      fullProviderModelUniverseKnown: false,
    })
    expect(auditOutput.providerDiscoveryReadiness.effectiveCatalogueModelCount).toBeGreaterThanOrEqual(93)
    expect(auditOutput.providerDiscoveryReadiness.publicEndpointModelCount).toBeGreaterThan(0)
    expect(auditOutput.providerDiscoveryReadiness.providersUsingPublicEndpoint).toContain('deepinfra')
    expect(auditOutput.providerDiscoveryReadiness.deepinfraPublicDiscoverySucceeded).toBe(true)
    expect(auditOutput.providerDiscoveryReadiness.togetherProviderUniversePartiallyKnown).toBe(true)
    expect(auditOutput.mimoReadiness).toMatchObject({
      docsCapabilityKnown: true,
      policyRestrictedByApp: true,
      backendRuntimeAllowed: false,
      workerRuntimeAllowed: false,
      executableNow: false,
      policyBlockedReason: 'coding_agent_only_not_backend_runtime',
    })
  })

  it('audit detects long-form video readiness', () => {
    expect(auditOutput.longFormVideoReadiness).toBeDefined()
    expect(auditOutput.longFormVideoReadiness.scriptPlanner).toBeDefined()
    expect(auditOutput.longFormVideoReadiness.sceneSplitter).toBeDefined()
    expect(auditOutput.longFormVideoReadiness.ffmpegIntegration).toBeDefined()
    expect(auditOutput.longFormVideoReadiness.missingParts).toBeDefined()
  })

  it('audit detects marketing app readiness', () => {
    expect(auditOutput.marketingAppReadiness).toBeDefined()
    expect(auditOutput.marketingAppReadiness.appContractRoutes).toBeDefined()
    expect(auditOutput.marketingAppReadiness.appApiKeyAuth).toBeDefined()
    expect(auditOutput.marketingAppReadiness.blockedOverrides).toBeDefined()
    expect(auditOutput.marketingAppReadiness.routingModeSupport).toBeDefined()
    expect(auditOutput.marketingAppReadiness.brandScrapeWorkflow).toBeDefined()
  })
})
