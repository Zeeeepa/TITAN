# TITAN Development Roadmap & Task Tracker

**Last Updated:** 2026-03-06
**Current Version:** 2026.5.13
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

### Phase 5: Competitive Dominance (v2026.5.1–5.8)
- **v2026.5.1–5.3**: 20 runtime bug fixes, 1,523 tests, 66.88% coverage
- **v2026.5.4**: Encrypted secrets vault, tamper-evident audit log, self-healing doctor, 3 providers (Venice AI, AWS Bedrock, LiteLLM), resource limits, 2,100+ tests
- **v2026.5.5**: Autopilot Mode — hands-free scheduled agent runs with cron
- **v2026.5.6**: 3 new providers (Azure OpenAI, DeepInfra, SambaNova), Skyvern MCP browser automation, docs cleanup
- **v2026.5.7**: Google Chat channel (real webhook), Autopilot dashboard panel, Cloudflare Tunnel support, 2,612 tests
- **v2026.5.8**: Ollama model guide, 147→0 ESLint warnings, `local` model alias, 2,838 tests across 67 files
- **v2026.5.9**: Bug fixes + local model performance — port pre-check, small model tool reduction, Ollama think:false, configurable stall detector, GPU auto-detection, config get key, slash commands via API, config validation, graph JSON repair, concurrent LLM limit, +244 tests (2,856 total across 69 files)
- **v2026.5.10**: Tool fallback (provider failover hardening), Skyvern browser automation tools, CPU/GPU auto-tune (hardware detection)

---

## NOW: Stabilize & Harden What We Have

Focus on making existing features work correctly before adding new ones.

### Testing & Quality
- [x] Fix gateway-extended.test.ts (23 failing — auth mock issues)
- [x] Push coverage from 56.6% → 65%+
- [x] Integration tests for all 9 channels (mocked)
- [ ] E2E tests for gateway + dashboard
- [ ] Performance benchmarks (startup time, memory, throughput)
- [x] Small model performance optimization (tool reduction, think:false, stall tuning)

### Harden Existing Features
- [x] **Self-Healing** — Auto-detect and fix configuration/dependency issues (`titan doctor --fix`)
- [ ] **Telemetry Dashboard** — Usage analytics, cost forecasting, performance trends
- [ ] **Multi-modal Pipelines** — Image → text → code → execution chains
- [ ] **Notion/Jira Skill** — Project management integration (deferred from Phase 3)
- [ ] **OAuth Hub** — One-click connection to SaaS services (Google, GitHub, Slack, Microsoft)
- [ ] **API Provider Directory** — Curated catalog of providers in onboarding/dashboard. Based on [openclaw-api-list](https://github.com/cporter202/openclaw-api-list).
- [x] Tunnel support (Cloudflare Tunnel — quick + named modes)
- [ ] Multi-layer sandbox (Landlock, Firejail, Bubblewrap auto-detect)
- [x] Audit logging with signed event trail (HMAC-SHA256 chained JSONL)
- [x] Resource limits (memory, CPU, disk, subprocess caps)
- [x] Encrypted secrets store (AES-256-GCM vault with PBKDF2)
- [x] Port pre-check to prevent EADDRINUSE crashes on startup
- [x] Config validation (reject unknown fields with 400)
- [x] Concurrent LLM request limiting (503 when overloaded)
- [x] Graph entity extraction hardening (JSON repair, skip weak models)
- [x] Slash commands via REST API (not just WebSocket)

### Expand What Works
- [x] Add providers to 20 (Venice, Bedrock, Azure, LiteLLM, DeepInfra, SambaNova)
- [ ] Add channels toward 18+ (IRC, Lark, OneBot/QQ, Line, DingTalk, Email inbound, Nostr, Mattermost, iMessage)
- [ ] Vector search + RAG pipeline (SQLite, FTS5, embeddings)
- [ ] Memory hygiene (auto-archive stale, configurable retention)
- [ ] Streaming to dashboard (real-time token delivery)
- [ ] Code interpreter skill (sandboxed JS/Python execution)

---

## NEXT: Batch 10 — Polish & Expand

Focus areas for the next release, informed by real-world testing on CPU-only hardware.

### Performance & Reliability
- [ ] **Streaming response for /api/message** — Return tokens as they arrive, not all-at-once after full inference
- [ ] **Ollama model auto-detect** — Read parameter count from Ollama API, auto-set small model mode
- [ ] **Inference timeout** — Configurable hard timeout for LLM calls (not just stall detection)
- [ ] **Connection pooling** — Reuse HTTP connections to Ollama/providers instead of new socket per request
- [ ] **Warm model keep-alive** — Ping Ollama to keep the model loaded in RAM between requests

### Dashboard & UX
- [ ] **Streaming to dashboard** — Real-time token delivery in WebChat panel via SSE/WebSocket
- [ ] **Hardware info panel** — Show CPU, RAM, GPU status, model load state in Mission Control
- [ ] **Config get in dashboard** — Add a "Query Config" widget matching the CLI `titan config <key>` feature
- [ ] **Mobile-responsive dashboard** — CSS fixes for small screens

### Testing & Quality
- [ ] **E2E tests** — Gateway + dashboard integration tests (Playwright or similar)
- [ ] **Performance benchmarks** — Startup time, memory footprint, requests/sec, inference latency
- [ ] **Push coverage to 75%+** — Target the untested files (autopilot, tunnel, planner)

### New Capabilities
- [ ] **Vector search + RAG pipeline** — SQLite FTS5 + embeddings for semantic memory search
- [ ] **Code interpreter skill** — Sandboxed JavaScript/Python execution for data analysis
- [ ] **Memory hygiene** — Auto-archive stale graph entities, configurable retention policy
- [ ] **IRC channel adapter** — Lightweight channel for developer communities

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
| Phase 5 (current) | 3,064+ | 76 | ~79% |
| Phase 5 target | 3,500+ | 75+ | 80%+ |

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
