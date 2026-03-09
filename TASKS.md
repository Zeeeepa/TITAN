# TITAN Development Roadmap & Task Tracker

**Last Updated:** 2026-03-09
**Current Version:** 2026.8.0

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
- OpenClaw Skill Scanner Guard integrated

### Phase 5: Competitive Dominance (v2026.5.1–5.10)
- **v2026.5.1–5.3**: 20 runtime bug fixes, 1,523 tests, 66.88% coverage
- **v2026.5.4**: Encrypted secrets vault, tamper-evident audit log, self-healing doctor, 3 providers (Venice AI, AWS Bedrock, LiteLLM), resource limits, 2,100+ tests
- **v2026.5.5**: Autopilot Mode — hands-free scheduled agent runs with cron
- **v2026.5.6**: 3 new providers (Azure OpenAI, DeepInfra, SambaNova), Skyvern MCP browser automation, docs cleanup
- **v2026.5.7**: Google Chat channel (real webhook), Autopilot dashboard panel, Cloudflare Tunnel support, 2,612 tests
- **v2026.5.8**: Ollama model guide, 147→0 ESLint warnings, `local` model alias, 2,838 tests across 67 files
- **v2026.5.9**: Port pre-check, small model tool reduction, Ollama think:false, configurable stall detector, GPU auto-detection, config get key, slash commands via API, config validation, graph JSON repair, concurrent LLM limit, +244 tests (2,856 total across 69 files)
- **v2026.5.10**: Tool fallback (provider failover hardening), Skyvern browser automation tools, CPU/GPU auto-tune

### Phase 6: Intelligence & Income (v2026.5.11–5.16)
- **v2026.5.11**: `web_read` tool (Readability + Turndown → markdown), `web_act` tool (interactive step-by-step browser with numbered elements)
- **v2026.5.12**: Kimi K2.5 provider (21st provider), memory flush before graph compaction
- **v2026.5.13**: Deliberation/scanner tests, ESLint fixes, npm publish
- **v2026.5.14**: 4 income automation skills (16 new tools): income_tracker, freelance_monitor, content_publisher, lead_scorer. 5 autopilot playbook templates.
- **v2026.5.15**: Skill enable/disable toggle in Mission Control + registry (persistent via disabled-skills.json), skill toggle API endpoint
- **v2026.5.16**: Onboarding UX improvements (pre-filled personality examples), removed personal references from codebase
- **v2026.5.17**: GitHub-hosted Skills Marketplace (12 curated skills on Djtony707/titan-skills), dynamic model dropdown (all 21 providers), marketplace API endpoints, removed stale Rust-era docs
- **v2026.5.18**: Mesh networking fully operational — router integration (mesh fallback in chat/chatStream), peer approval system (pending→approve→connect), maxPeers=5, auto-approve toggle, dynamic heartbeat, allowRemoteModels/maxRemoteTasks enforcement, CLI commands (--pending/--approve/--reject/--revoke/--auto-approve), dashboard notifications, persisted approved-peers.json

### Phase 7: Autonomy Overhaul (v2026.6.x)
- **v2026.6.0–6.6**: Tool Search (compact tool mode), Sandbox Code Execution (Docker), Deliberative Reasoning
- **v2026.6.7**: Full autonomy overhaul:
  - **Agent Reflection** — self-assessment every N rounds (confidence, completeness, next steps)
  - **Sub-Agent Spawning** — isolated agents with constrained toolsets (explorer/coder/browser/analyst templates)
  - **Orchestrator** — parallel/sequential multi-step task delegation with dependency-aware execution
  - **Goal Management** — persistent goals with subtasks, budget tracking, auto-completion
  - **Self-Initiative** — auto-chains goal subtasks after completion via autopilot
  - **Shared Browser Pool** — single Chromium instance, max 5 pages, 30-min TTL, cookie persistence
  - **Stagehand Integration** — natural language browser automation with Playwright fallback
  - **X/Twitter Posting** — OAuth 1.0a, review queue, draft/approve/post/list tools
  - **Deliberation Fix** — model-aware thinking parameter, configurable fallback chain
  - 98 new tests across 9 test files, 3,323 total tests across 94 files

### Phase 8: Catch Up & Teach (v2026.7.0)
- **v2026.6.8**: Dashboard XSS fix (data-attribute onclick), voice hardcoded IP removal (TITAN port block 48420-48423), model_switch into registry, 31 ESLint warnings resolved, voice pipeline source committed, agent team hierarchy (27 agents)
- **v2026.7.0**: Three features in parallel via agent teams:
  - **RAG/Vector Search** — SQLite FTS5 + Ollama/OpenAI embeddings, 4 tools (rag_ingest/search/list/delete), auto context injection, 20 tests
  - **Token Streaming** — SSE on `/api/message` with `Accept: text/event-stream`, WebSocket token streaming with typing cursor, backward compatible JSON, 6 tests
  - **Adaptive Teaching** — first-run wizard, progressive skill reveal, teach mode detection, user skill profiles with correction learning, contextual dashboard hints, 30 tests
  - 3,463 total tests across 101 files, 106 tools registered

