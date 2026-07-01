import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { CAPABILITIES, PROVIDERS, READINESS } from '@/lib/appdata'

// ---------------------------------------------------------------------------
// Infrastructure: Mongo connection (stands in for packages/db Prisma client)
// ---------------------------------------------------------------------------
const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'amarktai'
const ARTIFACT_DIR = path.join(process.cwd(), 'workspace', 'artifacts')

let cached = global._amarktai
if (!cached) cached = global._amarktai = { client: null, db: null }

async function getDb() {
  if (cached.db) return cached.db
  if (!cached.client) {
    cached.client = new MongoClient(MONGO_URL)
    await cached.client.connect()
  }
  cached.db = cached.client.db(DB_NAME)
  return cached.db
}

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  })
}

async function logEvent(db, level, message, meta = {}) {
  const evt = { id: uuidv4(), level, message, meta, ts: new Date().toISOString() }
  await db.collection('events').insertOne(evt)
  return evt
}

// ---------------------------------------------------------------------------
// Artifact fabrication (fake asset generation on local disk = apps/worker)
// ---------------------------------------------------------------------------
const TYPE_CFG = {
  'text.chat': { ext: 'md', mime: 'text/markdown', kind: 'markdown' },
  'image.generate': { ext: 'svg', mime: 'image/svg+xml', kind: 'image' },
  'image.edit': { ext: 'svg', mime: 'image/svg+xml', kind: 'image' },
  'video.generate': { ext: 'svg', mime: 'image/svg+xml', kind: 'video' },
  'video.longform': { ext: 'svg', mime: 'image/svg+xml', kind: 'video' },
  'music.generate': { ext: 'wav', mime: 'audio/wav', kind: 'audio' },
  'voice.tts': { ext: 'wav', mime: 'audio/wav', kind: 'audio' },
  'voice.stt': { ext: 'md', mime: 'text/markdown', kind: 'markdown' },
  'avatar.generate': { ext: 'svg', mime: 'image/svg+xml', kind: 'image' },
  'scrape.crawl': { ext: 'md', mime: 'text/markdown', kind: 'markdown' },
  'rag.ingest': { ext: 'md', mime: 'text/markdown', kind: 'markdown' },
  'rag.query': { ext: 'md', mime: 'text/markdown', kind: 'markdown' },
}

function silentWav(seconds = 2, sampleRate = 8000) {
  const numSamples = seconds * sampleRate
  const dataSize = numSamples * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  return buf
}

function svgArt(title, subtitle) {
  const c1 = '#22d3ee', c2 = '#a78bfa', c3 = '#f0abfc'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="50%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="r" cx="30%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#0b0b12"/><stop offset="100%" stop-color="#050508"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="576" fill="url(#r)"/>
  <circle cx="760" cy="140" r="220" fill="url(#g)" opacity="0.20"/>
  <circle cx="220" cy="440" r="180" fill="url(#g)" opacity="0.14"/>
  <text x="64" y="300" font-family="Inter, sans-serif" font-size="52" font-weight="800" fill="url(#g)">${title}</text>
  <text x="64" y="350" font-family="Inter, sans-serif" font-size="24" fill="#8b93a7">${subtitle}</text>
  <text x="64" y="520" font-family="monospace" font-size="16" fill="#4b5162">AmarktAI Network \u2014 mock artifact</text>
</svg>`
}

function markdownDoc(type, payload) {
  const p = JSON.stringify(payload || {}, null, 2)
  return `# AmarktAI Mock Artifact\n\n**Capability:** \`${type}\`  \n**Generated:** ${new Date().toISOString()}  \n**Mode:** Mock (no premium endpoints invoked)\n\n---\n\n## Summary\n\nThis is a fabricated result produced by the local simulation worker. It demonstrates the\nend-to-end orchestration pipeline: enqueue \u2192 process \u2192 persist artifact \u2192 surface in dashboard.\n\n## Request payload\n\n\`\`\`json\n${p}\n\`\`\`\n\n## Notes\n\n- Deterministic mock output for pipeline verification.\n- Replace mock provider with a live credential to produce real assets.\n`
}

