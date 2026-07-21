import type { FastifyInstance } from 'fastify'
import { BrandProfileSchema } from '@amarktai/core/marketing-platform'
import { authenticateAppKey } from './jobs.js'
import {
  archiveBrandProfile,
  createBrandProfile,
  getBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
} from '../lib/brand-profile-store.js'

const BRAND_PROFILE_ACCESS_CAPABILITIES = new Set([
  'brand_scrape',
  'campaign_generation',
  'social_content_generation',
])

function hasBrandProfileAccess(allowedCapabilities: readonly string[] | undefined): boolean {
  return Boolean(allowedCapabilities?.some((capability) => BRAND_PROFILE_ACCESS_CAPABILITIES.has(capability)))
}

function invalidProfileResponse(error: unknown) {
  if (error && typeof error === 'object' && 'issues' in error) {
    return { error: true, code: 'INVALID_BRAND_PROFILE', message: 'Brand Profile validation failed.', issues: (error as { issues: unknown }).issues }
  }
  return { error: true, code: 'INVALID_BRAND_PROFILE', message: error instanceof Error ? error.message : 'Brand Profile validation failed.' }
}

export async function appBrandProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/brand-profiles', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!hasBrandProfileAccess(auth.allowedCapabilities)) {
      return reply.status(403).send({ error: true, code: 'BRAND_PROFILE_CAPABILITY_REQUIRED', message: 'App requires brand_scrape, campaign_generation, or social_content_generation access.' })
    }
    return reply.send(await listBrandProfiles(auth.app!.slug))
  })

  app.get('/api/v1/brand-profiles/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!hasBrandProfileAccess(auth.allowedCapabilities)) {
      return reply.status(403).send({ error: true, code: 'BRAND_PROFILE_CAPABILITY_REQUIRED', message: 'App requires Brand Profile capability access.' })
    }
    const { id } = request.params as { id: string }
    const profile = await getBrandProfile(auth.app!.slug, id)
    if (!profile) return reply.status(404).send({ error: true, code: 'BRAND_PROFILE_NOT_FOUND', message: 'Brand Profile not found.' })
    return reply.send({ profile })
  })

  app.post('/api/v1/brand-profiles', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!hasBrandProfileAccess(auth.allowedCapabilities)) {
      return reply.status(403).send({ error: true, code: 'BRAND_PROFILE_CAPABILITY_REQUIRED', message: 'App requires Brand Profile capability access.' })
    }

    const parsed = BrandProfileSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(invalidProfileResponse(parsed.error))
    if (parsed.data.appSlug !== auth.app!.slug) {
      return reply.status(403).send({ error: true, code: 'APP_SCOPE_MISMATCH', message: 'Brand Profile appSlug must match the authenticated app.' })
    }

    try {
      const profile = await createBrandProfile(parsed.data)
      return reply.status(201).send({ profile })
    } catch (error) {
      if (error instanceof Error && error.message === 'BRAND_PROFILE_ALREADY_EXISTS') {
        return reply.status(409).send({ error: true, code: 'BRAND_PROFILE_ALREADY_EXISTS', message: 'Brand Profile already exists.' })
      }
      throw error
    }
  })

  app.put('/api/v1/brand-profiles/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!hasBrandProfileAccess(auth.allowedCapabilities)) {
      return reply.status(403).send({ error: true, code: 'BRAND_PROFILE_CAPABILITY_REQUIRED', message: 'App requires Brand Profile capability access.' })
    }

    const { id } = request.params as { id: string }
    const parsed = BrandProfileSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(invalidProfileResponse(parsed.error))
    if (parsed.data.appSlug !== auth.app!.slug) {
      return reply.status(403).send({ error: true, code: 'APP_SCOPE_MISMATCH', message: 'Brand Profile appSlug must match the authenticated app.' })
    }
    if (parsed.data.brandProfileId !== id) {
      return reply.status(400).send({ error: true, code: 'BRAND_PROFILE_ID_MISMATCH', message: 'Path ID and Brand Profile ID must match.' })
    }

    try {
      const profile = await updateBrandProfile(parsed.data)
      return reply.send({ profile })
    } catch (error) {
      if (error instanceof Error && error.message === 'BRAND_PROFILE_NOT_FOUND') {
        return reply.status(404).send({ error: true, code: 'BRAND_PROFILE_NOT_FOUND', message: 'Brand Profile not found.' })
      }
      throw error
    }
  })

  app.delete('/api/v1/brand-profiles/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!hasBrandProfileAccess(auth.allowedCapabilities)) {
      return reply.status(403).send({ error: true, code: 'BRAND_PROFILE_CAPABILITY_REQUIRED', message: 'App requires Brand Profile capability access.' })
    }
    const { id } = request.params as { id: string }
    try {
      const profile = await archiveBrandProfile(auth.app!.slug, id)
      return reply.send({ profile })
    } catch (error) {
      if (error instanceof Error && error.message === 'BRAND_PROFILE_NOT_FOUND') {
        return reply.status(404).send({ error: true, code: 'BRAND_PROFILE_NOT_FOUND', message: 'Brand Profile not found.' })
      }
      throw error
    }
  })
}
