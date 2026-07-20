import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { it } from 'vitest'

it('registers every configured dashboard navigation icon before rendering the authenticated shell', async () => {
  const [contract, layout] = await Promise.all([
    readFile(new URL('../lib/dashboard-contract.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/layout.js', import.meta.url), 'utf8'),
  ])
  const configuredIcons = [...contract.matchAll(/icon:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
  assert.ok(configuredIcons.includes('Film'))
  for (const icon of new Set(configuredIcons)) {
    assert.match(layout, new RegExp(`\\b${icon}\\b`), `dashboard icon ${icon} must be imported and registered`)
    assert.match(layout, new RegExp(`const ICONS = \\{[^}]*\\b${icon}\\b`, 's'), `dashboard icon ${icon} must exist in ICONS`)
  }
})