async function fabricateArtifact(db, job) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  const cfg = TYPE_CFG[job.type] || TYPE_CFG['text.chat']
  const id = uuidv4()
  const filename = `${id}.${cfg.ext}`
  const diskPath = path.join(ARTIFACT_DIR, filename)

  let content
  if (cfg.ext === 'wav') content = silentWav(2)
  else if (cfg.ext === 'svg') content = Buffer.from(svgArt((job.type.split('.')[0] || 'asset').toUpperCase(), (job.payload?.prompt || job.payload?.url || 'Mock generated asset').slice(0, 48)))
  else content = Buffer.from(markdownDoc(job.type, job.payload))

  await fs.writeFile(diskPath, content)

  const artifact = {
    id,
    jobId: job.id,
    capability: job.type,
    kind: cfg.kind,
    format: cfg.ext,
    mime: cfg.mime,
    filename,
    internalPath: diskPath,
    retrievalPath: `/api/artifacts/${id}/download`,
    sizeBytes: content.length,
    createdAt: new Date().toISOString(),
  }
  await db.collection('artifacts').insertOne(artifact)
  return artifact
}

// ---------------------------------------------------------------------------
// Background worker simulation (apps/worker) \u2014 progresses a job over time
// ---------------------------------------------------------------------------
async function runMockWorker(jobId) {
  const stages = [
    { delay: 500, status: 'running', progress: 18, msg: 'Worker picked up task' },
    { delay: 1400, status: 'running', progress: 52, msg: 'Provider (mock) streaming response' },
    { delay: 1300, status: 'running', progress: 84, msg: 'Post-processing & encoding asset' },
  ]
  try {
    let acc = 0
    for (const s of stages) {
      acc += s.delay
      setTimeout(async () => {
        try {
          const db = await getDb()
          await db.collection('jobs').updateOne({ id: jobId }, { $set: { status: s.status, progress: s.progress, updatedAt: new Date().toISOString() } })
          await logEvent(db, 'info', s.msg, { jobId })
        } catch (e) {}
      }, acc)
    }
    // finalize
    setTimeout(async () => {
      try {
        const db = await getDb()
        const job = await db.collection('jobs').findOne({ id: jobId })
        if (!job) return
        const artifact = await fabricateArtifact(db, job)
        await db.collection('jobs').updateOne(
          { id: jobId },
          { $set: { status: 'completed', progress: 100, artifactId: artifact.id, updatedAt: new Date().toISOString() } }
        )
        await logEvent(db, 'success', `Job completed \u2014 artifact ${artifact.format.toUpperCase()} ready`, { jobId, artifactId: artifact.id })
      } catch (e) {
        try {
          const db = await getDb()
          await db.collection('jobs').updateOne({ id: jobId }, { $set: { status: 'failed', error: String(e), updatedAt: new Date().toISOString() } })
          await logEvent(db, 'error', 'Job failed during finalization', { jobId })
        } catch (_) {}
      }
    }, acc + 1200)
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function seg(params) {
  const p = params?.path || []
  return Array.isArray(p) ? p : [p]
}

export async function GET(request, { params }) {
  try {
    const db = await getDb()
    const p = seg(await params)
    const route = p.join('/')

    if (p.length === 0 || route === 'health') {
      return json({ status: 'ok', service: 'amarktai-network-v2', mode: 'mock', ts: new Date().toISOString() })
    }

    if (route === 'capabilities') return json({ capabilities: CAPABILITIES })
    if (route === 'providers') return json({ providers: PROVIDERS })

    if (route === 'stats') {
      const jobs = await db.collection('jobs').find({}).toArray()
      const by = (s) => jobs.filter((j) => j.status === s).length
      const artifacts = await db.collection('artifacts').countDocuments()
      const connections = await db.collection('connections').countDocuments()
      return json({
        jobs: { total: jobs.length, queued: by('queued'), running: by('running'), completed: by('completed'), failed: by('failed') },
        artifacts,
        connections,
        providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, status: p.status, tier: p.tier })),
        readiness: READINESS,
      })
    }

    if (route === 'events') {
      const events = await db.collection('events').find({}).sort({ ts: -1 }).limit(60).toArray()
      return json({ events: events.map(({ _id, ...e }) => e) })
    }

    if (route === 'jobs') {
      const jobs = await db.collection('jobs').find({}).sort({ createdAt: -1 }).limit(100).toArray()
      return json({ jobs: jobs.map(({ _id, ...j }) => j) })
    }
    if (p[0] === 'jobs' && p[1]) {
      const job = await db.collection('jobs').findOne({ id: p[1] })
      if (!job) return json({ error: 'not found' }, 404)
      const { _id, ...rest } = job
      return json({ job: rest })
    }

    if (route === 'artifacts') {
      const arts = await db.collection('artifacts').find({}).sort({ createdAt: -1 }).limit(100).toArray()
      return json({ artifacts: arts.map(({ _id, ...a }) => a) })
    }
    if (p[0] === 'artifacts' && p[1] && p[2] === 'download') {
      const art = await db.collection('artifacts').findOne({ id: p[1] })
      if (!art) return json({ error: 'not found' }, 404)
      const buf = await fs.readFile(art.internalPath)
      return new NextResponse(buf, {
        status: 200,
        headers: { 'Content-Type': art.mime, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
      })
    }

    if (route === 'connections') {
      const conns = await db.collection('connections').find({}).sort({ createdAt: -1 }).toArray()
      return json({ connections: conns.map(({ _id, ...c }) => c) })
    }

    if (route === 'settings') {
      const rows = await db.collection('settings').find({}).toArray()
      const map = {}
      rows.forEach((r) => { map[r.key] = r.value })
      return json({ settings: map })
    }

    return json({ error: 'unknown route', route }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function POST(request, { params }) {
  try {
    const db = await getDb()
    const p = seg(await params)
    const route = p.join('/')
    let body = {}
    try { body = await request.json() } catch (_) {}

    if (route === 'jobs') {
      const type = body.type || 'text.chat'
      const job = {
        id: uuidv4(),
        type,
        label: body.label || type,
        status: 'queued',
        progress: 0,
        payload: body.payload || {},
        appId: body.appId || 'studio',
        artifactId: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await db.collection('jobs').insertOne(job)
      await logEvent(db, 'info', `Job enqueued \u2014 ${type}`, { jobId: job.id })
      runMockWorker(job.id)
      const { _id, ...rest } = job
      return json({ job: rest }, 201)
    }

    if (route === 'connections') {
      const conn = {
        id: uuidv4(),
        name: body.name || 'Untitled App',
        environment: body.environment || 'development',
        scopes: body.scopes || ['text.chat', 'image.generate'],
        dailyBudget: Number(body.dailyBudget || 100),
        spendToday: 0,
        createdAt: new Date().toISOString(),
        keys: [],
      }
      await db.collection('connections').insertOne(conn)
      await logEvent(db, 'info', `App connection created \u2014 ${conn.name}`, { connectionId: conn.id })
      const { _id, ...rest } = conn
      return json({ connection: rest }, 201)
    }

    if (p[0] === 'connections' && p[1] && p[2] === 'keys') {
      const raw = 'amk_' + crypto.randomBytes(24).toString('hex')
      const key = { id: uuidv4(), prefix: raw.slice(0, 12), token: raw, createdAt: new Date().toISOString(), lastUsed: null }
      await db.collection('connections').updateOne({ id: p[1] }, { $push: { keys: key } })
      await logEvent(db, 'success', 'API key generated', { connectionId: p[1] })
      return json({ key }, 201)
    }

    if (route === 'simulate') {
      // Deep execution payload simulator \u2014 echoes a synthetic system response.
      const started = Date.now()
      const resp = {
        ok: true,
        received: body,
        routed_to: (body?.type || 'text.chat'),
        provider: 'mock',
        latency_ms: 40 + Math.floor(Math.random() * 120),
        trace_id: uuidv4(),
        would_enqueue_job: true,
        ts: new Date().toISOString(),
      }
      await logEvent(db, 'info', 'Payload simulated against system endpoint', { type: resp.routed_to })
      resp.elapsed_ms = Date.now() - started
      return json(resp)
    }

    if (route === 'seed') {
      const defaults = [
        { key: 'default_text_model', value: 'llama-3.3-70b-versatile' },
        { key: 'default_image_model', value: 'genx-image-xl' },
        { key: 'asset_retention_days', value: 30 },
        { key: 'local_storage_path', value: '/workspace/artifacts' },
        { key: 'system_proof', value: 'enabled' },
      ]
      for (const d of defaults) {
        await db.collection('settings').updateOne({ key: d.key }, { $setOnInsert: d }, { upsert: true })
      }
      return json({ seeded: true })
    }

    return json({ error: 'unknown route', route }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function PUT(request, { params }) {
  try {
    const db = await getDb()
    const p = seg(await params)
    const route = p.join('/')
    let body = {}
    try { body = await request.json() } catch (_) {}

    if (route === 'settings') {
      const entries = Object.entries(body.settings || body || {})
      for (const [key, value] of entries) {
        await db.collection('settings').updateOne({ key }, { $set: { key, value } }, { upsert: true })
      }
      await logEvent(db, 'info', 'Settings updated', {})
      return json({ ok: true, updated: entries.length })
    }
    return json({ error: 'unknown route', route }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    const db = await getDb()
    const p = seg(await params)
    if (p[0] === 'connections' && p[1]) {
      await db.collection('connections').deleteOne({ id: p[1] })
      return json({ ok: true })
    }
    if (p[0] === 'jobs' && p[1]) {
      await db.collection('jobs').deleteOne({ id: p[1] })
      return json({ ok: true })
    }
    return json({ error: 'unknown route' }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
