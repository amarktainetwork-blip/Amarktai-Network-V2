#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Production Deployment Script
# ═══════════════════════════════════════════════════════════════
# Run from the repository root: /var/www/Amarktai-Network-V2
# Usage: bash deploy/deploy.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REPO_DIR="/var/www/Amarktai-Network-V2"
cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "  AmarktAI Network V2 — Production Deployment"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Pull latest code ───────────────────────────────────────
echo ""
echo "[1/7] Pulling latest code..."
git fetch origin main
git reset --hard origin/main
echo "  ✓ Code updated to $(git rev-parse --short HEAD)"

# ── 2. Install dependencies ──────────────────────────────────
echo ""
echo "[2/7] Installing dependencies..."
npm ci --ignore-scripts
echo "  ✓ Dependencies installed"

# ── 3. Generate Prisma client ────────────────────────────────
echo ""
echo "[3/7] Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma
echo "  ✓ Prisma client generated"

# ── 4. Build shared packages ─────────────────────────────────
echo ""
echo "[4/7] Building shared packages..."
npm run build --workspace=@amarktai/core
npm run build --workspace=@amarktai/db
echo "  ✓ Shared packages built"

# ── 5. Rebuild Docker images ─────────────────────────────────
echo ""
echo "[5/7] Rebuilding Docker images..."
docker compose build --no-cache api dashboard
echo "  ✓ Docker images rebuilt"

# ── 6. Restart containers ────────────────────────────────────
echo ""
echo "[6/7] Restarting containers..."
docker compose up -d
echo "  ✓ Containers restarted"

# ── 7. Wait for health checks ────────────────────────────────
echo ""
echo "[7/7] Waiting for services to be healthy..."
sleep 10

# Check API health
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    echo "  ✓ API healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ✗ API health check failed"
    docker compose logs api --tail=20
    exit 1
  fi
  sleep 2
done

# Check Dashboard
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo "  ✓ Dashboard healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ✗ Dashboard health check failed"
    docker compose logs dashboard --tail=20
    exit 1
  fi
  sleep 2
done

# ── 8. Test login endpoint ───────────────────────────────────
echo ""
echo "[8/8] Testing login endpoint..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" http://127.0.0.1:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"amarktainetwork@gmail.com","password":"Ashmor12@"}')

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
BODY=$(echo "$LOGIN_RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ Login returns HTTP 200"
  echo "  ✓ Response: $(echo "$BODY" | head -c 100)..."
else
  echo "  ✗ Login returned HTTP $HTTP_CODE"
  echo "  ✗ Response: $BODY"
  echo ""
  echo "Checking API logs..."
  docker compose logs api --tail=20
  exit 1
fi

# ── 9. Nginx ─────────────────────────────────────────────────
echo ""
echo "[9/9] Checking Nginx..."
if nginx -t 2>/dev/null; then
  echo "  ✓ Nginx config valid"
else
  echo "  ✗ Nginx config invalid — fix before continuing"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard: https://amarktai.co.za"
echo "  API:       http://127.0.0.1:3001"
echo "  Health:    http://127.0.0.1:3001/health"
echo ""
echo "  Login:     amarktainetwork@gmail.com"
echo "  Password:  Ashmor12@"
echo ""
