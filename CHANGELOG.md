# Changelog

All notable changes to TITAN are documented in this file.

---

## [2026.10.22] — 2026-03-14

### Fixed
- **Voice session continuity** — Voice conversations now track `sessionId` across utterances for multi-turn memory
- **Voice recognition stale closure** — `recognition.onend` now uses refs instead of stale state closures, fixing recognition silently stopping after first TTS response
- **Audio memory leaks** — All `Audio` elements properly cleaned up (`src = ''`, object URLs revoked, refs nullified)
- **Voice error feedback** — Visible red error indicators for "Connection error", "TTS unavailable", "Request timed out"
- **Voice timeouts** — 45s timeout on TITAN API, 30s on TTS calls via `AbortController`
- **Voice interruption** — Speaking while TITAN talks now interrupts audio and processes new input
- **Emotion tags in transcript** — Orpheus tags (`<laugh>`, `<sigh>`, etc.) stripped from display, kept for TTS
- **Markdown in voice responses** — Code blocks, bold, italic, headings, bullets stripped client-side before TTS
- **FluidOrb animation loop** — Draw callback no longer recreates 60x/sec; uses refs for props, single `useEffect`
- **Canvas resize thrashing** — Canvas dimensions only set when they actually change
- **TranscriptView keys** — Stable unique IDs instead of array index
- **SSE client-disconnect leak** — `activeLlmRequests` counter no longer leaks when browser drops SSE connection
- **Duplicate graph episodes** — Removed duplicate `addEpisode` call that wrote every user message to the knowledge graph twice
- **Provider field in `/api/config`** — Now correctly derived from model string instead of hardcoded `'openai'`
- **SettingsPanel VoiceHealth type** — Updated from stale `whisper`/`kokoro` field names to `stt`/`tts`
- **TTS health probe** — Voice health endpoint now probes actual TTS endpoint (`/v1/audio/speech`) instead of root URL
- **Voice health check delay** — No longer fires on every page load when voice is disabled (was adding 3s timeout)
- **Ollama context window** — `num_ctx` increased from 8192 to 16384 for local models (better for devstral on RTX 5090)
- **TTS text truncation** — Client caps at 300 chars, server at 500 chars to prevent long TTS hangs
- **Voice mode prompt** — Strengthened to 50 word max, explicit "ABSOLUTELY NO" formatting rules
- **In-flight fetch abort** — Closing voice overlay now aborts pending API/TTS requests
- **Mute stops mic stream** — Browser microphone indicator now correctly turns off when muted
- **Voice config tests** — Updated expected default from `af_heart` to `tara`

---

## [2026.10.21] — 2026-03-13

### Added
- **Dual Training Pipelines** — Two model training modes selectable from Mission Control's Self-Improve panel:
  - **Tool Router** (`titan-qwen`) — Single-turn instruction/output pairs for fast tool selection
  - **Main Agent** (`titan-agent`) — Multi-turn ChatML conversations with OpenAI function calling format (530+ examples covering tool calls, direct answers, error recovery, multi-step chains, identity, code generation, refusal/boundaries)
- **Training Type Selector UI** — Side-by-side cards in Self-Improve panel with model name, score, example count, and role description
- **Customizable Training Hyperparameters** — Collapsible config panel with sliders for base model, LoRA rank (8–128), learning rate (1e-5–1e-3), epochs (1–10), time budget (5–120 min), max sequence length (512–8192)
- **Training Data Generator** — `generate_agent_data.py` creates 530+ multi-turn training examples using 17 real TITAN tool schemas in OpenAI function calling format
- **Agent Training Pipeline** — `train_agent.py` with higher LoRA rank (32), lower learning rate (1e-4), 2048 max seq length, and 9 agent-specific eval cases
- **Self-Improve Action Buttons** — Generate Training Data, Start Training, Deploy Best Model, Run Benchmark — all callable from the UI per training type
- **Separate Experiment History** — Tool Router and Main Agent results displayed in independent tables with distinct color coding
- **API Endpoints** — `POST /api/autoresearch/generate-data`, `POST /api/autoresearch/deploy`, type-filtered `GET /api/autoresearch/results?type=agent|tool_router`

