# Changelog

All notable changes to TITAN are documented in this file.

---

## [2026.10.1] — 2026-03-09

### Fixed
- **Settings panel blank screen** — admin panels now have proper padding wrapper
- **Settings error handling** — shows error message with retry button instead of blank screen on API failure
- **Voice button always visible** — mic button renders in chat input (disabled when voice not configured)
- **Voice overlay modal** — clicking voice button now opens VoiceOverlay instead of hash navigation
- **Docker build** — include `tsconfig.json` and `ui/dist` in Docker image
- **ESM `__dirname`** — fixed `ReferenceError` in gateway server when serving React SPA

### Added
- **Mission Control v2 tests** — 35 comprehensive tests covering all admin panels, auth, SSE, SPA serving

---

## [2026.10.0] — 2026-03-09

### Added
- **Mission Control v2** — complete React 19 SPA replacing the monolithic HTML dashboard
  - ChatGPT-style chat interface with SSE token streaming
  - 10 admin panels: Overview, Agents, Settings, Channels, Skills, Sessions, Learning, Autopilot, Security, Logs
  - Built with Vite, Tailwind CSS 4, React Router v7, Lucide React, Motion
  - Markdown rendering with syntax highlighting (react-markdown + rehype-highlight)
- **Voice health endpoint** — `GET /api/voice/health` reports LiveKit, STT, and TTS status
- **LiveKit token endpoint on gateway** — `POST /api/livekit/token` for voice session tokens
- **Distributed setup support** — env-var based docker-compose for split-machine deployments (Pi 5 + GPU PC)
- **THIRD_PARTY_NOTICES.md** — comprehensive OSS attribution for all ~50 dependencies

### Changed
- Legacy dashboard moved to `/legacy` route
- Removed titan-voice-ui container (voice UI consolidated into Mission Control v2)
- Docker-compose restructured for multi-machine deployments

---

## [2026.9.6] — 2026-03-09

### Fixed
- **Version constant** — `TITAN_VERSION` in constants.ts was stuck at 2026.9.1 while package.json was at 2026.9.5, causing `/api/health` to report wrong version
- **Version test** — updated core.test.ts to match current version
- **README audit** — corrected all stats: 108 tools (was 112), 34 providers (was 21), 15 channels (was 9), 3,561 tests, updated roadmap, added all missing providers/channels to tables
- **ARCHITECTURE.md** — updated diagram counts, added MCP/metrics/RBAC/voice to overview

---

## [2026.9.5] — 2026-03-09

### Added
- **Visual Workflow Builder** — drag-and-drop recipe/pipeline editor in dashboard
  - Node-graph canvas visualization of workflow steps (HTML5 Canvas)
  - Step builder with prompt, tool, and awaitConfirm fields
  - Add/remove steps with live canvas update
  - YAML export/import for workflow sharing
  - 7 REST API endpoints: `GET/POST/PUT/DELETE /api/recipes`, `/api/recipes/builtin/templates`, `/api/recipes/import`
  - Workflow execution from dashboard (sends steps to agent chat)
  - 6 builtin recipe templates (code-review, standup, explain, brainstorm, debug, briefing)
  - 12 workflow tests (YAML roundtrip, store integration, parameter handling)

### Changed
- Recipe store now exports `importRecipeYaml` and `exportRecipeYaml` for YAML serialization
- Dashboard nav updated with Workflows panel

---

## [2026.9.4] — 2026-03-09

### Added
- **One-Line Install** — `curl -fsSL .../install.sh | bash` with OS detection, Node.js auto-install via nvm
- **Cloud Deploy Configs** — Railway, Render, Replit one-click deployment with healthchecks and persistent storage
- **Deploy Buttons** — Railway/Render/Replit buttons in README header

### Changed
- **Dockerfile** — switched to Alpine runtime (smaller image), added 0.0.0.0 binding, .dockerignore
- **README badges** — updated to current stats (34 providers, 112 tools, 15 channels, 3,549 tests)
- Reorganized Quick Start with install script, Docker, and manual install sections