### Phase 9: Bleeding Edge (v2026.8.0)
- **v2026.8.0**: Six features in parallel via agent teams:
  - **ContextEngine Plugin System** — lifecycle hooks (bootstrap/ingest/assemble/compact/afterTurn), config-driven registry, error-isolated runners, 19 tests
  - **Prometheus Metrics** — zero-dep Counter/Histogram/Gauge, GET /metrics endpoint, Telemetry dashboard panel, 19 tests
  - **Provider Expansion** — 30 OpenAI-compatible presets (13 new: HuggingFace, AI21, Cohere v2, Reka, Zhipu, 01.AI, Inflection, Novita, Replicate, Lepton, Anyscale, OctoAI, Nous)
  - **6 New Channels** — IRC, Mattermost, Lark/Feishu, Email (IMAP), LINE, Zulip (15 total)
  - **Fallback Model Chains** — auto-cascade on failure, configurable chain, dashboard indicator, 10 tests
  - **Deep Research Agent** — researcher sub-agent template, iterative search-read-synthesize, citation tracking, 23 tests
  - 3,534 total tests across 105 files, ~112 tools, 34 providers, 15 channels

### Phase 10: LiveKit Voice Integration (v2026.9.0)
- **v2026.9.0**: Replaced custom PCM-over-WebSocket voice pipeline with LiveKit WebRTC:
  - **Removed** old voice pipeline (10 files: pipeline.ts, audioUtils.ts, 4 STT providers, 4 TTS providers)
  - **LiveKit WebRTC** — production-grade voice with echo cancellation, NAT traversal, jitter buffering
  - **Token endpoint** — `POST /api/livekit/token` for secure room access (JWT, 15-min TTL)
  - **Dashboard UI** — LiveKit voice panel with connect/mute/disconnect, bar visualizer, agent state indicator
  - **Agent bridge** — `src/voice/livekitAgent.ts` bridges LiveKit rooms to TITAN's agent brain
  - **License attribution** — proper MIT credit for LiveKit, Inc. in LICENSE and package.json
  - Kept `voice.ts` skill (file-based OpenAI STT/TTS, independent of pipeline)
  - ~3,450 total tests across 102 files, ~112 tools, 34 providers, 15 channels

### Phase 11: MCP Server Mode (v2026.9.0)
- **MCP Server**: Expose all TITAN tools via Model Context Protocol
  - HTTP transport: `POST /mcp` JSON-RPC endpoint on gateway port
  - Stdio transport: launch as subprocess for MCP clients
  - `GET /api/mcp/server` status API
  - Security: respects denied/allowed tools and skill enable state
  - 15 tests

### Phase 12: Plugin SDK + Skill Scaffolding (v2026.9.1)
- **Skill Scaffolding CLI**: Generate skill project templates for third-party developers
  - `titan skills --scaffold --name <name> --format js|ts|yaml` — generates skill directory with source, SKILL.md, and test file
  - `titan create-skill <name>` — top-level alias for quick scaffolding
  - `titan skills --test <name>` — load and execute a skill with sample arguments
  - `titan mcp-server` — launch TITAN as a stdio MCP server for external clients
  - JS/TS/YAML templates with parameter schemas, exports, and example implementations
  - SKILL.md frontmatter metadata (name, version, author, category)
  - Auto-generated test files for each scaffold
  - Name sanitization (special chars → underscores)
  - 8 tests

### Phase 13: Team Mode with RBAC (v2026.9.2)
- **Team Management**: Multi-user support with role-based access control
  - 4 roles: owner > admin > operator > viewer (hierarchical)
  - Team CRUD: create, update, delete with owner-only enforcement
  - Member management: add, remove, role changes with permission checks
  - Invite system: time-limited invite codes with role assignment
  - RBAC engine: per-role permissions, tool wildcard patterns, deny-overrides-allow
  - Per-role permission overrides per team
  - Session integration: `teamId` field on Session interface
  - JSON persistence at `~/.titan/teams.json`
  - Full CLI: `titan teams --create|--delete|--info|--add-member|--invite|--join|--set-role`
  - 14 API endpoints (CRUD + members + invites + permissions)
  - 32 tests

### Phase 14: Cloud Deploy + One-Line Install (v2026.9.4)
- **One-line installer**: `curl -fsSL .../install.sh | bash` — detects OS/arch, installs Node.js via nvm if needed, `npm install -g titan-agent`, runs onboard wizard
  - Supports `TITAN_SKIP_ONBOARD=1` and `TITAN_VERSION=x.y.z` env overrides
- **Deploy buttons**: Railway, Render, Replit — one-click cloud deployment
  - `railway.json`, `render.yaml`, `.replit` configs with healthcheck, persistent disk, env var templates
- **Dockerfile optimization**: multi-stage build with Alpine runtime (smaller image), 0.0.0.0 binding, .dockerignore
- **README badges**: updated to current stats (34 providers, 112 tools, 15 channels, 3,549 tests)
- 32 deploy config tests

