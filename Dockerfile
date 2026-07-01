# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Multi-stage Production Dockerfile
# Targets: api, worker, dashboard
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

# Copy workspace package files for deterministic install
COPY package.json package-lock.json ./
COPY packages/core/package.json    packages/core/package.json
COPY packages/db/package.json      packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/artifacts/package.json packages/artifacts/package.json
COPY apps/api/package.json         apps/api/package.json
COPY apps/worker/package.json      apps/worker/package.json

# Install all dependencies (including workspaces)
RUN npm ci --ignore-scripts

# ── Stage 2: Build everything ─────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules    packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules      packages/db/node_modules
COPY --from=deps /app/packages/providers/node_modules packages/providers/node_modules
COPY --from=deps /app/packages/artifacts/node_modules packages/artifacts/node_modules
COPY --from=deps /app/apps/api/node_modules         apps/api/node_modules
COPY --from=deps /app/apps/worker/node_modules      apps/worker/node_modules

# Copy all source code
COPY . .

# Generate Prisma client (must happen after schema is copied)
RUN npx prisma generate

# Build packages in dependency order
RUN npm run build --workspace=@amarktai/core && \
    npm run build --workspace=@amarktai/db && \
    npm run build --workspace=@amarktai/providers && \
    npm run build --workspace=@amarktai/artifacts && \
    npm run build --workspace=@amarktai/api && \
    npm run build --workspace=@amarktai/worker

# Build Next.js dashboard
RUN npm run build

# ── Stage 3: Production base ──────────────────────────────────
FROM node:22-slim AS production-base

WORKDIR /app

ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules    packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules      packages/db/node_modules
COPY --from=deps /app/packages/providers/node_modules packages/providers/node_modules
COPY --from=deps /app/packages/artifacts/node_modules packages/artifacts/node_modules
COPY --from=deps /app/apps/api/node_modules         apps/api/node_modules
COPY --from=deps /app/apps/worker/node_modules      apps/worker/node_modules

# Copy Prisma schema and generated client
COPY prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copy built packages
COPY --from=build /app/packages/core/dist    packages/core/dist
COPY --from=build /app/packages/db/dist      packages/db/dist
COPY --from=build /app/packages/providers/dist packages/providers/dist
COPY --from=build /app/packages/artifacts/dist packages/artifacts/dist

# Copy package.json files (needed for runtime resolution)
COPY packages/core/package.json    packages/core/package.json
COPY packages/db/package.json      packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/artifacts/package.json packages/artifacts/package.json

# Copy startup scripts
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# ── Stage 4: API ──────────────────────────────────────────────
FROM production-base AS api

COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/package.json apps/api/package.json

# Create storage directory
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

# ── Stage 5: Worker ───────────────────────────────────────────
FROM production-base AS worker

# Install Playwright Chromium for Crawlee
RUN npx playwright install chromium --with-deps

COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY apps/worker/package.json apps/worker/package.json

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["entrypoint.sh"]
CMD ["worker"]

# ── Stage 6: Dashboard ────────────────────────────────────────
FROM node:22-slim AS dashboard

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
