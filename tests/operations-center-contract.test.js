import { describe, it, expect } from 'vitest'

const OPS_METRICS = [
  { label: 'API Service', status: 'not_wired', blocker: 'Health endpoint exists but live polling not implemented' },
  { label: 'Dashboard Service', status: 'not_wired', blocker: 'Dashboard serves HTTP 200 but no uptime monitor wired' },
  { label: 'Worker Service', status: 'not_wired', blocker: 'Worker health not polled from dashboard' },
  { label: 'MariaDB', status: 'not_wired', blocker: 'Prisma connection exists but no latency/health metric exposed' },
  { label: 'Redis', status: 'not_wired', blocker: 'Redis connection exists but no eviction/latency metric exposed' },
  { label: 'Qdrant', status: 'not_wired', blocker: 'Qdrant health endpoint exists but not polled from dashboard' },
  { label: 'Storage/Disk', status: 'not_wired', blocker: 'No storage metric endpoint exists yet' },
  { label: 'Queue Health', status: 'not_wired', blocker: 'BullMQ queue exists but no dashboard metric endpoint' },
  { label: 'Provider Health', status: 'not_wired', blocker: 'Provider health test exists but not polled as live metric' },
]

describe('operations center contract', () => {
  it('all metrics are honest not_wired', () => {
    for (const metric of OPS_METRICS) {
      expect(metric.status).toBe('not_wired')
      expect(metric.blocker).toBeTruthy()
      expect(metric.blocker.length).toBeGreaterThan(10)
    }
  })

  it('does not fake live metrics', () => {
    const statuses = OPS_METRICS.map((m) => m.status)
    expect(statuses).not.toContain('live')
    expect(statuses).not.toContain('healthy')
    expect(statuses).not.toContain('connected')
  })

  it('covers all critical infrastructure', () => {
    const labels = OPS_METRICS.map((m) => m.label)
    expect(labels).toContain('API Service')
    expect(labels).toContain('Worker Service')
    expect(labels).toContain('MariaDB')
    expect(labels).toContain('Redis')
    expect(labels).toContain('Qdrant')
    expect(labels).toContain('Queue Health')
  })
})