### Fixed
- **Ollama context over-allocation** — Provider was requesting `num_ctx: 65536` for all local models, causing memory spill to CPU and 4-minute response times. Now defaults to `num_ctx: 8192`
- **Deploy script context size** — `deploy.py` Modelfile now uses `num_ctx 8192` instead of `num_ctx 65536`

### Changed
- `deploy.py` supports `--type agent|router` flag for deploying either training pipeline's output
- `TrainingType` and `TrainingConfig` types added to `ui/src/api/types.ts`

---

## [2026.10.20] — 2026-03-13

### Added
- **Autonomous Self-Improvement System** — TITAN now experiments on its own prompts, tool selection, response quality, and error recovery. Uses LLM-as-judge evaluation against benchmark test suites. Proposes changes, evaluates, keeps improvements, discards regressions. Inspired by Karpathy's autoresearch pattern.
  - `self_improve_start` — Launch an improvement session targeting a specific area
  - `self_improve_status` — Check current session progress
  - `self_improve_apply` — Apply successful experiment results to live config
  - `self_improve_history` — View history of all improvement sessions and outcomes
- **Local Model Training Pipeline** — LoRA fine-tuning on local GPU via unsloth, with GGUF conversion and Ollama deployment
  - `train_prepare` — Extract high-quality instruction/response pairs from session history, scored by tool success rates
  - `train_start` — Launch LoRA fine-tuning as background process (budget-limited)
  - `train_status` — Monitor training progress (loss, epoch, ETA)
  - `train_deploy` — Convert to GGUF, import to Ollama as `titan-custom`, optionally switch active model
- **Self-Improvement Config** — `selfImprove` section: `runsPerDay` (1-12), `schedule` (cron array), `budgetMinutes` (5-120), `maxDailyBudgetMinutes` safety cap, `areas` toggle, `autoApply`, `pauseOnWeekends`, `notifyOnSuccess`
- **Training Config** — `training` section: `enabled`, `dataDir`, `budgetMinutes`, `method` (lora/qlora/full), `baseModel`, `autoDeploy`
- **Autopilot Self-Improve Mode** — `autopilot.mode: "self-improve"` iterates configured areas with budget enforcement
- **Mission Control Self-Improvement Panel** — Stats cards, session history, training runs, schedule settings (runs/day slider, cron presets, budget sliders, area toggles), manual trigger buttons
- **Self-Improve API Endpoints** — `GET /api/self-improve/history`, `GET /api/self-improve/config`, `GET /api/training/runs`

---

## [2026.10.19] — 2026-03-13

### Added
- **Slack Skill** — 7 new tools (`slack_post`, `slack_read`, `slack_search`, `slack_react`, `slack_thread_reply`, `slack_channels`, `slack_review`) for proactive Slack engagement with human review queue. Separate from channel adapter — uses `@slack/web-api` for bot-initiated messaging
- **Interaction Tracker** — 3 tools (`interaction_log`, `interaction_stats`, `interaction_search`) for tracking community interactions across platforms (X, GitHub, Discord, Slack, forums). JSONL append-only storage, 50/week compliance warnings, daily trend charts
- **Feedback Tracker** — 3 tools (`feedback_submit`, `feedback_list`, `feedback_update`) for structured product feedback with severity/category classification and keyword-based duplicate detection (>50% word overlap)
- **Growth Experiments** — 3 tools (`experiment_create`, `experiment_update`, `experiment_list`) for hypothesis-driven growth experiments with result/outcome/learnings tracking
- **Content Calendar** — 3 tools (`calendar_add`, `calendar_view`, `calendar_update`) for content publishing pipeline with week-grouped views and 2/week compliance indicators
- **Weekly Report Generator** — 3 tools (`report_generate`, `report_deliver`, `report_history`) aggregating metrics from all trackers into structured async check-in reports with Slack delivery
- **RevenueCat Knowledge Base** — 2 tools (`rc_ingest`, `rc_search`) for RAG-style ingestion and keyword-scored retrieval of RevenueCat documentation
- **Slack Config Schema** — New `slack` section in config: `enabled`, `botToken`, `defaultChannel`, `reviewRequired`
- 130 new tests across 7 test files (total: 3,839 tests, 123 files)

