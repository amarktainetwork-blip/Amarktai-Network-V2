import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const STORAGE_TARGET = '/var/www/amarktai/storage'
const SHARED_VOLUME = 'artifact_storage'

function readCompose() {
  return fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
}

function serviceBlock(compose, serviceName) {
  const match = compose.match(new RegExp(`\\r?\\n  ${serviceName}:\\r?\\n([\\s\\S]*?)(?=\\r?\\n  [a-zA-Z0-9_-]+:\\r?\\n|\\r?\\n#|\\r?\\nvolumes:)`))
  if (!match) throw new Error(`Missing ${serviceName} service`)
  return match[1]
}

function topLevelVolumesBlock(compose) {
  const match = compose.match(/\r?\nvolumes:\r?\n([\s\S]*?)(?=\r?\n#|\r?\nnetworks:|$)/)
  if (!match) throw new Error('Missing top-level volumes block')
  return match[1]
}

function storageMounts(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') && line.endsWith(`:${STORAGE_TARGET}`))
    .map((line) => line.slice(2))
}

describe('Docker artifact storage contract', () => {
  it('api and worker share the same artifact storage volume path', () => {
    const compose = readCompose()
    const apiMounts = storageMounts(serviceBlock(compose, 'api'))
    const workerMounts = storageMounts(serviceBlock(compose, 'worker'))

    expect(apiMounts).toEqual([`${SHARED_VOLUME}:${STORAGE_TARGET}`])
    expect(workerMounts).toEqual([`${SHARED_VOLUME}:${STORAGE_TARGET}`])
  })

  it('does not mount split api_storage or worker_storage at the artifact path', () => {
    const compose = readCompose()
    const apiBlock = serviceBlock(compose, 'api')
    const workerBlock = serviceBlock(compose, 'worker')

    expect(apiBlock).not.toContain(`api_storage:${STORAGE_TARGET}`)
    expect(apiBlock).not.toContain(`worker_storage:${STORAGE_TARGET}`)
    expect(workerBlock).not.toContain(`api_storage:${STORAGE_TARGET}`)
    expect(workerBlock).not.toContain(`worker_storage:${STORAGE_TARGET}`)
  })

  it('declares the shared named artifact storage volume', () => {
    const volumes = topLevelVolumesBlock(readCompose())

    expect(volumes).toContain(`${SHARED_VOLUME}:`)
    expect(volumes).not.toContain('api_storage:')
    expect(volumes).not.toContain('worker_storage:')
  })
})
