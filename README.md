# TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>Your own personal AI agent. Any OS. Any platform. Superior by design.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#cli-reference">CLI Reference</a> •
  <a href="#mission-control">Mission Control</a> •
  <a href="#providers">Providers</a> •
  <a href="#comparison">Comparison</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## Quick Start

**Requirements:** Node.js >= 20, npm >= 9

```bash
npm install -g titan-agent
titan onboard          # Interactive setup wizard (choose your AI provider + API key)
titan gateway          # Start Mission Control at http://localhost:48420
titan agent -m "Hello" # Send a direct message
```

### Run from Source

```bash
git clone https://github.com/Djtony707/TITAN.git
cd TITAN/titan
npm install
cp .env.example .env   # Add your API keys
npm run onboard
npm run dev:gateway
```

---

## Features

### Prompt Injection Shield

Zero tolerance for unauthorized takeovers (`src/security/shield.ts`):

- **Heuristic Engine** — Detects and blocks "ignore previous instructions", "developer mode", and system prompt extraction attempts.
- **Strict Mode** — Scans for keyword density and tail manipulations in large payloads.
- **DM Pairing System** — Approve or deny access from new senders before they can interact with your agent (`src/security/pairing.ts`).

### Loop Detection and Circuit Breaker

No more infinite tool loops (`src/agent/loopDetection.ts`). Three detection algorithms run in parallel:

- **Generic Repeat** — Same tool with identical arguments called repeatedly.
- **No-Progress Polling** — Tool returns identical output on consecutive calls.
- **Ping-Pong** — Alternating A/B tool patterns with no forward progress.
- **Global Circuit Breaker** — Hard stop after a configurable threshold.

### Task Planner with Dependency Graphs

`src/agent/planner.ts`:

- Automatic goal decomposition into ordered sub-tasks.
- Dependency tracking — tasks only execute when prerequisites are met.
- 3x auto-retry on failure with exponential backoff.
- Parallel execution of independent tasks.
- Persistent plan state at `~/.titan/plans/`.

### Smart Context Manager

`src/agent/contextManager.ts`:

- Auto-summarizes old conversation history to stay within token budgets.
- Priority-based context allocation (recent > relevant > old).
- Per-model token limit enforcement with smart truncation that preserves tool call context.

### Cost Optimizer

`src/agent/costOptimizer.ts`:

- Intelligently routes requests to cheaper models when full power is not needed.
- Tracks real-time cost per session against configurable budgets.
- Context summarization reduces token usage by 30–90% on long sessions.

### Continuous Learning Engine

`src/memory/learning.ts`:

- Tracks tool success and failure rates across all interactions.
- Records error patterns and successful resolutions.
- Builds a persistent knowledge base at `~/.titan/knowledge.json`.
- Injects learned context into every system prompt automatically.
- TITAN gets more effective the more you use it.

### Relationship Memory

`src/memory/relationship.ts`:

- Persistent user profile (`~/.titan/profile.json`) that survives restarts.
- Remembers your name, preferences, work context, and interaction history.
- Provides JARVIS-like personal continuity across sessions.

### Multi-Agent System

`src/agent/multiAgent.ts`:

- Up to 5 concurrent independent agent instances.
- Each agent can run a different model and system prompt.
- Channel-based routing — agents bind to specific channels.
- Spawn and stop agents from the CLI or Mission Control GUI.

### Kimi Swarm Architecture

`src/agent/swarm.ts`:

- Specialized routing for Ollama kimi-k2.5 models.
- Prevents context collapse by splitting the 22-tool set into domain-focused sub-agents (file, web, system, memory).
- Each sub-agent receives 3–4 tools instead of the full monolith.

### 22 Built-in Skills

