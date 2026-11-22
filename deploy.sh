#!/usr/bin/env bash
# ==============================================================================
# N.E.X.A Server - Production One-Command Deployment Script
# Safely pulls updates from git, installs changed deps, runs full test suite,
# optionally rebuilds nexa-io when Go sources change, and restarts PM2 cleanly.
# ==============================================================================
set -euo pipefail

REPO_DIR="/home/nexa/nexa-server"
if [ ! -d "$REPO_DIR" ]; then
  # Fallback to repository root relative to this script
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

echo "[DEPLOY] Starting N.E.X.A Server production deployment..."
cd "$REPO_DIR"

OLD_HEAD="$(git rev-parse HEAD 2>/dev/null || echo "")"

echo "[DEPLOY] Discarding local build artifacts..."
git checkout data/capabilities_cards.json data/capabilities_manifest.txt deploy.sh 2>/dev/null || true
echo "  [OK] Local build artifacts discarded."

echo "[DEPLOY] Pulling latest code from origin main..."
git pull --ff-only origin main
NEW_HEAD="$(git rev-parse HEAD 2>/dev/null || echo "")"
echo "  [OK] Latest code pulled from origin main."

if [ -n "$OLD_HEAD" ] && [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -q '^package-lock\.json$'; then
    echo "[DEPLOY] package-lock.json changed, running npm ci --omit=dev..."
    npm ci --omit=dev
    echo "  [OK] Dependencies synchronized."
  fi
fi

echo "[DEPLOY] Executing automated pretest & test suite..."
npm test
echo "  [OK] Pretest and full test suite passed."

if [ -n "$OLD_HEAD" ] && [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -q '^nexa-io/'; then
    if command -v go >/dev/null 2>&1; then
      echo "[DEPLOY] nexa-io/ sources changed, testing & rebuilding Go sidecar..."
      (
        cd "$REPO_DIR/nexa-io"
        go test -race ./...
        CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /tmp/nexa-io.new ./cmd/nexa-io
      )
      sudo systemctl stop nexa-log.service nexa-term.service 2>/dev/null || true
      sudo install -m 0755 /tmp/nexa-io.new /opt/nexa/bin/nexa-io
      rm -f /tmp/nexa-io.new
      sudo systemctl restart nexa-log.socket nexa-term.socket
      echo "  [OK] nexa-io binary rebuilt and sockets restarted."
    else
      echo "[DEPLOY] WARN: nexa-io/ changed but 'go' binary not found in PATH; skipping sidecar rebuild."
    fi
  fi
fi

if systemctl is-enabled --quiet nexa-server.service 2>/dev/null; then
  echo "[DEPLOY] Restarting nexa-server.service cleanly via systemd (Polkit)..."
  systemctl restart nexa-server.service
  echo "  [OK] systemd restart completed."
  echo "[OK] N.E.X.A Server successfully deployed and running under systemd!"
  systemctl status nexa-server.service --no-pager -n 10
else
  echo "[DEPLOY] Restarting PM2 process cleanly (fork_mode)..."
  pm2 restart nexa-server --update-env
  echo "  [OK] PM2 restart completed."
  echo "[OK] N.E.X.A Server successfully deployed and running!"
  pm2 status nexa-server
fi
