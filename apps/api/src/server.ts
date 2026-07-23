/**
 * AmarktAI Network API server.
 *
 * Production HTTP API engine with rate limiting, Redis, auth, jobs,
 * artifact routes, provider admin routes, and source-of-truth validation.
 */

import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import { API_PORT, API_HOST, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '@amarktai/core'
import { redisPluginDecorated } from './plugins/redis.js'
import { jwtPluginDecorated } from './plugins/jwt.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { governedTtsIngressPlugin } from './plugins/governed-tts-ingress.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { artifactRoutes } from './routes/artifacts.js'
import { authRoutes } from './routes/auth.js'
import { adminProviderRoutes } from './routes/admin-providers.js'
import { adminTruthRoutes } from './routes/admin-truth.js'
import { adminRuntimeProofRoutes } from './routes/admin-runtime-proofs.js'
import { adminJobRoutes } from './routes/admin-jobs.js'
import { adminArtifactRoutes } from './routes/admin-artifacts.js'
import { adminStudioRoutes } from './routes/admin-studio.js'
import { adminLongFormVideoRoutes } from './routes/admin-long-form-video.js'
import { adminPremiumAdvertRoutes } from './routes/admin-premium-advert.js'
import { adminMusicRoutes } from './routes/admin-music.js'
import { adminSongRoutes } from './routes/admin-song.js'
import { adminModelDiscoveryRoutes } from './routes/admin-model-discovery.js'
import { modelRegistryRoutes } from './routes/model-registry.js'
import { streamingChatRoutes } from './routes/streaming-chat.js'
import { adminAppConnectionRoutes } from './routes/admin-app-connections.js'
import { appGrantRoutes } from './routes/admin-app-grants.js'
import { appPlatformRoutes } from './routes/app-platform.js'
import { appBrandProfileRoutes } from './routes/app-brand-profiles.js'
import { appSocialAdVideoRoutes } from './routes/app-social-ad-video.js'
import { appSocialAdAssemblyRoutes } from './routes/app-social-ad-assembly.js'
import { appSocialAdFinalApprovalRoutes } from './routes/app-social-ad-final-approval.js'
import { adminMarketingWorkspaceRoutes } from './routes/admin-marketing-workspace.js'
import { appMarketingCampaignRoutes } from './routes/app-marketing-campaigns.js'
import { appMemoryRoutes } from './routes/app-memory.js'
import { appRagRoutes } from './routes/app-rag.js'
import { appResearchRoutes } from './routes/app-research.js'
import { appDurableWorkflowRoutes } from './routes/app-durable-workflows.js'
import { appSourceArtifactRoutes } from './routes/app-source-artifacts.js'
import { appVoiceAvatarProfileRoutes } from './routes/app-voice-avatar-profiles.js'
import { appVoiceAvatarEvidenceRoutes } from './routes/app-voice-avatar-evidence.js'
import { registerVoiceAudioRoutes } from './routes/voice-audio.js'
import { adminVoiceRoutes } from './routes/admin-voices.js'
import { ensureDefaultAdminExists } from './lib/admin-bootstrap.js'
import { bootstrapInternalDashboardApps } from './lib/internal-app-bootstrap.js'
import { assertDatabaseSchemaCurrent } from '@amarktai/db'
import { assertReleaseFixtureModeConfiguration, bootstrapReleaseFixtureProviders } from './lib/release-fixture-mode.js'

async function main(): Promise<void> {
  assertReleaseFixtureModeConfiguration()
  await assertDatabaseSchemaCurrent()
  await bootstrapReleaseFixtureProviders()
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
  })

  const allowedCorsOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_API_URL ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  const allowUnrestrictedDevelopmentCors = process.env.NODE_ENV !== 'production' && allowedCorsOrigins.size === 0

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowUnrestrictedDevelopmentCors || allowedCorsOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin is not allowed by CORS policy'), false)
    },
  })
  await app.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW_MS,
  })
  await app.register(redisPluginDecorated)
  await app.register(jwtPluginDecorated)
  await app.register(errorHandlerPlugin)
  await app.register(governedTtsIngressPlugin)

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(adminProviderRoutes)
  await app.register(adminTruthRoutes)
  await app.register(adminRuntimeProofRoutes)
  await app.register(adminJobRoutes)
  await app.register(adminArtifactRoutes)
  await app.register(adminStudioRoutes)
  await app.register(adminLongFormVideoRoutes)
  await app.register(adminPremiumAdvertRoutes)
  await app.register(adminMusicRoutes)
  await app.register(adminSongRoutes)
  await app.register(adminModelDiscoveryRoutes)
  await app.register(modelRegistryRoutes)
  await app.register(streamingChatRoutes)
  await app.register(adminAppConnectionRoutes)
  await app.register(appGrantRoutes)
  await app.register(jobRoutes)
  await app.register(artifactRoutes)
  await app.register(appPlatformRoutes)
  await app.register(appBrandProfileRoutes)
  await app.register(appSocialAdVideoRoutes)
  await app.register(appSocialAdAssemblyRoutes)
  await app.register(appSocialAdFinalApprovalRoutes)
  await app.register(adminMarketingWorkspaceRoutes)
  await app.register(appMarketingCampaignRoutes)
  await app.register(appMemoryRoutes)
  await app.register(appRagRoutes)
  await app.register(appResearchRoutes)
  await app.register(appSourceArtifactRoutes)
  await app.register(appDurableWorkflowRoutes)
  await app.register(appVoiceAvatarProfileRoutes)
  await app.register(appVoiceAvatarEvidenceRoutes)
  await app.register(registerVoiceAudioRoutes)
  await app.register(adminVoiceRoutes)

  await ensureDefaultAdminExists(app.log)
  await bootstrapInternalDashboardApps(app.log)

  try {
    await app.listen({ port: API_PORT, host: API_HOST })
    app.log.info(`AmarktAI API server listening on ${API_HOST}:${API_PORT}`)
  } catch (err) {
    app.log.fatal(err, 'Failed to start server')
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
