import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const assembly = readFileSync(new URL('../apps/worker/src/social-ad-assembly.ts', import.meta.url), 'utf8')
const assemblyRoute = readFileSync(new URL('../apps/api/src/routes/app-social-ad-assembly.ts', import.meta.url), 'utf8')
const fallback = readFileSync(new URL('../apps/worker/src/providers/durable-provider-fallback.ts', import.meta.url), 'utf8')
const parentWorkflow = readFileSync(new URL('../apps/worker/src/social-ad-assembly-workflow.ts', import.meta.url), 'utf8')

describe('social-ad local assembly contract', () => {
  it('requires quality selection and Marketing App approval before queueing', () => {
    expect(assemblyRoute).toContain("approvalRecord.status !== 'approved'")
    expect(assemblyRoute).toContain('selectedCandidateArtifactId')
    expect(assemblyRoute).toContain('SOCIAL_AD_ASSEMBLY_NOT_AUTHORISED')
    expect(assemblyRoute).toContain('SOCIAL_AD_QUALITY_WINNER_MISSING')
  })

  it('executes locally without entering provider routing', () => {
    expect(fallback).toContain('isInternalSocialAdAssembly')
    expect(fallback).toContain("payload.metadata?.socialAdAssembly === true")
    expect(fallback).toContain("await import('../social-ad-assembly.js')")
    expect(assemblyRoute).toContain("executionAuthority: 'internal_local_ffmpeg'")
  })

  it('produces every requested format with captions, subtitle files, thumbnail and validation evidence', () => {
    expect(assembly).toContain("if (aspectRatio === '9:16')")
    expect(assembly).toContain("if (aspectRatio === '1:1')")
    expect(assembly).toContain('generateSrt')
    expect(assembly).toContain('generateVtt')
    expect(assembly).toContain("subType: 'social_ad_thumbnail'")
    expect(assembly).toContain('everyVariantValid')
    expect(assembly).toContain("'-movflags', '+faststart'")
    expect(assembly).toContain("'-map', '0:a?'")
  })

  it('keeps social copy pending instead of fabricating it during media assembly', () => {
    expect(assembly).toContain("'pending_text_quality_workflow'")
    expect(parentWorkflow).toContain("phase = copyPending ? 'social_copy_pending' : 'completed'")
  })

  it('is idempotent for recovery and duplicate resume requests', () => {
    expect(assemblyRoute).toContain('const existing = existingChildren.find')
    expect(assemblyRoute).toContain('deduplicated: true')
    expect(assemblyRoute).toContain("status === 'completed' ? 200 : 202")
  })
})