| Group | Skills |
|-------|--------|
| **Runtime** | `shell`, `exec` (background/timeout), `process` (list/poll/kill/log) |
| **Filesystem** | `read`, `write`, `edit`, `list_dir`, `apply_patch` |
| **Web** | `web_search`, `web_fetch`, `browser` (CDP), `web_browser` (Playwright bulk DOM) |
| **Intelligence** | `auto_generate_skill`, `analyze_image` (Vision), `transcribe_audio` (STT), `generate_speech` (TTS) |
| **Automation** | `cron`, `webhook` |
| **Memory** | `memory_skill`, `model_switch` |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_close` |

### Skill Auto-Generation

- If TITAN encounters a task it cannot solve with existing tools, `auto_generate_skill` writes a new TypeScript skill, compiles it, and hot-loads it instantly.
- Auto-generated skills are saved to `~/.titan/skills/auto/` and persist across restarts.

### Graphiti Temporal Memory

- Neo4j + Graphiti MCP server via Docker Compose.
- Provides graph-based temporal memory for complex, time-aware knowledge retrieval.
- Start with `titan graphiti --init`, stop with `titan graphiti --down`.

### Recipes

`src/recipes/`:

- Reusable multi-step workflows defined as structured configs.
- Trigger with slash commands in any connected channel.
- Parameterized — pass values at invocation time.

### MCP Support

`src/mcp/`:

- Connect external tools and services via the Model Context Protocol.
- Register MCP servers by URL; tools are exposed automatically to the agent.

### E2E Encrypted Sessions

`src/security/encryption.ts`:

- AES-256-GCM encryption for sensitive conversations.
- Keys are generated per-session and held in memory only.

### Channel Adapters

Discord · Telegram · Slack · Google Chat · WebChat · WhatsApp

Each adapter is an independent module in `src/channels/`.

### Model-Agnostic

Anthropic · OpenAI · Google · Ollama — with automatic failover between providers.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `titan onboard` | Interactive setup wizard — configure provider, API keys, and channels |
| `titan gateway` | Start Mission Control at `http://localhost:48420` |
| `titan agent -m "..."` | Send a direct message to your agent |
| `titan send --to ch:id -m "..."` | Send a message to a specific channel |
| `titan pairing` | Manage DM access control (approve/deny senders) |
| `titan agents` | Multi-agent management (spawn, stop, list) |
| `titan doctor` | System diagnostics — checks config, connectivity, and dependencies |
| `titan skills` | Skill management (list, install, generate) |
| `titan config` | View or edit configuration |
| `titan update` | Update TITAN to the latest version |
| `titan graphiti --init` | Start Graphiti temporal memory stack (Docker) |
| `titan graphiti --down` | Stop Graphiti stack and deregister MCP server |

---

## Mission Control

TITAN ships with a **Mission Control** web GUI — a dark-mode dashboard served from the gateway at `http://localhost:48420`.

### Panels

| Panel | Description |
|-------|-------------|
| **Overview** | System health, uptime, memory usage, version |
| **WebChat** | Built-in real-time chat via WebSocket |
| **Agents** | Spawn and stop agent instances, view capacity |
| **Settings** | 6-tab configuration: AI and Model, Providers, Channels, Security, Gateway, Profile |
| **Channels** | Connection status for each channel adapter |
| **Skills** | Installed skills with status |
| **Sessions** | Active session list with message counts |
| **Learning** | Learning engine stats and tool success rates |
| **Security** | Security audit log and DM pairing management |
| **Graphiti** | Temporal memory panel (Neo4j/Graphiti integration) |

The Settings panel covers provider API keys, model selection, autonomy mode, channel configuration, gateway options, and user profile — all editable live without restarting.

---

## Providers

| Provider | Models | Cost |
|----------|--------|------|
| **Anthropic** | Claude Opus 4, Claude Sonnet 4, Claude Haiku 4 | Paid |
| **OpenAI** | GPT-4o, GPT-4o-mini, o-series | Paid |
| **Google** | Gemini 2.5 Flash/Pro, Gemini 2.0 Flash, Gemini 1.5 Flash/Pro | Paid |
| **Ollama** | Any locally installed model (kimi-k2.5, llama, mistral, etc.) | Free |

Provider selection and failover are configured in `~/.titan/titan.json` or via the Mission Control Settings panel.

---

## Configuration

TITAN stores all state in `~/.titan/`:

| Path | Purpose |
|------|---------|
| `~/.titan/titan.json` | Main configuration |
| `~/.titan/titan-data.json` | Runtime data |
| `~/.titan/knowledge.json` | Learning engine knowledge base |
| `~/.titan/profile.json` | Relationship memory / user profile |
| `~/.titan/logs/titan-YYYY-MM-DD.log` | Daily log files |
| `~/.titan/plans/` | Persistent task planner state |
| `~/.titan/skills/auto/` | Auto-generated skills |

---

## Development

```bash
npm run build        # tsup production build
npm run test         # vitest run (52 tests across 7 files)
npm run ci           # typecheck + full test suite
npm run typecheck    # tsc --noEmit (0 errors)
npm run dev:gateway  # Run gateway directly via tsx
```

The test suite covers core agent behavior, multi-agent routing, server endpoints, updater, and integration scenarios.

---

## Comparison

> Note: The frameworks below are fictional analogs used here for feature positioning purposes. They represent common archetypes in the AI agent framework space (bloated monolith, minimal implementation, Rust-compiled, cloud-managed, Python-based) rather than specific real projects.

