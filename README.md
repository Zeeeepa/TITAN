# TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>A fully autonomous AI agent framework with Autopilot Mode. 17 providers. 30+ tools. 2,170+ tests. Pure JavaScript — no native compilation.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/titan-agent"><img src="https://img.shields.io/npm/v/titan-agent?color=blue&label=npm" alt="npm version"/></a>
  <a href="https://github.com/Djtony707/TITAN/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"/></a>
  <a href="#providers"><img src="https://img.shields.io/badge/providers-17-purple" alt="17 Providers"/></a>
  <a href="#built-in-tools"><img src="https://img.shields.io/badge/tools-30-orange" alt="30 Tools"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#why-titan">Why TITAN</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#providers">Providers</a> &bull;
  <a href="#mission-control">Mission Control</a> &bull;
  <a href="#mesh-networking">Mesh Networking</a> &bull;
  <a href="#custom-skills">Custom Skills</a> &bull;
  <a href="#cli-reference">CLI</a>
</p>

---

## Quick Start

**Requirements:** Node.js >= 20

```bash
npm install -g titan-agent
titan onboard             # Interactive setup (pick a provider, paste your API key)
titan gateway             # Launch Mission Control at http://localhost:48420
titan agent -m "Hello"    # Talk to your agent from the terminal
```

### From Source

```bash
git clone https://github.com/Djtony707/TITAN.git && cd TITAN/titan
npm install
cp .env.example .env      # Add API keys
npm run dev:gateway        # Start in dev mode
```

---

## Why TITAN

| | TITAN | Typical AI agent frameworks |
|---|---|---|
| **Setup** | `npm i -g titan-agent && titan onboard` | Docker, Python venvs, native compilation |
| **Native compilation** | None — all pure JS deps | Often require node-gyp, system libraries |
| **Providers** | 17 (60+ preconfigured models) with automatic failover | 1-4 providers, no failover |
| **Security** | Prompt injection shield, DM pairing, E2E encryption, encrypted vault, audit log, tool sandboxing | Minimal or none |
| **Memory** | 4 systems (episodic, learning, relationship, temporal graph) | Basic chat history |
| **Multi-computer** | Built-in mesh with mDNS + Tailscale auto-discovery | Manual config or unsupported |
| **Skills** | 30 built-in + drop-in YAML/JS creation | Fixed tool set |
| **Cost control** | Smart routing, daily budgets, context summarization | Uncapped token spend |
| **GUI** | 11-panel Mission Control dashboard | CLI only or basic web UI |
| **Codebase** | ~22K lines TypeScript | 50K-200K+ lines |

---

## Features

### 17 AI Providers, 60+ Models

Connect any combination of cloud and local models. TITAN routes, fails over, and load-balances automatically.

```bash
titan model --discover       # Live-detect all available models
titan model --alias fast=openai/gpt-4o-mini   # Create shortcuts
titan model --set anthropic/claude-sonnet-4-20250514
```

Built-in aliases: `fast`, `smart`, `cheap`, `reasoning` — fully configurable.

### 30 Built-in Tools

