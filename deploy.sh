#!/usr/bin/env bash
# ==============================================================================
# N.E.X.A Server - Production One-Command Deployment Script
# Safely pulls updates from git, runs full test suite, and reloads PM2
# ==============================================================================
set -e

REPO_DIR="/home/nexa/nexa-server"
if [ ! -d "$REPO_DIR" ]; then
  # Fallback to repository root relative to this script
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

echo "[DEPLOY] Starting N.E.X.A Server production deployment..."
cd "$REPO_DIR"

echo "[DEPLOY] Discarding local build artifacts..."
git checkout data/capabilities_cards.json data/capabilities_manifest.txt 2>/dev/null || true
echo "  ☑ Local build artifacts discarded."

echo "[DEPLOY] Pulling latest code from origin main..."
git pull origin main
echo "  ☑ Latest code pulled from origin main."

echo "[DEPLOY] Executing automated pretest & test suite..."
npm test
echo "  ☑ Pretest and full test suite passed."

echo "[DEPLOY] Performing zero-downtime PM2 reload..."
pm2 reload nexa-server
echo "  ☑ Zero-downtime PM2 reload completed."

echo "☑ N.E.X.A Server successfully deployed and running!"
pm2 status nexa-server
