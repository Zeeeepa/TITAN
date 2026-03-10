#!/bin/bash
# Deploy TITAN to a remote machine
# Usage: ./scripts/deploy.sh <target> [--docker] [--gpu]
#
# Examples:
#   ./scripts/deploy.sh titan                # npm start on Titan PC
#   ./scripts/deploy.sh titan --docker --gpu # Docker with RTX 5090
#   ./scripts/deploy.sh minipc --docker      # Docker on Mini PC
#
# Prerequisites:
#   - SSH alias configured (~/.ssh/config)
#   - Node.js >= 20 on target (or Docker)

set -euo pipefail

TARGET="${1:?Usage: deploy.sh <target> [--docker] [--gpu]}"
USE_DOCKER=false
USE_GPU=false

for arg in "$@"; do
  case "$arg" in
    --docker) USE_DOCKER=true ;;
    --gpu) USE_GPU=true ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REMOTE_PATH="/opt/TITAN"

echo "╔═══════════════════════════════════════╗"
echo "║     TITAN Deploy → $TARGET"
echo "╚═══════════════════════════════════════╝"

# Step 1: Build UI locally
echo ""
echo "▸ [1/5] Building UI..."
cd "$PROJECT_DIR/ui" && npm run build 2>&1 | tail -3

# Step 2: Build backend
echo "▸ [2/5] Building backend..."
cd "$PROJECT_DIR" && npm run build 2>&1 | tail -3

# Step 3: Sync
echo "▸ [3/5] Syncing to $TARGET:$REMOTE_PATH..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude "ui/node_modules" \
  "$PROJECT_DIR/" "$TARGET:$REMOTE_PATH/" 2>&1 | tail -5

# Step 4: Install deps
echo "▸ [4/5] Installing dependencies..."
ssh "$TARGET" "cd $REMOTE_PATH && npm install --omit=dev 2>&1 | tail -3"

# Step 5: Start
echo "▸ [5/5] Starting TITAN..."
if [ "$USE_DOCKER" = true ]; then
  GPU_FLAG=""
  [ "$USE_GPU" = true ] && GPU_FLAG="--gpus all"

  ssh "$TARGET" "cd $REMOTE_PATH && \
    docker stop titan-gateway 2>/dev/null || true && \
    docker rm titan-gateway 2>/dev/null || true && \
    docker build -t titan-gateway . && \
    docker run -d --name titan-gateway \
      -p 48420:48420 \
      $GPU_FLAG \
      -e NODE_ENV=production \
      -e TITAN_HOME=/home/titan/.titan \
      -e TITAN_GATEWAY_HOST=0.0.0.0 \
      -e OLLAMA_HOST=http://192.168.1.11:11434 \
      --restart unless-stopped \
      titan-gateway"
  echo ""
  echo "✅ Docker container 'titan-gateway' started"
else
  # Kill any existing process
  ssh "$TARGET" "pkill -f 'node.*dist/index' 2>/dev/null || true"
  ssh "$TARGET" "cd $REMOTE_PATH && nohup node dist/index.js > /tmp/titan-gateway.log 2>&1 &"
  echo ""
  echo "✅ TITAN started (logs: /tmp/titan-gateway.log)"
fi

# Get the target's IP
TARGET_IP=$(ssh "$TARGET" "hostname -I | awk '{print \$1}'" 2>/dev/null || echo "$TARGET")
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║  Dashboard: http://$TARGET_IP:48420"
echo "║  Health:    http://$TARGET_IP:48420/api/health"
echo "╚═══════════════════════════════════════╝"
