---
name: titan-api-dev
description: TITAN API endpoint development helper. Understands the Express gateway, auth middleware, rate limiting, and API patterns.
user_invocable: true
---

# TITAN API Development

Context and workflow for developing gateway API endpoints.

## Gateway Architecture

- **File**: `src/gateway/server.ts` (main Express server)
- **Framework**: Express 4
- **Auth**: Token-based, bypassed when no token configured
- **Rate limiting**: `rateLimit(windowMs, maxRequests)` helper
- **SSE streaming**: `Accept: text/event-stream` header triggers SSE mode
- **Static serving**: React SPA from `ui/dist/`, legacy dashboard from `public/`

## Adding an Endpoint

1. Open `src/gateway/server.ts`
2. Add route in the appropriate section (look for existing groups like `// ---- Chat ----`, `// ---- Config ----`)
3. Follow existing patterns:

```typescript
app.get('/api/new-endpoint', rateLimit(60000, 30), async (req, res) => {
  try {
    const data = await someFunction();
    res.json(data);
  } catch (err) {
    log.error('Failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

4. If the endpoint needs a UI consumer, add to `ui/src/api/client.ts`:
```typescript
export async function getNewData(): Promise<NewType> {
  return request('/api/new-endpoint');
}
```

5. Add types to `ui/src/api/types.ts` if needed

## Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/message` | Chat (body: `{content}`, SSE with `Accept: text/event-stream`) |
| GET | `/api/config` | Full config (nested: `agent.model`, `gateway.auth`) |
| POST | `/api/config` | Update config |
| GET | `/api/health` | Health check |
| GET | `/api/stats` | System stats |
| GET | `/api/models` | `{provider: [ids]}` object |
| POST | `/api/model/switch` | Switch active model |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id/messages` | Session messages |
| GET | `/api/voice/health` | Voice subsystem status |
| GET | `/api/graphiti` | Memory graph data |

## Testing Endpoints

```bash
# From local machine, targeting Titan PC
curl -s http://192.168.1.11:48420/api/<endpoint> | python3 -m json.tool
```

## Deployment

After changing gateway code:
```bash
npm run build  # Compiles TypeScript to dist/
rsync -az dist/ titan:/opt/TITAN/dist/
ssh titan "pkill -f 'node dist/cli/index.js gateway'; cd /opt/TITAN && nohup node dist/cli/index.js gateway > /tmp/titan-gateway.log 2>&1 &"
```