| Category | Tools |
|----------|-------|
| **Shell & Process** | `shell`, `exec`, `process` (list, kill, spawn, poll, log) |
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `list_dir`, `apply_patch` |
| **Web** | `web_search`, `web_fetch`, `browser` (CDP), `browse_url`, `browser_search`, `browser_auto_nav` (Playwright) |
| **Intelligence** | `auto_generate_skill`, `analyze_image`, `transcribe_audio`, `generate_speech` |
| **Automation** | `cron`, `webhook` |
| **Memory** | `memory`, `switch_model`, `graph_remember`, `graph_search`, `graph_entities`, `graph_recall` |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_close` |

### Temporal Knowledge Graph

Pure TypeScript graph memory — no Docker, no Neo4j, no external services.

- Conversations are automatically recorded as timestamped episodes
- Entities (people, projects, topics) are extracted and linked
- Relevant memories are injected into every system prompt
- Searchable across time with natural language

```bash
titan graphiti --init     # Initialize the graph
titan graphiti --stats    # View entity/episode counts
```

### Multi-Agent System

Run up to 5 concurrent agents, each with its own model and personality.

```bash
titan agents --spawn researcher --model openai/gpt-4o
titan agents --spawn coder --model ollama/llama3.1
titan agents --list
```

### Prompt Injection Shield

Two-layer defense against prompt injection attacks:

- **Heuristic engine** — Detects "ignore previous instructions", system prompt extraction, developer mode exploits
- **Strict mode** — Keyword density analysis and tail manipulation detection

Combined with the separate **DM pairing** system, which requires new senders to be approved before they can interact with your agent.

### Loop Detection & Circuit Breaker

Three detection algorithms prevent runaway tool loops:

- **Repeat detection** — Same tool, same arguments, called repeatedly
- **No-progress detection** — Tool returns identical output on consecutive calls
- **Ping-pong detection** — Alternating tool patterns with no forward progress
- **Global circuit breaker** — Hard stop after configurable threshold

### Task Planner

Automatic goal decomposition with dependency-aware execution:

- Breaks complex goals into ordered sub-tasks
- Parallel execution of independent tasks
- 3x auto-retry with exponential backoff
- Persistent state at `~/.titan/plans/`

### Smart Context & Cost Optimization

- Auto-summarizes conversation history to stay within token budgets
- Routes simple queries to cheaper models automatically
- Per-session cost tracking with configurable daily budgets

### Continuous Learning

TITAN gets smarter the more you use it:

- Tracks tool success/failure rates across all interactions
- Records error patterns and successful resolutions
- Persistent knowledge base at `~/.titan/knowledge.json`
- Learned context injected into every system prompt

### Relationship Memory

- Persistent user profile that survives restarts
- Remembers your name, preferences, work context
- Personal continuity across all sessions

### Encrypted Secrets Vault

Store API keys and credentials securely in an AES-256-GCM encrypted vault with PBKDF2 key derivation. Reference secrets in config via `$VAULT:secret_name`.

```bash
titan vault --init              # Create vault with passphrase
titan vault --set OPENAI_KEY    # Store a secret
titan vault --list              # List stored secrets
```

### Tamper-Evident Audit Log

HMAC-SHA256 chained JSONL audit trail at `~/.titan/audit.jsonl`. Tracks tool executions, config changes, auth events, and security alerts with cryptographic tamper detection.

### Self-Healing Doctor

`titan doctor --fix` automatically diagnoses and repairs common issues: missing directories, invalid configs, broken channels, stale logs, orphaned sessions, and file permissions.

### Autopilot Mode

TITAN runs hands-free on a schedule, evaluates a checklist of standing instructions, takes autonomous action, and reports results — inspired by Polsia, OpenClaw, Devin, and CrewAI.

```bash
titan autopilot --init           # Create ~/.titan/AUTOPILOT.md checklist
titan autopilot --enable         # Turn on scheduled runs
titan autopilot --run            # Trigger an immediate run
titan autopilot --status         # View schedule and last run info
titan autopilot --history        # See past run results
```

Edit `~/.titan/AUTOPILOT.md` to control what TITAN watches each cycle. Results are classified as OK (silent), NOTABLE (summary delivered), or URGENT (priority alert). Cost-optimized: uses a cheaper model for routine runs, respects daily budgets, and skips runs outside active hours.

### E2E Encrypted Sessions

AES-256-GCM encryption for sensitive conversations. Keys generated per-session, held in memory only.

---

## Providers

TITAN supports 17 AI providers out of the box. Add your API key and go.

| Provider | Models | Type |
|----------|--------|------|
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4, 3.5 Sonnet/Haiku | Cloud |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo, o1, o1-mini, o3-mini | Cloud |
| **Google** | Gemini 2.5 Pro/Flash, 2.0 Flash, 1.5 Pro | Cloud |
| **Ollama** | Any locally installed model | Local |
| **Groq** | LLaMA 3.3 70B, Mixtral, Gemma 2, DeepSeek-R1 Distill | Cloud (Fast inference) |
| **Mistral** | Mistral Large, Medium, Small, Nemo, Codestral | Cloud |
| **OpenRouter** | 290+ models from all providers | Cloud (Aggregator) |
| **Together** | LLaMA 3.3, DeepSeek-R1, Qwen 2.5, Mixtral | Cloud |
| **Fireworks** | LLaMA 3.3, Mixtral, Qwen 3 | Cloud (Fast inference) |
| **xAI** | Grok-3, Grok-3-fast, Grok-3-mini | Cloud |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner | Cloud |
| **Cerebras** | LLaMA 3.3, LLaMA 3.1, Qwen 3 | Cloud (Fast inference) |
| **Cohere** | Command-R+, Command-R, Command-R 7B | Cloud |
| **Perplexity** | Sonar, Sonar Pro, Sonar Reasoning | Cloud (Search-augmented) |
| **Venice AI** | LLaMA 3.3 70B, DeepSeek-R1 671B, Qwen 2.5 VL | Cloud (Privacy-first) |
| **AWS Bedrock** | Claude, Titan Text, LLaMA 3 (via proxy) | Cloud (Enterprise) |
| **LiteLLM** | Any model via universal proxy | Self-hosted (Proxy) |

All providers support automatic failover. If one goes down, TITAN seamlessly routes to the next available provider.

```bash
# Configure via CLI
titan config set providers.groq.apiKey "gsk_..."
titan config set providers.openrouter.apiKey "sk-or-..."

