# TITAN Development Roadmap & Task Tracker

**Last Updated:** 2026-03-13
**Current Version:** 2026.10.22

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

### Phase 15: Mission Control v2 (v2026.10.0)
- **Mission Control v2**: Complete React 19 SPA replacing monolithic HTML dashboard
  - Vite + Tailwind CSS 4 + React Router v7
  - 17 admin panels (Settings, Learning, Autopilot, Security, Workflows, MemoryGraph, Integrations, etc.)
  - ChatGPT-style chat interface with session management
  - Voice health endpoint and voice button integration
  - API client with server response transformation
  - Distributed setup support

### Phase 16: Settings & Auth Hardening (v2026.10.1–10.3)
- Settings panel padding fixes, voice button
- Docker/ESM compatibility fixes
- Auth lockout fix (unconfigured token auth no longer blocks API)
- Settings panel data binding (models API shape, nested config keys)

### Phase 17: Onboarding & Discovery (v2026.10.4)
- Onboarding wizard with pre-filled personality examples
- `system_info` tool for hardware/environment detection
- Tool discovery fix, new admin panels

### Phase 18: Full Admin Suite (v2026.10.11)
- Integrations panel (12 provider API keys + Google OAuth)
- Workflows panel (Goals, Cron, Recipes, Autopilot)
- Autonomous persona and research pipeline
- Autoresearch, TopFacts plugin
- Checkpoint/resume system
- 117 tools, 82 skills, 17 admin panels

### Phase 19: Browser Automation & CAPTCHA (v2026.10.17)
- CapSolver CAPTCHA integration
- Direct form-fill endpoint (`POST /api/browser/form-fill`)
- Deferred button clicks (`postClicks`)
- React-compatible form automation
- `POST /api/browser/solve-captcha`

### Phase 20: Self-Improvement & Fine-Tuning (v2026.10.20)
- Autonomous self-improvement system (LLM-as-judge eval, autoresearch experiments)
- Local model LoRA fine-tuning pipeline (unsloth → GGUF → Ollama)
- Self-Improvement Mission Control panel
- Autopilot self-improve mode
- 8 new tools

### Phase 21: Dual Training Pipelines (v2026.10.21)
- Dual training pipelines (Tool Router + Main Agent)
- Training type selector UI with customizable hyperparameters
- Agent training data generator (530+ examples)
- Ollama context management fix
- New API endpoints (generate-data, deploy, type-filtered results)

### Phase 22: Voice System Hardening (v2026.10.22)
- 24 bug fixes across voice, gateway, and agent systems
- VoiceOverlay rewrite: stale closure fixes (refs for phase/mute), AbortController cleanup, session continuity, emotion tag stripping, error feedback, mute mic monitor integration
- FluidOrb canvas rewrite: single animation loop, props in refs, no 60fps teardown
- TranscriptView: stable React keys via unique IDs
- Gateway SSE leak fix: `req.on('close')` + `clientDisconnected` flag
- TTS health probe fix: POST to actual `/v1/audio/speech` endpoint
- Ollama context window: `num_ctx` 8192 → 16384
- Agent: removed duplicate `addEpisode`, strengthened voice mode prompt
- SettingsPanel: fixed VoiceHealth interface
- useConfig: conditional voice health check
- 3,839 tests across 123 files, ~149 tools, 91 skills

---

## Current State (v2026.10.22)

| Metric | Value |
|--------|-------|
| Providers | 34 (4 native + 30 OpenAI-compat) |
| Channels | 15 |
| Built-in Skills | 91 loaded |
| Tools | ~149 registered |
| Tests | ~3,839 across 123 files |
| Default Model | `anthropic/claude-sonnet-4-20250514` |
| MCP | Client + Server |
| Voice | LiveKit WebRTC + Orpheus TTS |
| RAG/Vector Search | Yes (FTS5 + embeddings) |
| Token Streaming | Yes (SSE + WebSocket) |
| Adaptive Teaching | Yes |
| Plugin System | Yes (ContextEngine lifecycle hooks) |
| Metrics | Yes (Prometheus /metrics endpoint) |
| Fallback Chains | Yes (auto-cascade on model failure) |
| Deep Research | Yes (multi-step with citations) |
| Team Mode RBAC | Yes |
| Plugin SDK | Yes (skill scaffolding CLI) |
| Cloud Deploy | Yes (one-line install, Railway/Render/Replit) |
| Visual Workflows | Yes (drag-and-drop builder) |
| Self-Improvement | Yes (LLM-as-judge, LoRA fine-tuning) |
| Training Pipelines | Yes (dual: Tool Router + Main Agent) |
| Browser Automation | Yes (Playwright + CapSolver CAPTCHA) |
| Mission Control | v2 React 19 SPA with 17 admin panels |

---

## NOW: Production Autonomy & Reliability

### Infrastructure
- [ ] systemd service for crash recovery (auto-restart)
- [ ] Internal health monitor (Ollama, memory, TTS watchdog)
- [ ] Log rotation (prevent disk fill)
- [ ] fetchWithRetry timeout (prevent gateway freeze)
- [x] SSE client disconnect handling (v2026.10.22)

### Autonomy Activation
- [ ] Enable autopilot with safe defaults (goals mode, supervised)
- [ ] Configure fallback chain (Ollama models)
- [ ] Create initial self-maintenance goals
- [ ] AUTOPILOT.md checklist for standing instructions

### Dashboard & UX
- [ ] E2E tests for gateway + dashboard (Playwright)
- [ ] Performance benchmarks (startup time, memory, throughput)
- [ ] Hardware info panel in Mission Control
- [ ] Mobile-responsive dashboard

---

## Test Coverage Progress

| Phase | Tests | Files | Line Coverage |
|-------|-------|-------|--------------|
| Phase 2 | 99 | 10 | ~27% |
| Phase 4.5 | 1,160+ | 37 | 56.6% |
| Phase 5 | 2,856 | 69 | ~72% |
| Phase 6 | 3,171 | 81 | ~80.7% |
| Phase 7 | 3,323 | 94 | ~82% |
| Phase 9 | 3,561 | 107 | ~82% |
| Phase 22 (current) | 3,839 | 123 | ~82% |

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
