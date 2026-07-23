import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))

function semverTuple(version) {
  return String(version).replace(/^[^0-9]*/, '').split('.').slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
}

function atLeast(actual, minimum) {
  const left = semverTuple(actual)
  const right = semverTuple(minimum)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true
    if (left[index] < right[index]) return false
  }
  return true
}

describe('Next.js security backport', () => {
  it('keeps the root manifest on the patched 15.5.21-or-newer backport', () => {
    expect(atLeast(packageJson.dependencies.next, '15.5.21')).toBe(true)
    expect(atLeast(packageJson.devDependencies['eslint-config-next'], '15.5.21')).toBe(true)
  })

  it('keeps the generated lockfile aligned with the patched manifest', () => {
    expect(packageLock.packages[''].dependencies.next).toBe(packageJson.dependencies.next)
    expect(packageLock.packages[''].devDependencies['eslint-config-next']).toBe(packageJson.devDependencies['eslint-config-next'])
    expect(atLeast(packageLock.packages['node_modules/next'].version, '15.5.21')).toBe(true)
    expect(atLeast(packageLock.packages['node_modules/eslint-config-next'].version, '15.5.21')).toBe(true)
    expect(packageLock.packages['node_modules/eslint-config-next'].dependencies['@next/eslint-plugin-next']).toBe(packageLock.packages['node_modules/eslint-config-next'].version)
  })
})