# Or via environment variables
export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-or-..."
```

---

## Mission Control

An 11-panel dark-mode dashboard at `http://localhost:48420`.

| Panel | Description |
|-------|-------------|
| **Overview** | System health, uptime, memory, model info, cost stats |
| **WebChat** | Real-time chat with your agent via WebSocket |
| **Agents** | Spawn, stop, and monitor agent instances |
| **Settings** | 6-tab live configuration (AI, Providers, Channels, Security, Gateway, Profile) |
| **Channels** | Connection status for all channel adapters |
| **Skills** | Installed skills with enable/disable controls |
| **Sessions** | Active sessions with message counts and history |
| **Learning** | Tool success rates and knowledge base stats |
| **Security** | Audit log and DM pairing management |
| **Logs** | Color-coded real-time log viewer with filtering |
| **Memory Graph** | Visual force-directed graph of entities and relationships |

All settings are editable live without restarting the gateway.

---

## Mesh Networking

Deploy TITAN across multiple computers with zero configuration. Machines auto-discover each other and share models.

### LAN Discovery (mDNS)

Machines on the same network find each other automatically via Bonjour/mDNS.

```bash
# On machine 1
titan mesh --init        # Generates a shared secret

# On machine 2
titan mesh --join "your-secret-here"

# Check connectivity
titan mesh --status
```

### Tailscale Integration

If you run Tailscale, TITAN automatically discovers peers on your VPN — works across networks, data centers, and cloud instances.

```json
{
  "mesh": {
    "enabled": true,
    "tailscale": true
  }
}
```

### Remote Model Routing

When a requested model isn't available locally, TITAN automatically routes to a peer that has it. Load-balanced across all available nodes.

---

## Custom Skills

Create new tools for TITAN in seconds. Drop files into `~/.titan/skills/` and they're loaded automatically.

### YAML Skills (Easiest)

```yaml
# ~/.titan/skills/word_count.yaml
name: word_count
description: Count words, lines, and characters in a file
parameters:
  filePath:
    type: string
    description: Path to the file
    required: true
script: |
  const fs = require('fs');
  const content = fs.readFileSync(args.filePath, 'utf-8');
  const lines = content.split('\n').length;
  const words = content.split(/\s+/).filter(Boolean).length;
  return 'Lines: ' + lines + ', Words: ' + words + ', Characters: ' + content.length;
```

### JavaScript Skills

```javascript
// ~/.titan/skills/hello.js
export default {
  name: 'hello',
  description: 'Greet someone by name',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' }
    },
    required: ['name']
  },
  execute: async (args) => `Hello, ${args.name}!`
};
```

### AI-Generated Skills

```bash
titan skills --create "a tool that converts CSV files to JSON"
```

TITAN writes, compiles, and hot-loads the skill instantly.

### Skill Auto-Generation

When TITAN encounters a task it can't solve with existing tools, it can write a new skill on the fly, compile it, and use it immediately.

---

## Channel Adapters

Connect TITAN to your messaging platforms:

| Channel | Library | Status |
|---------|---------|--------|
| **Discord** | discord.js | Ready |
| **Telegram** | grammY | Ready |
| **Slack** | @slack/bolt | Ready |
| **Google Chat** | Webhooks | Ready |
| **WhatsApp** | Baileys | Ready |
| **Matrix** | matrix-js-sdk | Ready |
| **Signal** | signal-cli REST | Ready |
| **MS Teams** | botbuilder | Ready |
| **WebChat** | Built-in WebSocket | Ready |

All 9 channels support the DM pairing security system. Configure via `~/.titan/titan.json` or Mission Control Settings.

