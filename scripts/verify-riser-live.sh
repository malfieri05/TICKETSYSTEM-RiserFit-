#!/usr/bin/env bash
# Live Riser sync verification script.
# Prerequisites: Set RISER_API_BASE_URL, RISER_API_KEY, RISER_POLICY_IDS in apps/api/.env and start the API (e.g. port 3001).
set -e
BASE="${API_BASE_URL:-http://localhost:3001}"
EMAIL="${ADMIN_EMAIL:-malfieri05@gmail.com}"

echo "=== Riser live verification ==="
echo "API base: $BASE"
echo "Admin email: $EMAIL"
echo ""

echo "1. Getting admin token..."
TOKEN=$(curl -s -X POST "$BASE/api/auth/dev-login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" | jq -r '.access_token')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Failed to get token. Is the API running and dev-login allowed?"
  exit 1
fi

echo "2. POST /api/ai/riser/sync..."
SYNC_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/riser/sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP_CODE=$(echo "$SYNC_RESULT" | tail -n1)
BODY=$(echo "$SYNC_RESULT" | sed '$d')
echo "HTTP $HTTP_CODE"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

if echo "$BODY" | jq -e '.configMissing == true' >/dev/null 2>&1; then
  echo ""
  echo "Config missing: set RISER_API_BASE_URL, RISER_API_KEY, RISER_POLICY_IDS in apps/api/.env and restart the API."
  exit 0
fi

SYNCED=$(echo "$BODY" | jq -r '.synced // 0')
echo ""
echo "3. GET /api/ai/documents..."
DOCS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/ai/documents")
COUNT=$(echo "$DOCS" | jq 'length')
RISER_COUNT=$(echo "$DOCS" | jq '[.[] | select(.upstreamProvider == "riser")] | length')
echo "Total documents: $COUNT (Riser: $RISER_COUNT)"
if [ "$RISER_COUNT" -gt 0 ]; then
  echo "Sample Riser doc:"
  echo "$DOCS" | jq '[.[] | select(.upstreamProvider == "riser")][0] | {title, upstreamId, upstreamProvider, _count}' 2>/dev/null || true
fi

echo ""
echo "=== Summary ==="
echo "Sync: $SYNCED synced (see details above). Documents list: $COUNT total, $RISER_COUNT from Riser."
if [ "$SYNCED" -gt 0 ] && [ "$RISER_COUNT" -gt 0 ]; then
  echo "Live Riser integration verified."
fi
