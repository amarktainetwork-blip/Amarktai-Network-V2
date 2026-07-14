import { randomUUID } from 'node:crypto'
import { APPROVED_PROVIDER_DEFINITIONS } from '@amarktai/core'
import { prisma } from '@amarktai/db'

const FIXTURE_SWITCH = 'release-candidate-v1'

export function isReleaseFixtureMode(): boolean {
  return process.env.NODE_ENV === 'test'
    && process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === FIXTURE_SWITCH
}

export function assertReleaseFixtureModeConfiguration(): void {
  const configured = process.env.AMARKTAI_TEST_FIXTURE_ADAPTER?.trim()
  if (configured && !isReleaseFixtureMode()) {
    throw new Error('AMARKTAI_TEST_FIXTURE_ADAPTER is test-only and requires NODE_ENV=test with value release-candidate-v1')
  }
}

export async function bootstrapReleaseFixtureProviders(): Promise<void> {
  if (!isReleaseFixtureMode()) return
  for (const [index, provider] of APPROVED_PROVIDER_DEFINITIONS.entries()) {
    const existing = await prisma.aiProvider.findUnique({ where: { providerKey: provider.key } })
    if (existing) continue
    await prisma.aiProvider.create({
      data: {
        providerKey: provider.key,
        displayName: provider.displayName,
        enabled: provider.backendExecutionAllowed,
        apiKey: provider.backendExecutionAllowed ? `test-only-${randomUUID()}` : '',
        maskedPreview: provider.backendExecutionAllowed ? 'test-only-••••' : '',
        baseUrl: provider.defaultBaseUrl,
        credentialUsagePolicy: provider.codingOnly ? 'coding_tools_only' : 'backend_runtime_allowed',
        healthStatus: provider.codingOnly ? 'runtime_restricted' : 'configured',
        healthMessage: provider.codingOnly
          ? 'Coding-agent-only policy; never a backend runtime provider.'
          : 'Deterministic local fixture adapter configured; this is not live provider proof.',
        notes: 'Created only inside the disposable release-candidate fixture database.',
        sortOrder: index,
      },
    })
  }
}
