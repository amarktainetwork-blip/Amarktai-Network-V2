import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { it } from 'vitest'
import { getInternalDashboardApps } from '../packages/core/src/dashboard-apps.js'

it('premium advert music uses the canonical song_generation grant owned by dashboard-long-form', async () => {
  const app = getInternalDashboardApps().find((entry) => entry.appSlug === 'dashboard-long-form')
  assert.ok(app)
  assert.ok(app.capabilities.includes('long_form_video'))
  assert.ok(app.capabilities.includes('video_generation'))
  assert.ok(app.capabilities.includes('tts'))
  assert.ok(app.capabilities.includes('music_generation'))
  assert.ok(app.capabilities.includes('song_generation'))

  const route = await readFile(new URL('../apps/api/src/routes/admin-premium-advert.ts', import.meta.url), 'utf8')
  assert.match(route, /requireGrant\('song_generation'\)/)
  assert.match(route, /capability:\s*'song_generation'/)
  assert.match(route, /exactRouteMetadata\(built\.plan\.music\.route, built\.grants\.music/)
})