| Feature | **TITAN** | Bloated TS | Minimal TS | Rust-based | Cloud-managed | Python-based |
|---------|-----------|------------|------------|------------|---------------|--------------|
| **Language** | TypeScript | TypeScript | TypeScript | Rust | Cloud | Python |
| **Native deps** | None | Required | None | Required | N/A | None |
| **Loop detection** | 3 detectors + circuit breaker | None | None | None | None | None |
| **Task planner** | Dependency graphs + retry | None | None | None | None | None |
| **Smart context** | Auto-summarize + budget | None | None | None | None | None |
| **Continuous learning** | Built-in | None | None | None | None | None |
| **Multi-agent** | Up to 5 | Yes | None | None | None | None |
| **Mission Control GUI** | 10+ panels, premium | Basic | None | None | Yes | None |
| **Browser control** | CDP + Playwright | CDP | None | None | Yes | None |
| **Skill auto-generation** | Yes | None | None | None | None | None |
| **Graphiti memory** | Yes (Docker) | None | None | None | None | None |
| **Local models (Ollama)** | Yes | Yes | Yes | Yes | None | Yes |
| **RAM usage** | ~50 MB | ~1 GB+ | ~30 MB | ~20 MB | Cloud | ~40 MB |
| **Setup** | `npm install -g titan-agent` | Complex | Simple | Compile | OAuth | `pip install` |

### Where TITAN sits in the landscape

**vs. bloated monolith frameworks** — Comparable capabilities in ~10K lines of pure TypeScript with zero native dependencies, plus exclusive features: loop detection, task planner, smart context, continuous learning, and skill auto-generation that larger frameworks lack.

**vs. minimal implementations** — Minimal agents prioritize small codebases over features. They typically lack browser control, multi-agent, background processes, task planning, and a GUI. TITAN provides all of these without reaching monolith size.

**vs. Rust/compiled frameworks** — Strong security and performance but require compilation, have steeper setup, and limited ecosystem. TITAN provides comparable security via sandboxing and encryption with a `npm install` setup.

**vs. cloud-managed agents** — Cloud agents remove self-hosting control. TITAN runs entirely on your own hardware with full local model support and no external service dependency.

**vs. Python agents** — Python agents have a large ML ecosystem but typically lack browser integration, multi-agent coordination, task planning, and a built-in GUI. TITAN covers all of these.

---

## Roadmap

### Completed

- Multi-agent system (up to 5 concurrent)
- 22 built-in skills (shell, filesystem, browser, process, web, cron, webhooks, sessions, memory, patch, vision, voice)
- Continuous learning engine
- Loop detection and circuit breaker (3 algorithms)
- Task planner with dependency graphs
- Smart context manager and cost optimizer
- Mission Control GUI (10+ panels, dark mode)
- Channel adapters: Discord, Telegram, Slack, Google Chat, WebChat, WhatsApp
- 4 LLM provider families with failover
- DM pairing security
- E2E AES-256-GCM encryption
- Skill auto-generation and hot-loading
- Recipes (reusable multi-step workflows)
- MCP (Model Context Protocol) support
- Kimi Swarm Architecture for local models
- Graphiti temporal memory (Neo4j + Docker Compose)
- Mission Control Settings: 6-tab live configuration panel
- 52-test suite across 7 test files

### Planned

- **Proactive agent mode** — TITAN monitors your environment and initiates actions without being prompted.
- **Multi-model reasoning chains** — Route sub-tasks to specialized models (fast model for planning, powerful model for execution).
- **Git workflow integration** — PR review, automated commits, branch management tools.
- **Expanded channel adapters** — Matrix, Signal, MS Teams, and others.
- **Team mode** — Multiple users with role-based access and shared agent pools.
- **OAuth integrations** — Direct connections to SaaS tools (GitHub, Google, Notion, Jira, etc.).

---

## Feature Requests

Open an issue on GitHub or contact the author directly:

- [Open a Feature Request](https://github.com/Djtony707/TITAN/issues/new?labels=feature-request&template=feature_request.md&title=%5BFeature%5D+)
- [Tony Elliott on GitHub](https://github.com/Djtony707)

---

## Credits

**Project Creator:** [Tony Elliott (Djtony707)](https://github.com/Djtony707)

**Dependencies:** Anthropic SDK, OpenAI SDK, Google Generative AI SDK, discord.js, grammY, Bolt (Slack), Zod, Commander.js, Express, ws, Playwright, chalk, uuid, tsup, Vitest.

---

## License

MIT License — Copyright (c) 2026 Tony Elliott. See [LICENSE](LICENSE).