---

## [2026.10.18] — 2026-03-13

### Added
- **Tool Retry with Error Classification** — Automatic retry for transient, timeout, and rate-limit errors with exponential backoff (1s/2s/4s). Permanent errors fail immediately. Per-tool timeout overrides (browser ops 60s, code exec 120s, web search 45s)
- **Dynamic Execution Budget** — Round limits scale with task complexity: simple (10), medium (15), complex (25). Autonomous mode gets 1.5x multiplier. Graceful degradation injects wrap-up prompt 2 rounds before limit
- **Auto-Deliberation** — In autonomous mode, complex task detection auto-enables deliberative reasoning without requiring `/plan` prefix
- **Learning-Driven Tool Selection** — Tools with <30% success rate (10+ uses) tagged `[LOW RELIABILITY]`, >90% tagged `[HIGHLY RELIABLE]` in LLM-visible descriptions. Error resolution patterns recorded when alternative tools succeed
- **Sub-Agent Depth 2** — Configurable nesting depth (default 2) replaces hard block. Max rounds reduced 30% per depth level. Output validation checks for empty/too-short/error responses
- **Goal Dependency Graph** — `dependsOn` field on subtasks with DFS cycle detection. `getReadyTasks()` respects dependency ordering
- **Smarter Context Summarization** — Older tool results (>500 chars) compressed to 150-char summaries. Last 5 tool results kept at full fidelity
- **Checkpoint/Resume** — Agent state serialized when round budget exhausted. `exhaustedBudget` flag and `checkpoint` field in AgentResponse
- **Configurable Initiative Rate Limits** — `autonomy.initiativeIntervalMs` replaces hardcoded 60s interval
- **React-Compatible Form Filling** — `pressSequentially()` replaces `page.fill()` for React SPA compatibility in `fillFormSmart()`

---

## [2026.10.17] — 2026-03-13

### Added
- **CapSolver Integration** — Automatic CAPTCHA solving via CapSolver REST API. Supports reCAPTCHA v2/v3, hCaptcha, and Cloudflare Turnstile. New `captchaSolver.ts` module with detect, solve, and inject pipeline
- **Direct Form Fill Endpoint** — `POST /api/browser/form-fill` bypasses LLM orchestration for reliable form automation. Supports `postClicks` for button/radio interactions after text fill
- **CAPTCHA Solve Endpoint** — `POST /api/browser/solve-captcha` for standalone CAPTCHA solving on any page
- **CapSolver Config** — New `capsolver` section in Zod config schema (`enabled`, `apiKey`, `timeoutMs`, `minScore`)
- **reCAPTCHA Script Render Detection** — Detects sitekeys from `recaptcha/api.js?render=` script tags (invisible reCAPTCHA v3)

### Fixed
- **Form fill button ordering** — Button/radio clicks now deferred to second pass after all text fields are filled, preventing page state corruption
- **React controlled component compatibility** — Form fills now work with React apps that use synthetic events (e.g., AshbyHQ)
- **CAPTCHA detection before submit** — CapSolver integration in `fillFormSmart` attempts auto-solve before falling back to manual

---

## [2026.10.11] — 2026-03-12

### Added
- **Activity Panel** — Live real-time feed showing TITAN's actions (tool calls, agent activity, system events, errors) with auto-refresh, filter buttons, pause/resume, status pills (Idle/Processing/Autopilot), and system summary side panel
- **Activity API** — `GET /api/activity/recent` (parsed gateway log events with filter/limit) and `GET /api/activity/summary` (live system state aggregation)

---

