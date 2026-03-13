---
name: titan-debug
description: Debug TITAN issues end-to-end. Traces problems from UI through API to backend, checking logs, network, and code paths.
user_invocable: true
---

# TITAN Debug Pipeline

Systematic debugging for TITAN issues — traces the full stack from UI to backend.

## Process

### 1. Identify the Layer
Determine where the issue lives:
- **UI** — React component, API client, hooks, rendering
- **API** — Gateway endpoint, request/response format, auth
- **Agent** — LLM routing, tool execution, memory
- **Provider** — Model communication, token streaming
- **Voice** — LiveKit, STT/TTS pipeline

### 2. Check Logs
```bash
# Gateway logs on Titan PC
ssh titan "tail -100 /tmp/titan-gateway.log"

# Filter for errors
ssh titan "grep -i error /tmp/titan-gateway.log | tail -20"
```

### 3. Test API Layer
```bash
# Health check
curl -s http://192.168.1.11:48420/api/health

# Config check
curl -s http://192.168.1.11:48420/api/config | python3 -m json.tool | head -30

# Chat test (non-streaming)
curl -s -X POST http://192.168.1.11:48420/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "ping"}'

# Chat test (SSE streaming)
curl -s -N -X POST http://192.168.1.11:48420/api/message \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"content": "say hello"}' | head -20
```

### 4. Trace the Code Path
Based on the layer:
- Read the relevant source file(s)
- Check the request/response flow
- Identify the exact point of failure
- Fix the root cause

### 5. Verify Fix
- Rebuild if code changed: `npm run build` (backend) or `cd ui && npm run build` (UI)
- Re-test the specific scenario
- Deploy if needed: `rsync -az --delete ui/dist/ titan:/opt/TITAN/ui/dist/`

## Key Files
| Layer | File |
|-------|------|
| Gateway API | `src/gateway/server.ts` |
| Agent core | `src/agent/agent.ts` |
| Provider router | `src/providers/base.ts` |
| UI API client | `ui/src/api/client.ts` |
| UI types | `ui/src/api/types.ts` |
| SSE hook | `ui/src/hooks/useSSE.ts` |
| Config schema | `src/config/schema.ts` |
| Voice | `src/voice/livekitAgent.ts` |
