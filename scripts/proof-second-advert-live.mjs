#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { runManualLongFormLive } from './lib/manual-long-form-live.mjs'

await runManualLongFormLive({
  proofName: 'harbourlight-home-energy-live',
  fixturePath: fileURLToPath(new URL('./fixtures/harbourlight-advert.json', import.meta.url)),
})
