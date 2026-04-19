#!/bin/bash
# Start the Agentive dev environment
# Usage: ./scripts/start-dev.sh
#
# Prerequisites:
#   - Docker running (docker compose up -d from repo root)
#   - Environment variables in .env
#
# This script:
#   1. Syncs Prisma schema to DB
#   2. Starts the engine dev server
#   3. Starts a cloudflared tunnel
#   4. Updates Retell + Twilio webhook URLs
#   5. Prints the tunnel URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# Load .env
set -a; source "$ENV_FILE"; set +a

echo "=== Agentive Dev Setup ==="

# 1. Sync Prisma schema
echo "[1/4] Syncing Prisma schema..."
cd "$ROOT_DIR"
DATABASE_URL="$DATABASE_URL" npx prisma db push --schema=packages/engine/prisma/schema.prisma --accept-data-loss 2>/dev/null || {
  echo "WARNING: Prisma db push failed. Make sure Postgres is running."
  echo "  Run: docker compose up -d  (from the main repo directory)"
  exit 1
}
echo "       Schema synced."

# 2. Start dev server in background
echo "[2/4] Starting engine dev server..."
cd "$ROOT_DIR/packages/engine"
npx tsx watch src/server.ts &
SERVER_PID=$!
echo "       Server PID: $SERVER_PID (port ${PORT:-3001})"

# Wait for server to be ready
echo "       Waiting for server..."
for i in $(seq 1 30); do
  nc -z localhost "${PORT:-3001}" 2>/dev/null && break
  sleep 1
done
echo "       Server ready."

# 3. Start cloudflared tunnel
echo "[3/4] Starting cloudflared tunnel..."
TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url "http://localhost:${PORT:-3001}" > "$TUNNEL_LOG" 2>&1 &
CLOUDFLARED_PID=$!

# Extract tunnel URL
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  [ -n "$TUNNEL_URL" ] && break
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not determine tunnel URL. Check $TUNNEL_LOG"
  kill $SERVER_PID $CLOUDFLARED_PID 2>/dev/null
  exit 1
fi

echo "       Tunnel URL: $TUNNEL_URL"

# 4. Update Retell webhook URL
echo "[4/4] Updating webhook URLs..."
curl -s -X PATCH "https://api.retellai.com/update-agent/${RETELL_AGENT_ID}" \
  -H "Authorization: Bearer ${RETELL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"webhook_url\": \"${TUNNEL_URL}/webhooks/retell/call-ended\", \"webhook_events\": [\"call_started\", \"call_ended\", \"call_analyzed\", \"transcript_updated\"]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'       Retell webhook: {d.get(\"webhook_url\",\"FAILED\")}')"

# Update Twilio SMS webhook
TWILIO_AUTH_TOKEN=""  # API Key auth doesn't use auth token for REST, but Twilio API needs it
# Using Twilio Client SDK (already configured in our code)
echo "       Twilio SMS webhook: Configure manually in Twilio Console:"
echo "         ${TUNNEL_URL}/webhooks/sms/inbound"

echo ""
echo "=== Ready! ==="
echo "  Server:      http://localhost:${PORT:-3001}"
echo "  Tunnel:      $TUNNEL_URL"
echo "  Health:      ${TUNNEL_URL}/health"
echo "  Lead webhook: ${TUNNEL_URL}/webhooks/leads"
echo ""
echo "  Press Ctrl+C to stop server + tunnel"

# Wait for server process
wait $SERVER_PID