---

## Current State (v2026.9.4)

| Metric | Value |
|--------|-------|
| Providers | 34 (4 native + 30 OpenAI-compat) |
| Channels | 15 (Discord, Telegram, Slack, Google Chat, WhatsApp, Matrix, Signal, MS Teams, WebChat, IRC, Mattermost, Lark, Email, LINE, Zulip) |
| Built-in Skills | 39 files |
| Tools | ~112 registered |
| Tests | ~3,549 across 107 files |
| Line Coverage | ~82% |
| MCP | Client + Server (expose tools to other agents) |
| Voice | LiveKit WebRTC (replaced custom pipeline) |
| RAG/Vector Search | Yes (FTS5 + embeddings) |
| Token Streaming | Yes (SSE + WebSocket) |
| Adaptive Teaching | Yes (wizard, skill reveal, hints) |
| Plugin System | Yes (ContextEngine lifecycle hooks) |
| Metrics | Yes (Prometheus /metrics endpoint) |
| Fallback Chains | Yes (auto-cascade on model failure) |
| Deep Research | Yes (multi-step with citations) |
| Team Mode RBAC | Yes (owner/admin/operator/viewer, invites, per-role tool permissions) |
| Plugin SDK | Yes (skill scaffolding CLI for JS/TS/YAML) |
| Cloud Deploy | Yes (one-line install, Railway/Render/Replit, optimized Docker) |

---

## NOW: Stabilize & Harden What We Have

Focus on making existing features work correctly before adding new ones.

### Testing & Quality
- [x] Fix gateway-extended.test.ts (23 failing — auth mock issues)
- [x] Push coverage from 56.6% → 80%+
- [x] Integration tests for all 9 channels (mocked)
- [x] Small model performance optimization (tool reduction, think:false, stall tuning)
- [ ] E2E tests for gateway + dashboard (Playwright)
- [ ] Performance benchmarks (startup time, memory, throughput)

### Harden Existing Features
- [x] Self-Healing — `titan doctor --fix`
- [x] Tunnel support (Cloudflare Tunnel — quick + named modes)
- [x] Audit logging with signed event trail (HMAC-SHA256 chained JSONL)
- [x] Resource limits (memory, CPU, disk, subprocess caps)
- [x] Encrypted secrets store (AES-256-GCM vault with PBKDF2)
- [x] Port pre-check to prevent EADDRINUSE crashes on startup
- [x] Config validation (reject unknown fields with 400)
- [x] Concurrent LLM request limiting (503 when overloaded)
- [x] Graph entity extraction hardening (JSON repair, skip weak models)
- [x] Slash commands via REST API (not just WebSocket)
- [x] Skill enable/disable toggle (dashboard + API)
- [ ] Multi-layer sandbox (Landlock, Firejail, Bubblewrap auto-detect)

### Expand What Works
- [x] 21 providers (Venice, Bedrock, Azure, LiteLLM, DeepInfra, SambaNova, Kimi K2.5)
- [ ] More channels (IRC, Lark, Email inbound, Mattermost, iMessage)
- [ ] Vector search + RAG pipeline (SQLite FTS5, embeddings)
- [ ] Memory hygiene (auto-archive stale entities, configurable retention)
- [ ] Streaming to dashboard (real-time token delivery in WebChat)
- [ ] Code interpreter skill (sandboxed JS/Python execution)

---

## NEXT: Batch 10 — Polish & Expand

### Performance & Reliability
- [ ] Streaming response for /api/message — return tokens as they arrive
- [ ] Ollama model auto-detect — read parameter count, auto-set small model mode
- [ ] Inference timeout — configurable hard timeout for LLM calls
- [ ] Connection pooling — reuse HTTP connections to providers
- [ ] Warm model keep-alive — ping Ollama to keep model loaded in RAM

### Dashboard & UX
- [ ] Hardware info panel — CPU, RAM, GPU status in Mission Control
- [ ] Config query widget — matching CLI `titan config <key>` feature
- [ ] Mobile-responsive dashboard — CSS media queries for small screens

### New Capabilities
- [ ] Telemetry Dashboard — usage analytics, cost forecasting, performance trends
- [ ] Notion/Jira Skill — project management integration
- [ ] OAuth Hub — one-click connection to SaaS services

---

## LATER: Scale & Ecosystem

Only after the above is solid:

- [ ] Team Mode — multi-user with RBAC and shared agent pools
- [ ] Mobile App — React Native companion for iOS/Android
- [ ] Voice-First Mode — always-on voice assistant (wake word detection)
- [ ] Agent-to-Agent Protocol — standardized inter-agent communication
- [ ] Visual workflow builder (drag-and-drop recipe editor)
- [x] Self-reflection loop (agent evaluates own responses) — shipped in v2026.6.7
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
| Phase 5 | 2,856 | 69 | ~72% |
| Phase 6 | 3,171 | 81 | ~80.7% |
| Phase 7 (current) | 3,323 | 94 | ~82% |

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
'<button onclick="myFn(\''+item.id+'\')">Click</button>'
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
