#!/usr/bin/env tsx
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getRuntimeModelPolicyBlocker } from '../packages/core/src/model-family-policy.js'

interface DeepInfraModelRow {
  model_name?: unknown
  type?: unknown
  reported_type?: unknown
  deprecated?: unknown
  replaced_by?: unknown
  private?: unknown
  tags?: unknown
  pricing?: unknown
}

const relevantTypes = new Set([
  'image-to-image',
  'image-classification',
  'zero-shot-image-classification',
  'object-detection',
  'zero-shot-object-detection',
  'image-segmentation',
  'depth-estimation',
  'keypoint-detection',
  'video-classification',
  'audio-classification',
  'voice-activity-detection',
  'text-to-speech',
])

function outputPath(): string {
  const argument = process.argv.find((value) => value.startsWith('--output='))
  return resolve(argument?.slice('--output='.length) || 'deepinfra-standard-models.json')
}

const response = await fetch('https://api.deepinfra.com/models/list', {
  headers: { Accept: 'application/json' },
})
if (!response.ok) throw new Error(`DeepInfra model list failed: ${response.status}`)

const payload = await response.json()
if (!Array.isArray(payload)) throw new Error('DeepInfra model list did not return an array')

const relevant = (payload as DeepInfraModelRow[])
  .filter((row) => relevantTypes.has(String(row.reported_type || row.type || '').toLowerCase().replaceAll('_', '-')))
  .map((row) => ({
    modelId: String(row.model_name || '').trim(),
    type: row.type ?? null,
    reportedType: row.reported_type ?? null,
    deprecated: row.deprecated ?? null,
    replacedBy: row.replaced_by ?? null,
    private: Number(row.private || 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    pricing: row.pricing ?? null,
  }))
  .filter((row) => row.modelId && row.private === 0 && !row.deprecated)

const excluded = relevant
  .map((row) => ({ modelId: row.modelId, blocker: getRuntimeModelPolicyBlocker(row.modelId) }))
  .filter((row): row is { modelId: string; blocker: NonNullable<ReturnType<typeof getRuntimeModelPolicyBlocker>> } => row.blocker !== null)
const excludedIds = new Set(excluded.map((row) => row.modelId))
const models = relevant
  .filter((row) => !excludedIds.has(row.modelId))
  .sort((a, b) => `${a.reportedType}:${a.modelId}`.localeCompare(`${b.reportedType}:${b.modelId}`))

const result = {
  capturedAt: new Date().toISOString(),
  source: 'https://api.deepinfra.com/models/list',
  policySource: 'packages/core/src/model-family-policy.ts',
  count: models.length,
  excludedCount: excluded.length,
  excludedReasons: [...new Set(excluded.map((row) => row.blocker))],
  excludedModels: excluded,
  models,
}

await writeFile(outputPath(), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  output: outputPath(),
  relevantDeepInfraModels: models.length,
  policyExcluded: excluded.length,
  types: [...new Set(models.map((row) => row.reportedType || row.type))],
}))