## [2026.10.10] — 2026-03-12

### Added
- **Integrations Panel** — New admin panel for managing LLM provider API keys (12 providers: Anthropic, OpenAI, Google, Groq, Mistral, OpenRouter, Fireworks, xAI, Together, DeepSeek, Perplexity, Ollama) and Google OAuth credentials, with configured/not-configured status badges
- **Workflows Panel** — Fully functional command center with Active Goals (create/track/complete), Scheduled Tasks (cron CRUD), Recipes (browse/run), and Autopilot status with run history
- **Goals API** — REST endpoints for goal/subtask CRUD (`/api/goals`)
- **Cron API** — REST endpoints for cron job management (`/api/cron`)
- **Autopilot toggle API** — Enable/disable autopilot via `/api/autopilot/toggle`
- **Recipe run API** — Execute recipes via `/api/recipes/:id/run`
- **Autonomous persona** — New `autonomous` persona with prime directives, tool mastery guide, and self-reflection protocol
- **Provider config support** — Backend handles API keys for 8 additional providers (Groq, Mistral, OpenRouter, Fireworks, xAI, Together, DeepSeek, Perplexity)

---

## [2026.10.9] — 2026-03-12

### Fixed
- **LearningPanel rewrite** — Panel now fetches from correct API endpoints (`/api/learning`, `/api/stats`, `/api/graphiti`), shows knowledge entries, tool tracking, error patterns, corrections, graph stats, and system metrics. Replaced broken CSS variables with hardcoded hex colors.

### Added
- **Autonomous operation** — AUTOPILOT.md checklist and SOUL.md persona for fully autonomous agent behavior with 30-minute autopilot cycles

---

## [2026.10.8] — 2026-03-12

### Fixed
- **HelpPanel transparency** — Panel used undefined CSS variables making it see-through; replaced with hardcoded hex colors matching dark theme design system

---

## [2026.10.7] — 2026-03-12

### Added
- **Research Pipeline** — DeerFlow-inspired multi-agent parallel research with plan decomposition, parallel sub-agent fan-out, synthesis with confidence scoring, and structured reports (`deep_research_pipeline` tool)
- **Autonomous Experimentation** — Karpathy's autoresearch pattern: bounded iterative experimentation with git-as-memory, keep/discard/crash tracking, results.tsv audit trail (`experiment_loop` tool)
- **TopFacts Memory Plugin** — DeerFlow-inspired persistent "What I Know About You" facts injected into system prompt via ContextEngine plugin (auto-extracts preferences, corrections, expertise from conversations)
- **Checkpoint/Resume** — Plans checkpoint after each completed task for crash recovery (`checkpointPlan`, `loadCheckpoint`, `resumePlan`)
- **Sub-agent templates** — `reporter` and `fact_checker` templates added to SUB_AGENT_TEMPLATES
- **7 new recipes** — `/research`, `/market-analysis`, `/competitor-intel`, `/tech-report`, `/experiment`, `/optimize`, `/ab-test`
- **Help Panel** — Context-sensitive "?" help panel with FAQ, glossary, and search in Mission Control
- **Quick Actions** — Guided workflow prompt cards in empty chat state (Research, Experiment, Brainstorm, Debug, Explain, Market Analysis)
- **100 new tests** — research-pipeline (15), autoresearch (16), top-facts (20), checkpoint (15), recipes-extended (22), deliberation checkpoint integration

### Fixed
- **agent.test.ts** — Added missing `learnFact` mock export, fixed `addEpisode` call count assertion
- **autoresearch** — Fixed `||` to `??` for `timeBudgetMinutes`/`maxExperiments` so `0` values are respected
- **tool-search.test.ts** — Updated `DEFAULT_CORE_TOOLS` bound for new tools

---

## [2026.10.6] — 2026-03-10

