import { prisma } from './client.js'

export type ModelAccessibilityBlocker = 'model_not_available' | 'dedicated_endpoint_required'

/** Persist credential-scoped execution evidence without changing provider health. */
export async function recordModelAccessibilityFailure(input: {
  provider: string
  modelId: string
  blocker: ModelAccessibilityBlocker
}): Promise<boolean> {
  const existing = await prisma.modelRegistryEntry.findUnique({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    select: { rawMetadata: true },
  })
  if (!existing) return false
  let raw: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(existing.rawMetadata || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed
  } catch { /* retain a valid metadata object */ }
  const now = new Date().toISOString()
  await prisma.modelRegistryEntry.update({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    data: {
      accountAccess: 'inaccessible',
      currentAvailability: input.blocker,
      rawMetadata: JSON.stringify({
        ...raw,
        accessibility: {
          ...(raw.accessibility && typeof raw.accessibility === 'object' ? raw.accessibility : {}),
          accountAccessible: false,
          executable: false,
          blocker: input.blocker,
          lastFailureAt: now,
          evidenceSource: 'provider_execution_feedback',
        },
      }),
    },
  })
  return true
}

export async function recordModelAccessibilitySuccess(input: { provider: string; modelId: string }): Promise<boolean> {
  const existing = await prisma.modelRegistryEntry.findUnique({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    select: { rawMetadata: true },
  })
  if (!existing) return false
  let raw: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(existing.rawMetadata || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed
  } catch { /* retain a valid metadata object */ }
  await prisma.modelRegistryEntry.update({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    data: {
      accountAccess: 'accessible',
      currentAvailability: 'available',
      rawMetadata: JSON.stringify({
        ...raw,
        accessibility: {
          ...(raw.accessibility && typeof raw.accessibility === 'object' ? raw.accessibility : {}),
          accountAccessible: true,
          executable: true,
          blocker: null,
          lastSuccessAt: new Date().toISOString(),
          evidenceSource: 'provider_execution_success',
        },
      }),
    },
  })
  return true
}
