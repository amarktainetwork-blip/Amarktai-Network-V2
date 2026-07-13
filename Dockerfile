# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Multi-stage Production Dockerfile
# Targets: api, worker, dashboard
# Base: node:22-slim (Debian Bookworm, glibc, OpenSSL 3.0)
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

# Copy workspace package files for deterministic install
COPY package.json package-lock.json ./
COPY packages/core/package.json     packages/core/package.json
COPY packages/db/package.json       packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/artifacts/package.json packages/artifacts/package.json
COPY apps/api/package.json          apps/api/package.json
COPY apps/worker/package.json       apps/worker/package.json

# Install all dependencies (including workspaces)
# --ignore-scripts prevents postinstall from running before source is copied
RUN npm ci --ignore-scripts

# ── Stage 2: Build everything ─────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source code
COPY . .

# Never let copied local build artifacts influence Docker composite builds.
RUN rm -rf .next packages/*/dist apps/*/dist && \
    find packages apps -name "*.tsbuildinfo" -delete

# Build identity injection
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

# Generate build-info.json for health route consumption
RUN node -e "const p=require('./package.json');process.stdout.write(JSON.stringify({gitSha:'${GIT_SHA}',buildTime:'${BUILD_TIME}',serviceName:'amarktai-api',version:p.version||'0.0.0'}))" > build-info.json

# Generate Prisma client with correct binaryTargets for Debian
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build shared packages in dependency order
RUN npm run build --workspace=@amarktai/core && \
    npm run build --workspace=@amarktai/db && \
    npm run build --workspace=@amarktai/providers && \
    npm run build --workspace=@amarktai/artifacts && \
    npm run build --workspace=@amarktai/api && \
    npm run build --workspace=@amarktai/worker

# Build Next.js dashboard (standalone output)
RUN npm run build

# ── Stage 3: Production base (shared by api + worker) ─────────
FROM node:22-slim AS production-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema and generated client (includes Debian OpenSSL 3.0 engine)
COPY prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copy built shared packages
COPY --from=build /app/packages/core/dist     packages/core/dist
COPY --from=build /app/packages/db/dist       packages/db/dist
COPY --from=build /app/packages/providers/dist packages/providers/dist
COPY --from=build /app/packages/artifacts/dist packages/artifacts/dist

# Copy build identity for health route
COPY --from=build /app/build-info.json build-info.json

# Copy package.json files for runtime resolution
COPY packages/core/package.json     packages/core/package.json
COPY packages/db/package.json       packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/artifacts/package.json packages/artifacts/package.json

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy migration deploy script (used by migrate service, not by API/worker)
COPY scripts/prisma-migrate-deploy.mjs scripts/prisma-migrate-deploy.mjs

# ── Stage 4: API ──────────────────────────────────────────────
FROM production-base AS api

# Install ffmpeg for long-form video assembly
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/package.json apps/api/package.json

# Create storage directories
RUN mkdir -p /var/www/amarktai/storage/artifacts \
             /var/www/amarktai/storage/uploads \
             /var/www/amarktai/storage/repos \
             /var/www/amarktai/storage/workspaces \
             /var/www/amarktai/storage/logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["api"]

# ── Stage 5: Worker (includes Playwright for Crawlee) ─────────
FROM production-base AS worker

# Install Playwright Chromium and system dependencies
# This must happen in the production stage (not build) so the browsers persist
RUN npx playwright install chromium --with-deps

COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY apps/worker/package.json apps/worker/package.json

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["entrypoint.sh"]
CMD ["worker"]

# ── Stage 6: Dashboard (Next.js standalone) ───────────────────
FROM node:22-slim AS dashboard

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy Next.js standalone build
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
