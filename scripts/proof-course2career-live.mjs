#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { runManualLongFormLive } from './lib/manual-long-form-live.mjs'

await runManualLongFormLive({
  proofName: 'course2career-30-second-live',
  fixturePath: fileURLToPath(new URL('./fixtures/course2career-advert.json', import.meta.url)),
})
