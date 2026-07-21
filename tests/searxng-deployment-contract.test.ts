import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const production = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const fixture = readFileSync(new URL('../docker-compose.release-fixture.yml', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../searxng/settings.yml', import.meta.url), 'utf8')
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')

const pinnedImage = 'docker.io/searxng/searxng:2026.7.17-81c9c2386'

describe('internal SearXNG deployment contract', () => {
  it('pins the same immutable rolling-release tag in production and fixture stacks', () => {
    expect(production).toContain(`image: ${pinnedImage}`)
    expect(fixture).toContain(`image: ${pinnedImage}`)
    expect(production).not.toContain('searxng/searxng:latest')
    expect(fixture).not.toContain('searxng/searxng:latest')
  })

  it('keeps SearXNG private to the Compose network', () => {
    const productionService = production.match(/  searxng:\n[\s\S]+?\n  # ── API/)?.[0] ?? ''
    const fixtureService = fixture.match(/  searxng:\n[\s\S]+?\n  migrate:/)?.[0] ?? ''
    expect(productionService).toContain('expose:')
    expect(fixtureService).toContain('expose:')
    expect(productionService).not.toContain('ports:')
    expect(fixtureService).not.toContain('ports:')
    expect(productionService).toContain('no-new-privileges:true')
    expect(fixtureService).toContain('no-new-privileges:true')
  })

  it('mounts explicit JSON-only settings and checks the internal health endpoint', () => {
    expect(production).toContain('./searxng/settings.yml:/etc/searxng/settings.yml:ro')
    expect(fixture).toContain('./searxng/settings.yml:/etc/searxng/settings.yml:ro')
    expect(production).toContain('http://127.0.0.1:8080/healthz')
    expect(fixture).toContain('http://127.0.0.1:8080/healthz')
    expect(settings).toMatch(/formats:\n\s+- json/)
    expect(settings).not.toMatch(/\n\s+- html/)
    expect(settings).toContain('safe_search: 2')
    expect(settings).toContain('public_instance: false')
    expect(settings).toContain('limiter: false')
  })

  it('requires a production secret and passes only the internal service URL to Network services', () => {
    expect(envExample).toContain('SEARXNG_SECRET=CHANGE_ME_to_a_separate_random_secret')
    expect(envExample).toContain('SEARXNG_URL=http://searxng:8080')
    expect(production).toContain('SEARXNG_SECRET: ${SEARXNG_SECRET:?SEARXNG_SECRET must be set}')
    expect(production.match(/SEARXNG_URL: http:\/\/searxng:8080/g)).toHaveLength(2)
    expect(fixture.match(/SEARXNG_URL: http:\/\/searxng:8080/g)).toHaveLength(2)
  })

  it('gates API and worker startup on SearXNG health', () => {
    expect(production.match(/searxng:\n\s+condition: service_healthy/g)).toHaveLength(2)
    expect(fixture.match(/searxng:\n\s+condition: service_healthy/g)).toHaveLength(2)
  })
})
