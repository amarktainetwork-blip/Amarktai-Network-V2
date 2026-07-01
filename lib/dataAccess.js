import { MongoClient } from 'mongodb'
import { CAPABILITIES, PROVIDERS, READINESS } from '@/lib/appdata'

// Server-only direct data access (used by Server Components for SSR initial data).
const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'amarktai'

let cached = global._amarktai_da
if (!cached) cached = global._amarktai_da = { client: null, db: null }

async function getDb() {
  if (cached.db) return cached.db
  if (!cached.client) {
    cached.client = new MongoClient(MONGO_URL)
    await cached.client.connect()
  }
  cached.db = cached.client.db(DB_NAME)
  return cached.db
}

const strip = (arr) => arr.map(({ _id, ...r }) => r)

export async function getStats() {
  try {
    const db = await getDb()
    const jobs = await db.collection('jobs').find({}).toArray()
    const by = (s) => jobs.filter((j) => j.status === s).length
    const artifacts = await db.collection('artifacts').countDocuments()
    const connections = await db.collection('connections').countDocuments()
    return {
      jobs: { total: jobs.length, queued: by('queued'), running: by('running'), completed: by('completed'), failed: by('failed') },
      artifacts,
      connections,
      providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, status: p.status, tier: p.tier })),
      readiness: READINESS,
    }
  } catch (e) {
    return { jobs: { total: 0, queued: 0, running: 0, completed: 0, failed: 0 }, artifacts: 0, connections: 0, providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, status: p.status, tier: p.tier })), readiness: READINESS }
  }
}

export async function getEvents() {
  try {
    const db = await getDb()
    return strip(await db.collection('events').find({}).sort({ ts: -1 }).limit(60).toArray())
  } catch (e) { return [] }
}

export async function getJobs() {
  try {
    const db = await getDb()
    return strip(await db.collection('jobs').find({}).sort({ createdAt: -1 }).limit(100).toArray())
  } catch (e) { return [] }
}

export async function getArtifacts() {
  try {
    const db = await getDb()
    return strip(await db.collection('artifacts').find({}).sort({ createdAt: -1 }).limit(100).toArray())
  } catch (e) { return [] }
}

export async function getConnections() {
  try {
    const db = await getDb()
    return strip(await db.collection('connections').find({}).sort({ createdAt: -1 }).toArray())
  } catch (e) { return [] }
}

export async function getSettings() {
  try {
    const db = await getDb()
    const rows = await db.collection('settings').find({}).toArray()
    const map = {}
    rows.forEach((r) => { map[r.key] = r.value })
    return map
  } catch (e) { return {} }
}
