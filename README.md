# TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>A fully autonomous AI agent framework. 14 providers. 27 tools. Zero native dependencies.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/titan-agent"><img src="https://img.shields.io/npm/v/titan-agent?color=blue&label=npm" alt="npm version"/></a>
  <a href="https://github.com/Djtony707/TITAN/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"/></a>
  <a href="#providers"><img src="https://img.shields.io/badge/providers-14-purple" alt="14 Providers"/></a>
  <a href="#built-in-tools"><img src="https://img.shields.io/badge/tools-27-orange" alt="27 Tools"/></a>
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
| **Native deps** | Zero | Often require system libraries |
| **Providers** | 14 (66 models) with automatic failover | 1-4 providers, no failover |
| **Security** | Prompt injection shield, DM pairing, E2E encryption, tool sandboxing | Minimal or none |
| **Memory** | 4 systems (episodic, learning, relationship, temporal graph) | Basic chat history |
| **Multi-computer** | Built-in mesh with mDNS + Tailscale auto-discovery | Manual config or unsupported |
| **Skills** | 27 built-in + drop-in YAML/JS creation | Fixed tool set |
| **Cost control** | Smart routing, daily budgets, context summarization | Uncapped token spend |
| **GUI** | 12-panel Mission Control dashboard | CLI only or basic web UI |
| **Codebase** | ~8K lines TypeScript | 50K-200K+ lines |

---

## Features

### 14 AI Providers, 66 Models

Connect any combination of cloud and local models. TITAN routes, fails over, and load-balances automatically.

```bash
titan model --discover       # Live-detect all available models
titan model --alias fast openai/gpt-4o-mini   # Create shortcuts
titan model --set anthropic/claude-sonnet-4-20250514
```

Built-in aliases: `fast`, `smart`, `cheap`, `reasoning` — fully configurable.

### 27 Built-in Tools

| Category | Tools |
|----------|-------|
| **Shell & Process** | `shell`, `exec`, `process_list`, `process_kill`, `process_spawn` |
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `list_dir`, `apply_patch` |
| **Web** | `web_search`, `web_fetch`, `browser` (CDP), `web_browser` (Playwright) |
| **Intelligence** | `auto_generate_skill`, `analyze_image`, `transcribe_audio`, `generate_speech` |
| **Automation** | `cron`, `webhook` |
| **Memory** | `memory`, `model_switch`, `graph_remember`, `graph_search`, `graph_entities`, `graph_recall` |
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
titan agents spawn --model openai/gpt-4o --name "researcher"
titan agents spawn --model ollama/llama3.1 --name "coder"
titan agents list
```

### Prompt Injection Shield

Three-layer defense against prompt injection attacks:

- **Heuristic engine** — Detects "ignore previous instructions", system prompt extraction, developer mode exploits
- **Strict mode** — Keyword density analysis and tail manipulation detection
- **DM pairing** — New senders must be approved before they can interact with your agent

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
- Context summarization reduces token usage by 30-90%

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

### E2E Encrypted Sessions

AES-256-GCM encryption for sensitive conversations. Keys generated per-session, held in memory only.

---

## Providers

TITAN supports 14 AI providers out of the box. Add your API key and go.

| Provider | Models | Type |
|----------|--------|------|
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4 | Cloud |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3-mini, o1 | Cloud |
| **Google** | Gemini 2.5 Flash/Pro, 2.0 Flash, 1.5 Pro | Cloud |
| **Ollama** | Any locally installed model | Local |
| **Groq** | LLaMA 3.3 70B, Mixtral, Gemma 2 | Cloud (Fast inference) |
| **Mistral** | Mistral Large, Small, Nemo, Codestral | Cloud |
| **OpenRouter** | 290+ models from all providers | Cloud (Aggregator) |
| **Together** | LLaMA 3.1, CodeLlama, Mixtral | Cloud |
| **Fireworks** | LLaMA 3.1, Mixtral, Qwen 2.5 | Cloud (Fast inference) |
| **xAI** | Grok-2, Grok-2-mini | Cloud |
| **DeepSeek** | DeepSeek-V3, DeepSeek-R1 | Cloud |
| **Cerebras** | LLaMA 3.1 (wafer-scale inference) | Cloud (Fast inference) |
| **Cohere** | Command-R+, Command-R | Cloud |
| **Perplexity** | Sonar Large, Sonar Small | Cloud (Search-augmented) |

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

A 12-panel dark-mode dashboard at `http://localhost:48420`.

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
| **Memory Graph** | Visual force-directed graph of entities and relationships |
| **Logs** | Color-coded real-time log viewer with filtering |
| **Recipes** | Manage and trigger reusable workflows |

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
titan skill create "a tool that converts CSV files to JSON"
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
| **WebChat** | Built-in WebSocket | Ready |

All channels support the DM pairing security system. Configure via `~/.titan/titan.json` or Mission Control Settings.

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
| `titan model --alias <name> <model>` | Create a model alias |
| `titan agents` | Multi-agent management |
| `titan mesh --init` | Initialize mesh networking |
| `titan mesh --status` | View mesh peers and models |
| `titan skills` | List installed skills |
| `titan skill create "..."` | Generate a skill with AI |
| `titan pairing` | Manage DM access control |
| `titan doctor` | System diagnostics |
| `titan config` | View/edit configuration |
| `titan graphiti --init` | Initialize knowledge graph |
| `titan graphiti --stats` | Graph statistics |
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
| `node-id` | Mesh networking node identity |
| `logs/` | Daily log files |
| `plans/` | Persistent task planner state |
| `skills/` | Custom user skills (YAML, JS) |
| `recipes/` | Saved recipe workflows |

---

## Development

```bash
npm run build          # tsup ESM production build
npm run test           # vitest (52 tests, 7 files)
npm run ci             # typecheck + full test suite
npm run typecheck      # tsc --noEmit
npm run dev:gateway    # Dev mode with tsx
npm run test:coverage  # Coverage report
```

### Architecture

```
src/
  agent/        Core agent loop, multi-agent, swarm, planner, autonomy
  channels/     Discord, Telegram, Slack, Google Chat, WebChat
  providers/    Anthropic, OpenAI, Google, Ollama + 10 OpenAI-compatible
  memory/       Episodic, learning, relationship, temporal graph
  skills/       27 built-in tools + user skill loader
  security/     Shield, sandbox, encryption, pairing
  gateway/      HTTP/WS server + Mission Control dashboard
  mesh/         mDNS + Tailscale peer discovery, WebSocket transport
  recipes/      Workflow engine + persistence
  mcp/          Model Context Protocol client
  config/       Zod schema + loader
  cli/          Commander.js CLI (12 commands)
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

See [TASKS.md](TASKS.md) for the full development roadmap including Phase 3 and Phase 4 plans.

### Upcoming
- GitHub skill (PR review, issues, repos)
- Email skill (IMAP/SMTP)
- Morning briefing recipe
- Computer use (screenshots, mouse, keyboard)
- WhatsApp channel adapter
- Image generation skill
- PDF parsing skill
- Persistent webhooks
- Plugin marketplace

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## License

MIT License — Copyright (c) 2026 Tony Elliott

Created by [Tony Elliott (Djtony707)](https://github.com/Djtony707)
