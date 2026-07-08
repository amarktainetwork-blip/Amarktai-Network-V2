import { prisma } from '@amarktai/db'

interface UsageEventInput {
  job: {
    id: string
    appSlug: string | null
    capability: string
    provider: string | null
    model: string | null
  }
  artifactSizeBytes?: number | null
}

export async function recordUsageEvent({ job, artifactSizeBytes }: UsageEventInput): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await prisma.usageMeter.upsert({
    where: {
      usage_meter_unique: {
        appSlug: job.appSlug || 'unknown',
        date: today,
        capability: job.capability,
        provider: job.provider || 'unknown',
        model: job.model || '',
      },
    },
    create: {
      appSlug: job.appSlug || 'unknown',
      date: today,
      capability: job.capability,
      provider: job.provider || 'unknown',
      model: job.model || '',
      requestCount: 1,
      successCount: 1,
      artifactCount: artifactSizeBytes ? 1 : 0,
    },
    update: {
      requestCount: { increment: 1 },
      successCount: { increment: 1 },
      artifactCount: artifactSizeBytes ? { increment: 1 } : undefined,
    },
  })
}
