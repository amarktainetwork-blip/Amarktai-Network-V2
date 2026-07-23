#!/usr/bin/env tsx
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getRuntimeModelPolicyBlocker } from '../packages/core/src/model-family-policy.ts'

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

const MODEL_LIST_URL = 'https://api.deepinfra.com/models/list'
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

function strictMode(): boolean {
  return process.argv.includes('--strict')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function fetchModelPayload(): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('DeepInfra model-list timeout')), 30_000)
    try {
      const response = await fetch(MODEL_LIST_URL, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AmarktAI-Network-V2-model-discovery',
        },
        signal: controller.signal,
      })
      if (response.ok) return await response.json()
      const body = (await response.text()).slice(0, 500)
      const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500
      const error = new Error(`DeepInfra model list failed: ${response.status}${body ? ` ${body}` : ''}`)
      if (!retryable || attempt === 4) throw error
      lastError = error
    } catch (error) {
      lastError = error
      if (attempt === 4) break
    } finally {
      clearTimeout(timeout)
    }
    await delay(500 * attempt)
  }
  throw lastError instanceof Error ? lastError : new Error('DeepInfra model list failed after retries')
}

function extractRows(payload: unknown): DeepInfraModelRow[] {
  if (Array.isArray(payload)) return payload as DeepInfraModelRow[]
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('DeepInfra model list returned neither an array nor an object')
  }
  const record = payload as Record<string, unknown>
  for (const key of ['data', 'models', 'results']) {
    if (Array.isArray(record[key])) return record[key] as DeepInfraModelRow[]
  }
  throw new Error(`DeepInfra model list object did not contain an array; keys=${Object.keys(record).join(',')}`)
}

async function main(): Promise<void> {
  const destination = outputPath()
  try {
    const payload = await fetchModelPayload()
    const rows = extractRows(payload)
    const relevant = rows
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
      captureSucceeded: true,
      source: MODEL_LIST_URL,
      policySource: 'packages/core/src/model-family-policy.ts',
      sourceRowCount: rows.length,
      relevantRowCount: relevant.length,
      count: models.length,
      excludedCount: excluded.length,
      excludedReasons: [...new Set(excluded.map((row) => row.blocker))],
      excludedModels: excluded,
      models,
      error: null,
    }

    await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ output: destination, captureSucceeded: true, sourceRows: rows.length, relevantDeepInfraModels: models.length, policyExcluded: excluded.length, types: [...new Set(models.map((row) => row.reportedType || row.type))] }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const result = {
      capturedAt: new Date().toISOString(),
      captureSucceeded: false,
      source: MODEL_LIST_URL,
      policySource: 'packages/core/src/model-family-policy.ts',
      sourceRowCount: 0,
      relevantRowCount: 0,
      count: 0,
      excludedCount: 0,
      excludedReasons: [],
      excludedModels: [],
      models: [],
      error: message,
    }
    await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.warn(JSON.stringify({ output: destination, captureSucceeded: false, failClosed: true, error: message }))
    if (strictMode()) throw error
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
