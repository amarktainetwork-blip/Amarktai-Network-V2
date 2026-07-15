#!/usr/bin/env node

import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { QUEUE_NAMES } from '@amarktai/core'

const [action, jobId] = process.argv.slice(2)
const fixtureEnabled = process.env.NODE_ENV === 'test'
  && process.env.RELEASE_FIXTURE_MODE === 'true'
  && process.env.RELEASE_FIXTURE_SAFETY_TOKEN === 'amarktai-release-fixture-local-ci-v1'
  && process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === 'release-candidate-v1'
  && new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid').hostname === 'mariadb'
  && new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid').pathname === '/amarktai_fixture'

if (!fixtureEnabled) throw new Error('Release fixture queue control requires the exact test-only adapter, mode, safety token, and disposable MariaDB target')
if (!action) throw new Error('Usage: release-fixture-queue-control.mjs <pause|resume|prepare-stale|redeliver|prepare-cancelled|inspect> [jobId]')

const queue = new Queue(QUEUE_NAMES.JOBS, {
  connection: { url: process.env.REDIS_URL ?? 'redis://redis:6379', maxRetriesPerRequest: null },
})

async function requireJob() {
  if (!jobId) throw new Error(`${action} requires a job ID`)
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) throw new Error(`Fixture job not found: ${jobId}`)
  return job
}

async function removeQueueDelivery(id) {
  const delivery = await queue.getJob(id)
  if (delivery) await delivery.remove()
}

try {
  await queue.waitUntilReady()
  if (action === 'pause') {
    await queue.pause()
    console.log(JSON.stringify({ action, queue: QUEUE_NAMES.JOBS, paused: true }))
  } else if (action === 'resume') {
    await queue.resume()
    console.log(JSON.stringify({ action, queue: QUEUE_NAMES.JOBS, paused: false }))
  } else if (action === 'prepare-stale') {
    const job = await requireJob()
    await removeQueueDelivery(job.id)
    const startedAt = new Date(Date.now() - 20 * 60 * 1000)
    const changed = await prisma.job.updateMany({
      where: { id: job.id, status: 'queued' },
      data: {
        status: 'processing',
        startedAt,
        completedAt: null,
        providerClaimAt: null,
        error: 'Fixture-injected stale worker claim',
      },
    })
    if (changed.count !== 1) throw new Error(`Expected one queued job, changed ${changed.count}`)
    console.log(JSON.stringify({ action, jobId: job.id, status: 'processing', startedAt: startedAt.toISOString() }))
  } else if (action === 'redeliver') {
    const job = await requireJob()
    await removeQueueDelivery(job.id)
    await queue.add('process-duplicate', { jobId: job.id }, { jobId: job.id })
    console.log(JSON.stringify({ action, jobId: job.id, durableStatus: job.status }))
  } else if (action === 'prepare-cancelled') {
    const job = await requireJob()
    await removeQueueDelivery(job.id)
    const changed = await prisma.job.updateMany({
      where: { id: job.id, status: { notIn: ['completed', 'cancelled', 'cancelling'] } },
      data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by deterministic fixture recovery proof' },
    })
    if (changed.count !== 1) throw new Error(`Expected one non-terminal job, changed ${changed.count}`)
    await queue.add('process-cancelled-redelivery', { jobId: job.id }, { jobId: job.id })
    console.log(JSON.stringify({ action, jobId: job.id, status: 'cancelled' }))
  } else if (action === 'inspect') {
    const job = await requireJob()
    const artifactCount = job.traceId ? await prisma.artifact.count({ where: { traceId: job.traceId } }) : 0
    const delivery = await queue.getJob(job.id)
    const deliveryState = delivery ? await delivery.getState() : 'missing'
    console.log(JSON.stringify({
      action,
      jobId: job.id,
      status: job.status,
      artifactId: job.artifactId,
      traceId: job.traceId,
      artifactCount,
      retryCount: job.retryCount,
      deliveryState,
    }))
  } else {
    throw new Error(`Unknown release fixture queue action: ${action}`)
  }
} finally {
  await queue.close().catch(() => {})
  await prisma.$disconnect().catch(() => {})
}