---

## [2026.9.2] — 2026-03-09

### Added
- **Team Mode with RBAC** — multi-user support with role-based access control
  - 4 hierarchical roles: owner > admin > operator > viewer
  - Team CRUD, member management, invite codes with expiry
  - Per-role tool permissions with wildcard pattern matching (deny overrides allow)
  - 14 API endpoints: `/api/teams/*` for full team lifecycle
  - CLI: `titan teams --create|--delete|--info|--add-member|--invite|--join|--set-role`
  - Session `teamId` field for RBAC-scoped sessions
  - JSON persistence at `~/.titan/teams.json`
  - 32 tests

---

## [2026.9.1] — 2026-03-09

### Added
- **Plugin SDK + Skill Scaffolding** — CLI templates for rapid third-party skill development
  - `titan skills --scaffold --name <name> --format js|ts|yaml` generates full project structure
  - `titan create-skill <name>` alias command for quick scaffolding
  - SKILL.md frontmatter metadata per skill (name, version, author, category)
  - `titan skills --test <name>` to load and execute skills with sample arguments
  - `titan mcp-server` to launch stdio MCP transport for external clients
  - JS/TS/YAML templates with parameter schemas, exports, and auto-generated test files

### Fixed
- Fixed briefing test mock hoisting issue (vi.hoisted for shared fs mock references)
- Fixed scaffold test mock hoisting issue (vi.hoisted for testHome variable)

---

## [2026.9.0] — 2026-03-09

### Added
- **MCP Server Mode** — expose TITAN's ~112 tools via Model Context Protocol (JSON-RPC 2.0)
  - HTTP transport: `POST /mcp` endpoint on gateway port
  - Stdio transport: launch TITAN as subprocess for MCP clients (Claude Code, Cursor, etc.)
  - `GET /api/mcp/server` status endpoint
  - Respects security policy (denied/allowed tools, skill enable state)
  - 15 tests
- **LiveKit Voice Integration** — replaced custom PCM-over-WebSocket voice pipeline with LiveKit WebRTC
  - `POST /api/livekit/token` for secure room access (JWT, 15-min TTL)
  - Dashboard voice panel with connect/mute/disconnect, bar visualizer, agent state
  - Agent bridge (`src/voice/livekitAgent.ts`) routes STT → TITAN brain → TTS
  - LiveKit, Inc. MIT attribution in LICENSE and package.json

### Removed
- Old voice pipeline: 10 source files (pipeline.ts, audioUtils.ts, 4 STT/4 TTS providers)
- 4 voice test files (replaced with voice-livekit.test.ts)

### Changed
- `VoiceConfigSchema` now uses LiveKit provider config (url, apiKey, apiSecret, agentName)
- Updated README, ARCHITECTURE, TASKS docs for LiveKit voice and MCP server

---

## [2026.8.0] — 2026-03-09

### Added
- **ContextEngine Plugin System** — lifecycle hooks (bootstrap/ingest/assemble/compact/afterTurn), config-driven registry
- **Prometheus Metrics** — Counter/Histogram/Gauge, `GET /metrics` endpoint, Telemetry dashboard panel
- **30 OpenAI-compatible Provider Presets** — HuggingFace, AI21, Cohere v2, Reka, Zhipu, 01.AI, and more (34 total)
- **6 New Channels** — IRC, Mattermost, Lark/Feishu, Email (IMAP), LINE, Zulip (15 total)
- **Fallback Model Chains** — auto-cascade on failure with configurable chain
- **Deep Research Agent** — researcher sub-agent template with iterative search-read-synthesize and citation tracking

---

## [2026.7.0] — 2026-03-09