---

## Recipes

Reusable multi-step workflows triggered by slash commands.

```bash
# Built-in recipes
/code-review     # Review files for bugs and improvements
/standup         # Prepare daily standup notes
/explain         # Explain code in plain English
/brainstorm      # Generate ideas on a topic
/debug           # Debug errors with guided analysis
```

Recipes support parameterized prompts (`{{variable}}`), optional tool-direct steps, and confirmation gates.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `titan onboard` | Interactive setup wizard |
| `titan gateway` | Start Mission Control |
| `titan agent -m "..."` | Send a message to your agent |
| `titan send --to ch:id -m "..."` | Message a specific channel |
| `titan model --list` | Show all configured models |
| `titan model --discover` | Live-detect available models |
| `titan model --set <model>` | Switch the active model |
| `titan model --alias <name>=<model>` | Create a model alias |
| `titan agents` | Multi-agent management |
| `titan mesh --init` | Initialize mesh networking |
| `titan mesh --status` | View mesh peers and models |
| `titan skills` | List installed skills |
| `titan skills --create "..."` | Generate a skill with AI |
| `titan pairing` | Manage DM access control |
| `titan doctor` | System diagnostics |
| `titan doctor --fix` | Auto-fix detected issues |
| `titan vault` | Manage encrypted secrets vault |
| `titan config` | View/edit configuration |
| `titan graphiti --init` | Initialize knowledge graph |
| `titan graphiti --stats` | Graph statistics |
| `titan mcp` | Manage MCP servers |
| `titan recipe --list` | List and run saved recipes |
| `titan monitor` | Manage proactive file/schedule monitors |
| `titan autopilot --init` | Create AUTOPILOT.md checklist |
| `titan autopilot --run` | Trigger immediate autopilot run |
| `titan autopilot --status` | View schedule, last run, next run |
| `titan autopilot --enable/--disable` | Toggle autopilot mode |
| `titan update` | Update to latest version |

---

## Configuration

All state lives in `~/.titan/`:

| Path | Purpose |
|------|---------|
| `titan.json` | Main configuration |
| `titan-data.json` | Runtime data (sessions, webhooks) |
| `graph.json` | Temporal knowledge graph |
| `knowledge.json` | Learning engine knowledge base |
| `profile.json` | User profile and preferences |
| `vault.enc` | Encrypted secrets vault |
| `audit.jsonl` | Tamper-evident audit trail |
| `node-id` | Mesh networking node identity |
| `logs/` | Daily log files |
| `plans/` | Persistent task planner state |
| `skills/` | Custom user skills (YAML, JS) |
| `recipes/` | Saved recipe workflows |

---

## Development

```bash
npm run build          # tsup ESM production build
npm run test           # vitest (2,100+ tests, 57 files)
npm run ci             # typecheck + full test suite
npm run typecheck      # tsc --noEmit
npm run dev:gateway    # Dev mode with tsx
npm run test:coverage  # Coverage report (68%+ with 55% threshold)
```

### Architecture

```
src/
  agent/        Core agent loop, multi-agent, swarm, planner, autonomy
  channels/     Discord, Telegram, Slack, Google Chat, WebChat
  providers/    Anthropic, OpenAI, Google, Ollama + 13 OpenAI-compatible
  memory/       Episodic, learning, relationship, temporal graph
  skills/       30 built-in tools + user skill loader
  security/     Shield, sandbox, encryption, pairing, vault, audit log
  gateway/      HTTP/WS server + Mission Control dashboard
  mesh/         mDNS + Tailscale peer discovery, WebSocket transport
  recipes/      Workflow engine + persistence
  mcp/          Model Context Protocol client
  config/       Zod schema + loader
  cli/          Commander.js CLI (16 commands), self-healing doctor
  utils/        Constants, logger, helpers
```

---

## Autonomy Modes

| Mode | Behavior |
|------|----------|
| `autonomous` | Full auto — TITAN executes all tools without asking |
| `supervised` | Asks before dangerous operations (default) |
| `locked` | Asks permission for every tool call |

Configure via `titan config set autonomy.mode supervised` or Mission Control Settings.

---

## Roadmap

See [TASKS.md](TASKS.md) for the full development roadmap. Phases 1-4.5 are complete; Phase 5 (competitive dominance) is in progress.

