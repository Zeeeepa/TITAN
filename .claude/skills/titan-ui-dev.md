---
name: titan-ui-dev
description: TITAN Mission Control UI development helper. Understands the React SPA architecture, component patterns, API client, and deployment pipeline.
user_invocable: true
---

# TITAN UI Development

Context and workflow for developing Mission Control v2 (React 19 SPA).

## Architecture

| Layer | Location | Tech |
|-------|----------|------|
| Components | `ui/src/components/` | React 19 + TypeScript |
| API Client | `ui/src/api/client.ts` | Fetch-based, transforms responses |
| Types | `ui/src/api/types.ts` | TypeScript interfaces |
| Hooks | `ui/src/hooks/` | useConfig, useSSE |
| Routing | `ui/src/App.tsx` | React Router v7 |
| Styling | Tailwind CSS 4 | `@import "tailwindcss"` |
| Build | Vite | `ui/vite.config.ts` |

## Component Structure

```
ui/src/components/
├── admin/          # 10 admin panels (Settings, Overview, Mesh, etc.)
├── chat/           # ChatView, ChatInput, MessageBubble, StreamingMessage
├── layout/         # TopBar, AdminLayout
└── voice/          # VoiceOverlay, AudioVisualizer
```

## Dev Server

The Vite dev server proxies API calls to Titan PC:
- Dev: `http://localhost:5173` (proxied to `192.168.1.11:48420`)
- Prod: `http://192.168.1.11:48420` (served from `ui/dist/`)

Start dev server: Check `.claude/launch.json` for the titan-ui-dev config, then use `preview_start`.

## API Contract

The gateway (`src/gateway/server.ts`) defines the API. The UI client (`ui/src/api/client.ts`) transforms responses where the gateway shape differs from UI types. Key transforms:
- `getModels()`: `{provider: [ids]}` object flattened to `ModelInfo[]`
- `getStats()`: Flat shape normalized to nested `memoryUsage`
- `getChannels()`: Array mapped to `ChannelInfo` interface

**Critical**: The chat API (`POST /api/message`) expects `{ content }` not `{ message }`.

## Common Tasks

### Adding a new admin panel
1. Create component in `ui/src/components/admin/NewPanel.tsx`
2. Add lazy import and route in `ui/src/App.tsx`
3. Add nav link in `ui/src/components/layout/AdminLayout.tsx`

### Fixing API mismatches
1. Test the API endpoint via curl to see actual response shape
2. Update `ui/src/api/types.ts` if types are wrong
3. Add transform in `ui/src/api/client.ts` if needed

### Deploy
```bash
cd ui && npm run build && rsync -az --delete dist/ titan:/opt/TITAN/ui/dist/
```
