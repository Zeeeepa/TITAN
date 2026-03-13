# TITAN Deployment Tasks — March 9, 2026

> These tasks should be executed on the **Titan PC** via SSH.
> The Code tab session should be connected to `dj@192.168.1.11` (Titan PC).

## Context

Mission Control v2 has been significantly updated with bug fixes and new features.
The updated code is in this repo and needs to be deployed to the Titan PC for testing.
The Mini PC's TITAN container should be stopped to avoid confusion.

### Changes Made (this session)

**Server-side (src/gateway/server.ts):**
- `/api/config` now returns top-level `model`, `provider`, and `voice` fields
- Added `GET /api/sessions/:id/messages` endpoint
- Added `DELETE /api/sessions/:id` endpoint

**UI Components:**
- Rewrote `AudioVisualizer.tsx` — Canvas-based wave, transform-based bars, `audioLevel` prop
- Updated `VoiceOverlay.tsx` — uses wave visualizer, simulated audio levels
- Fixed `ChatView.tsx` — session sidebar is now an overlay drawer (no more double sidebar)
- Updated `TopBar.tsx` — fallback model/provider display
- Updated `useConfig.tsx` and `api/types.ts` — proper config type mapping

**New Admin Panels (5):**
- `LearningPanel.tsx`, `AutopilotPanel.tsx`, `SecurityPanel.tsx`
- `WorkflowsPanel.tsx`, `MemoryGraphPanel.tsx`
- Routes added to `App.tsx`, nav items added to `Sidebar.tsx`

**UI is pre-built** — `ui/dist/` contains the compiled SPA ready to serve.

## Tasks

### 1. Stop TITAN on Mini PC
```bash
ssh djtony707@192.168.1.95 "docker stop titan-gateway 2>/dev/null; docker rm titan-gateway 2>/dev/null"
```

### 2. Prepare Titan PC
```bash
# Check if Node.js >= 20 is installed
node --version

# If not installed or < v20:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create deployment directory
sudo mkdir -p /opt/TITAN
sudo chown dj:dj /opt/TITAN
```

### 3. Install dependencies and build
```bash
cd /opt/TITAN
npm install
npm run build
# UI is already built (ui/dist/ included in sync)
```

### 4. Configure TITAN
```bash
# Create config directory
mkdir -p ~/.titan

# Write config (Ollama is local on this machine)
cat > ~/.titan/titan.json << 'EOF'
{
  "agent": {
    "model": "ollama/devstral-small-2",
    "provider": "ollama"
  },
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434"
    }
  },
  "gateway": {
    "port": 48420,
    "host": "0.0.0.0",
    "auth": {
      "mode": "none"
    }
  },
  "autonomy": {
    "mode": "supervised"
  },
  "logging": {
    "level": "info"
  }
}
EOF
```

### 5. Start TITAN
```bash
# Option A: Direct (for testing)
cd /opt/TITAN && node dist/index.js

# Option B: Background
cd /opt/TITAN && nohup node dist/index.js > /tmp/titan-gateway.log 2>&1 &

# Option C: Docker with GPU
cd /opt/TITAN && \
  docker build -t titan-gateway . && \
  docker run -d --name titan-gateway \
    -p 48420:48420 \
    --gpus all \
    -e NODE_ENV=production \
    -e TITAN_HOME=/home/titan/.titan \
    -e TITAN_GATEWAY_HOST=0.0.0.0 \
    -e OLLAMA_HOST=http://192.168.1.11:11434 \
    --restart unless-stopped \
    titan-gateway
```

### 6. Verify
```bash
# Health check
curl http://localhost:48420/api/health

# Check config has new fields
curl http://localhost:48420/api/config | jq '{model, provider, voice}'

# Test session endpoints
curl http://localhost:48420/api/sessions

# Dashboard should be at http://192.168.1.11:48420
```

## Ollama Models Available on Titan PC
- devstral-small-2 (24B, Q4_K_M)
- qwen3:30b (30.5B, Q4_K_M)
- qwen3.5:35b (36B, Q4_K_M)
- qwen2.5vl:7b, llava:7b, minicpm-v:8b (vision models)
- qwen3:0.6b (tiny, for testing)
