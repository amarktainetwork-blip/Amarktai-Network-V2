#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Production Verification Script
# ═══════════════════════════════════════════════════════════════
# Run on the VPS to verify the deployment is healthy.
# Usage: bash deploy/verify.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "PASS" ]; then
    echo "  ✓ PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo "  AmarktAI Network V2 — Production Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Docker containers ─────────────────────────────────────
echo "[1] Docker Containers"
for svc in api dashboard mariadb redis qdrant; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "amarktai-network-v2-${svc}-1" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "running" ]; then
    check "$svc container running" "PASS"
  else
    check "$svc container running (status: $STATUS)" "FAIL"
  fi
done

# ── 2. Health checks ─────────────────────────────────────────
echo ""
echo "[2] Health Checks"

# API health
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/health 2>/dev/null || echo "000")
if [ "$API_HEALTH" = "200" ]; then
  check "API /health returns 200" "PASS"
else
  check "API /health returns 200 (got $API_HEALTH)" "FAIL"
fi

# Dashboard
DASH_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 2>/dev/null || echo "000")
if [ "$DASH_HEALTH" = "200" ]; then
  check "Dashboard returns 200" "PASS"
else
  check "Dashboard returns 200 (got $DASH_HEALTH)" "FAIL"
fi

# ── 3. Login via Dashboard proxy ─────────────────────────────
echo ""
echo "[3] Login Flow"

# Via Dashboard (Next.js proxy)
DASH_LOGIN=$(curl -s -w "\n%{http_code}" http://127.0.0.1:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"amarktainetwork@gmail.com","password":"Ashmor12@"}' 2>/dev/null)
DASH_CODE=$(echo "$DASH_LOGIN" | tail -1)
DASH_BODY=$(echo "$DASH_LOGIN" | head -1)

if [ "$DASH_CODE" = "200" ]; then
  check "Dashboard proxy login returns 200" "PASS"
  TOKEN=$(echo "$DASH_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    check "JWT token received" "PASS"
  else
    check "JWT token received" "FAIL"
  fi
else
  check "Dashboard proxy login returns 200 (got $DASH_CODE)" "FAIL"
  echo "    Response: $DASH_BODY"
fi

# Via API directly
API_LOGIN=$(curl -s -w "\n%{http_code}" http://127.0.0.1:3001/api/v1/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"amarktainetwork@gmail.com","password":"Ashmor12@"}' 2>/dev/null)
API_CODE=$(echo "$API_LOGIN" | tail -1)

if [ "$API_CODE" = "200" ]; then
  check "API direct login returns 200" "PASS"
else
  check "API direct login returns 200 (got $API_CODE)" "FAIL"
fi

# ── 4. JWT verification ──────────────────────────────────────
echo ""
echo "[4] JWT Verification"

if [ -n "${TOKEN:-}" ]; then
  VERIFY=$(curl -s -w "\n%{http_code}" http://127.0.0.1:3001/api/v1/auth/verify \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  VERIFY_CODE=$(echo "$VERIFY" | tail -1)
  
  if [ "$VERIFY_CODE" = "200" ]; then
    check "JWT verification returns 200" "PASS"
  else
    check "JWT verification returns 200 (got $VERIFY_CODE)" "FAIL"
  fi
else
  check "JWT verification (no token available)" "FAIL"
fi

# ── 5. Nginx ─────────────────────────────────────────────────
echo ""
echo "[5] Nginx"

if nginx -t 2>/dev/null; then
  check "Nginx config valid" "PASS"
else
  check "Nginx config valid" "FAIL"
fi

# Test via public domain
PUBLIC_LOGIN=$(curl -s -w "\n%{http_code}" https://amarktai.co.za/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"amarktainetwork@gmail.com","password":"Ashmor12@"}' 2>/dev/null || echo -e "\n000")
PUBLIC_CODE=$(echo "$PUBLIC_LOGIN" | tail -1)

if [ "$PUBLIC_CODE" = "200" ]; then
  check "Public domain login returns 200" "PASS"
else
  check "Public domain login returns 200 (got $PUBLIC_CODE)" "FAIL"
  echo "    Response: $(echo "$PUBLIC_LOGIN" | head -1)"
fi

# ── 6. SSL ────────────────────────────────────────────────────
echo ""
echo "[6] SSL"

SSL_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://amarktai.co.za 2>/dev/null || echo "000")
if [ "$SSL_CHECK" = "200" ]; then
  check "HTTPS returns 200" "PASS"
else
  check "HTTPS returns 200 (got $SSL_CHECK)" "FAIL"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
