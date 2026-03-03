# TITAN Development Roadmap & Task Tracker

**Last Updated:** 2026-03-02
**Current Version:** 2026.5.0
**Author:** Tony Elliott (Djtony707)

---

## Completed Phases (Summary)

### Phase 1: Critical Bug Fixes & Dead Code Wiring
21 fixes — wired loop detection, stall detector, cost optimizer, context manager, response cache, monitor, parallel tools, learning engine, relationship memory, briefings, autonomy gates, shield, session management, dashboard WebSocket/JS, generator, multi-agent, config validation.

### Phase 2: Production Grade
- Universal model router (aliases, live discovery, CLI + API)
- Retry logic with exponential backoff across all providers
- Gateway hardening (rate limiting, CORS, security headers, token TTL)
- Streaming for all 5 provider types (SSE/NDJSON)
- 14 LLM providers (4 native + 10 via OpenAI-compat), 50+ models
- Mesh networking (mDNS + Tailscale, WebSocket transport, distributed registry)
- Temporal graph memory (auto-recording, context injection, entity extraction)
- Easy skill creation (YAML/JS drop-in, CLI generator, hot-loading, sandbox)
- 99 tests across 10 files

### Phase 2.5: OpenClaw-Inspired Features (v2026.4.31)
- Per-session model & thinking overrides
- Slash command system (8 commands: /model, /think, /usage, /compact, /verbose, /reset, /new, /status)
- Model allowlisting with wildcard support
- Auth profile rotation with failover
- Provider ID normalization (grok→xai, local→ollama, etc.)
- Force context compaction

### Phase 3: Compete with the Best (v2026.4.33)
- Premium dashboard overhaul (glassmorphism, dark/light, sparklines)
- GitHub skill (5 tools), email skill (4 tools), computer use (6 tools)
- Morning briefing recipe, proactive cron enhancement
- WhatsApp, Matrix, Signal, MS Teams channels (9 total)
- Image generation, PDF parsing, calendar, data analysis, smart home skills
- Persistent webhooks, real-time dashboard charts, API docs (OpenAPI 3.0)

### Phase 4.5: Code Quality & Stability (v2026.5.0)
- 0 ESLint errors, 0 TypeScript errors, clean build
- 1,160+ tests across 37 files, 56.6% line coverage (55% threshold)
- OpenClaw Skill Scanner Guard integrated (credit: Jason Allen O'Neal)

---

## NOW: Stabilize & Harden What We Have

Focus on making existing features work correctly before adding new ones.

### Testing & Quality
- [ ] Fix gateway-extended.test.ts (23 failing — auth mock issues)
- [ ] Push coverage from 56.6% → 65%+
- [ ] Integration tests for all 9 channels (mocked)
- [ ] E2E tests for gateway + dashboard
- [ ] Performance benchmarks (startup time, memory, throughput)

### Harden Existing Features
- [ ] **Self-Healing** — Auto-detect and fix configuration/dependency issues
- [ ] **Telemetry Dashboard** — Usage analytics, cost forecasting, performance trends
- [ ] **Multi-modal Pipelines** — Image → text → code → execution chains
- [ ] **Notion/Jira Skill** — Project management integration (deferred from Phase 3)
- [ ] **OAuth Hub** — One-click connection to SaaS services (Google, GitHub, Slack, Microsoft)
- [ ] **API Provider Directory** — Curated catalog of providers in onboarding/dashboard. Based on [openclaw-api-list](https://github.com/cporter202/openclaw-api-list).
- [ ] Tunnel support (Cloudflare, Tailscale, ngrok)
- [ ] Multi-layer sandbox (Landlock, Firejail, Bubblewrap auto-detect)
- [ ] Audit logging with signed event trail
- [ ] Resource limits (memory, CPU, disk, subprocess caps)
- [ ] Encrypted secrets store (ChaCha20-Poly1305 or AES-256-GCM)

### Expand What Works
- [ ] Add providers toward 22+ (Venice, Bedrock, Azure, LiteLLM, DeepInfra, SambaNova)
- [ ] Add channels toward 18+ (IRC, Lark, OneBot/QQ, Line, DingTalk, Email inbound, Nostr, Mattermost, iMessage)
- [ ] Vector search + RAG pipeline (SQLite, FTS5, embeddings)
- [ ] Memory hygiene (auto-archive stale, configurable retention)
- [ ] Streaming to dashboard (real-time token delivery)
- [ ] Code interpreter skill (sandboxed JS/Python execution)

---

## LATER: Scale & Ecosystem

Only after the above is solid:

- [ ] Plugin Marketplace — Curated, security-audited skill marketplace
- [ ] Team Mode — Multi-user with RBAC and shared agent pools
- [ ] Mobile App — React Native companion app for iOS/Android
- [ ] Voice-First Mode — Always-on voice assistant (wake word detection)
- [ ] Agent-to-Agent Protocol — Standardized inter-agent communication
- [ ] Visual workflow builder (drag-and-drop recipe editor)
- [ ] Self-reflection loop (agent evaluates own responses)
- [ ] Evaluation framework (benchmark agent quality)
- [ ] WASM runtime / edge deployment
- [ ] Hardware peripherals (Arduino, RPi GPIO)
- [ ] Plugin SDK for third-party developers
- [ ] PWA version of Mission Control

---

## Test Coverage Progress

| Phase | Tests | Files | Line Coverage |
|-------|-------|-------|--------------|
| Phase 2 | 99 | 10 | ~27% |
| Phase 4.5 | 1,160+ | 37 | 56.6% |
| Phase 5 target | 3,000+ | 50+ | 80%+ |

---

## Architecture Reference

### Version Strings
Never hardcode. Always import `TITAN_VERSION` from `src/utils/constants.ts`.

### Dashboard.ts Golden Rule
**NEVER use inline onclick with string IDs.** Always use `data-*` attributes:
```javascript
// CORRECT:
'<button data-id="' + item.id + '" onclick="myFn(this.dataset.id)">Click</button>'
// WRONG (breaks after esbuild):
'<button onclick="myFn(\\''+item.id+'\\')">Click</button>'
```

### Provider Pattern
Use `OpenAICompatProvider` for any OpenAI-compatible API. Only create custom provider classes for unique APIs (Anthropic Messages, Google Gemini).

### Skill Pattern
```typescript
{ name: string; description: string; parameters: { type: 'object', properties: {...}, required?: string[] }; execute: (args: Record<string, unknown>) => Promise<string>; }
```

### Channel Pattern
Extend `ChannelAdapter` from `src/channels/base.ts`:
```typescript
abstract class ChannelAdapter extends EventEmitter {
  abstract name: string;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: OutboundMessage): Promise<void>;
  abstract getStatus(): ChannelStatus;
}
```