### Added
- **RAG/Vector Search** — SQLite FTS5 + Ollama/OpenAI embeddings, 4 tools (rag_ingest/search/list/delete)
- **Token Streaming** — SSE (`Accept: text/event-stream`) + WebSocket live token streaming to dashboard
- **Adaptive Teaching** — first-run wizard, progressive skill reveal, teach mode, user skill profiles
- **Memory Importance Scoring** — LLM-rated importance (1-10), smart context eviction

---

## [2026.6.7] — 2026-03-08

### Added
- **Agent Reflection** — self-assessment every N rounds during tool loops (confidence, completeness, next steps)
- **Sub-Agent Spawning** — isolated agents with constrained toolsets (explorer, coder, browser, analyst templates)
- **Orchestrator** — parallel/sequential multi-step task delegation with dependency-aware execution
- **Goal Management** — persistent goals with subtasks, budget tracking, auto-completion (4 tools)
- **Self-Initiative** — auto-chains goal subtasks after completion via autopilot loop
- **Shared Browser Pool** — single Chromium instance, max 5 pages, 30-min TTL, cookie persistence, anti-detection
- **Stagehand Integration** — natural language browser automation with Playwright fallback (act/extract/observe)
- **X/Twitter Posting** — OAuth 1.0a signature, review queue, draft/approve/post/list (4 tools)
- 98 new tests across 9 test files (reflection, subAgent, orchestrator, goals, initiative, goals-skill, x-poster, browser-pool, stagehand)

### Changed
- Browser skills (`web_browser.ts`, `web_browse_llm.ts`) now use shared browser pool instead of spawning individual Chromium processes
- Deliberation uses configured model (or fast alias) instead of hardcoded `o3-mini` fallback
- Deliberation thinking parameter is now conditional on model support (only enabled for o-series and Claude models)
- Initiative wired into autopilot — `checkInitiative()` called after successful goal subtask completion

### Fixed
- Deliberation fallback chain: no longer fails silently when o3-mini unavailable and fallback model doesn't support thinking
- Browser memory leak: shared pool replaces duplicate Chromium processes

### Stats
- **95 tools** (was 86)
- **33 skill files** (was 31)
- **3,323 tests** across 94 files (was 3,225 across 85 files)
- **21 providers**, **9 channels**

---

## [2026.6.0–6.6] — 2026-03-07

### Added
- **Tool Search** — compact tool mode for efficient tool discovery
- **Sandbox Code Execution** — Docker-based code execution with HTTP tool bridge
- **Deliberative Reasoning** — multi-stage reasoning (analyze, plan, approve, execute)

---

## [2026.5.18] — 2026-03-07

### Added
- Mesh networking fully operational — router integration, peer approval system, up to 5 peers
- Dashboard Mesh tab for peer management (approve/reject/revoke)
- Mesh API endpoints, CLI commands, persisted approved-peers.json

---

## [2026.5.17] — 2026-03-06

### Added
- GitHub-hosted Skills Marketplace (12 curated skills)
- Dynamic model dropdown (all 21 providers)
- Marketplace API endpoints

---

## [2026.5.14–5.16] — 2026-03-05

### Added
- 4 income automation skills (16 tools): income_tracker, freelance_monitor, content_publisher, lead_scorer
- Skill enable/disable toggle (dashboard + API)
- Onboarding UX improvements

---

## [2026.5.9–5.10] — 2026-03-04

### Added
- Port pre-check, small model tool reduction, GPU auto-detection
- Config validation, slash commands via API, concurrent LLM limit
- Tool fallback (provider failover hardening)

---

## [2026.5.4–5.8] — 2026-03-03

### Added
- Encrypted secrets vault, tamper-evident audit log, self-healing doctor
- Autopilot Mode — hands-free scheduled agent runs
- 6 new providers (Venice AI, AWS Bedrock, LiteLLM, Azure OpenAI, DeepInfra, SambaNova)
- Google Chat channel, Cloudflare Tunnel support
- Skyvern MCP browser automation