### Added
- **Human-like voice** — Conversational system prompt, thinking preambles, time-aware greetings, tech acronym expansion
- **Dynamic FluidOrb** — Real LiveKit agent state (listening/thinking/speaking) drives orb color and animation
- **Thinking state** — Amber/gold orb pulse while TITAN processes a response
- **6 new voice personas** — Sarah, Liam, Lily, George, Jessica, Eric for small business and new users (16 total)
- **MiniFluidBubble** — Animated canvas-based fluid orb replaces mic icon in chat input
- **Agent selector** — ChatView agent pill bar for routing messages to specific spawned agents
- **Agent routing** — `agentId` parameter through gateway → multiAgent router
- **TrackVolumeMonitor** — Isolated component for LiveKit useTrackVolume hook

### Fixed
- **Voice overlay crash** — Conditional `useTrackVolume` hook call violated React rules of hooks, causing blank screen after 1 second
- **Self-healing LiveKit URL** — WebSocket URL dynamically rewrites based on request hostname (Tailscale/LAN/local)
- **Voice health pre-check** — Checks `/api/voice/health` before LiveKit connection with auto-retry (3 attempts)
- **AgentsPanel type** — Fixed `getAgents()` return type unwrapping

---

## [2026.10.5] — 2026-03-10

### Added
- **Personas system** — 21 curated agent personas (default + 20 from agency-agents) with division-based organization (engineering, testing, product, project-mgmt, design, specialized)
- **Persona Manager skill** — `list_personas`, `switch_persona`, `get_persona` tools for runtime persona switching
- **Personas admin panel** — Mission Control panel with division-filtered grid, active persona indicator, click-to-switch
- **API endpoints** — `GET /api/personas` and `POST /api/persona/switch` for persona management
- **Onboarding FluidOrb hero** — Welcome step now features the animated FluidOrb instead of static logo
- **Onboarding persona selection** — Profile step replaced with dynamic persona picker from API
- **Onboarding cinematic launch** — Launch step with shimmer text "MISSION CONTROL READY" and animated stat counters
- **Persona tests** — `tests/personas.test.ts` covering load, get, list, content, and cache invalidation

### Improved
- **System prompt** — Active persona content injected after SOUL.md in agent context
- **Config schema** — Added `agent.persona` field (default: 'default')
- **Third-party attribution** — Added agency-agents (MIT, AgentLand Contributors) to THIRD_PARTY_NOTICES.md

---

## [2026.10.4] — 2026-03-10

### Added
- **Onboarding Wizard** — beautiful 5-step web-based setup wizard for first-time users (provider selection, model picking, personality customization) — no terminal required
- **`system_info` tool** — real hardware detection (CPU, RAM, GPU via nvidia-smi, disk, network, OS, Docker containers, Ollama models) replaces generic placeholder responses
- **New admin panels** — Learning, Autopilot, Security, Workflows, Memory Graph panels in Mission Control
- **Suggestion pills** — chat empty state now shows quick-start prompts for new users

### Fixed
- **Tool discovery** — added `system_info`, `goal_list`, `spawn_agent` to core tools so the model always has access without needing `tool_search`
- **Chat 400 errors** — fixed message field name (`message` → `content`) in chat API client
- **SSE parser** — fixed streaming response parsing for real-time chat output
- **Version display** — sidebar now shows current version with npm update check

### Improved
- **109 tools** — up from 108 with the new `system_info` skill
- **Onboarding API** — `GET /api/onboarding/status` and `POST /api/onboarding/complete` endpoints
- **Health endpoint** — now includes `onboarded` status flag

---

## [2026.10.3] — 2026-03-09

### Fixed
- **Settings panel crash** — `getModels()` API returns `{provider: [models]}` object but Settings panel expected an array; now flattens to `ModelInfo[]` in the API client
- **Settings panel wrong config keys** — panel read `config.model` / `config.provider` but API returns nested `config.agent.model`; fixed to read from correct paths

---

## [2026.10.2] — 2026-03-09

### Fixed
- **Auth lockout on fresh installs** — default `auth.mode='token'` with no token configured permanently locked out all API requests (401); now treats unconfigured token auth as no-auth so Mission Control works out of the box

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