### Recently Shipped (v2026.5.x)
- **v2026.5.4**: Encrypted secrets vault, tamper-evident audit log, self-healing doctor (`--fix`), 3 new providers (Venice AI, AWS Bedrock, LiteLLM), resource limits, 2,100+ tests
- **v2026.5.3**: 20 runtime bug fixes (Batches 1-2), 1,523 tests, 66.88% coverage
- Email skill (IMAP/SMTP via Nodemailer)
- PDF parsing skill (pdf-parse)
- Computer use (screenshots, mouse, keyboard via nut.js)
- WhatsApp, Matrix, Signal, MS Teams channel adapters
- Persistent webhooks with cron scheduling
- Morning briefing system
- OpenClaw Skill Scanner (quarantine + auto-scan)
- Onboarding wizard (`titan onboard`)
- MCP (Model Context Protocol) client support

### Upcoming
- GitHub skill (PR review, issues, repos)
- Image generation skill
- Plugin marketplace
- Voice mode (real-time audio transcription/synthesis)

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## The Future of TITAN

TITAN is under active development and growing fast. Every release brings new providers, new tools, and deeper intelligence. The roadmap includes computer use, GitHub/email integration, a plugin marketplace, WhatsApp and more channel adapters, image generation, and much more.

This is just the beginning. If you're looking for an AI agent framework that's lightweight enough to run on a Raspberry Pi but powerful enough to orchestrate multi-model workflows across a mesh of machines — you're in the right place.

Star the repo, join the journey, and help shape what autonomous AI agents look like.

---

## Acknowledgments

TITAN stands on the shoulders of giants. Special thanks to the projects and people whose work made this possible.

### Architectural Inspiration

- **[OpenClaw](https://github.com/openclaw/openclaw)** by [Peter Steinberger](https://github.com/steipete) — TITAN's architecture, CLI surface, tool signatures, workspace layout (AGENTS.md, SOUL.md, TOOLS.md), and DM pairing system are inspired by OpenClaw, the open-source personal AI assistant framework. Licensed under MIT.

### Temporal Knowledge Graph

- **[Graphiti](https://github.com/getzep/graphiti)** by [Zep AI](https://www.getzep.com/) — TITAN's native temporal knowledge graph (`src/memory/graph.ts`) is inspired by the Graphiti project's approach to episodic memory, entity extraction, and temporal graph architecture. Created by [Daniel Chalef](https://github.com/danielchalef), [Preston Rasmussen](https://github.com/prasmussen15), [Pavlo Paliychuk](https://github.com/paul-paliychuk), Travis Beauvais, and [Jack Ryan](https://github.com/jackaldenryan). Licensed under Apache 2.0. Research paper: [arXiv:2501.13956](https://arxiv.org/abs/2501.13956).

### Open-Source Libraries

- [Express](https://expressjs.com/) — HTTP server and API routing
- [Zod](https://zod.dev/) — Configuration schema validation
- [Commander.js](https://github.com/tj/commander.js) — CLI framework
- [ws](https://github.com/websockets/ws) — WebSocket server for real-time communication
- [Chalk](https://github.com/chalk/chalk) — Terminal styling
- [Ora](https://github.com/sindresorhus/ora) — Terminal spinners
- [Boxen](https://github.com/sindresorhus/boxen) — Terminal box rendering
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) — Interactive CLI prompts
- [dotenv](https://github.com/motdotla/dotenv) — Environment variable loading
- [node-cron](https://github.com/node-cron/node-cron) — Cron scheduling
- [uuid](https://github.com/uuidjs/uuid) — Unique ID generation
- [Playwright](https://playwright.dev/) — Browser automation (optional)
- [bonjour-service](https://github.com/onlxltd/bonjour-service) — mDNS mesh discovery (optional)
- [tsup](https://github.com/egoist/tsup) — Build tooling
- [Vitest](https://vitest.dev/) — Test framework
- [TypeScript](https://www.typescriptlang.org/) — Type-safe development

Thank you to all the maintainers and contributors of these projects.

---

## Support / Fund

If TITAN saves you time, consider supporting its development:

[![Fund with thanks.dev](https://img.shields.io/badge/Fund%20with-thanks.dev-brightgreen)](https://thanks.dev/Djtony707/TITAN)

Every contribution — large or small — helps keep TITAN free, maintained, and moving forward.

---

## License

MIT License — Copyright (c) 2026 Tony Elliott

Created by [Tony Elliott (Djtony707)](https://github.com/Djtony707)
