# ⚡ TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>Your own personal AI assistant. Any OS. Any platform. Superior by design.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tools">Tools</a> •
  <a href="#channels">Channels</a> •
  <a href="#multi-agent">Multi-Agent</a> •
  <a href="#security">Security</a> •
  <a href="#docker">Docker</a>
</p>

---

## Quick Start

```bash
# Install globally
npm install -g titan-agent

# Run the interactive setup wizard
titan onboard

# Start the gateway (control plane + dashboard)
titan gateway

# Send a direct message
titan agent -m "What files are in my home directory?"
```

**Requirements:** Node.js ≥ 20, npm ≥ 9

---

## Features

### 🤖 Multi-Agent System (up to 5 concurrent agents)
- Spawn independent agent instances with different models/prompts
- Channel-based routing — each agent can bind to specific channels
- Manage via CLI (`titan agents`) or API (`/api/agents`)

### 🧠 Continuous Learning Engine
- Tracks tool success rates and error patterns across interactions
- Builds a persistent knowledge base that grows with every conversation
- Injects learned context into the system prompt — TITAN gets smarter over time
- Records user corrections and adapts behavior

### 🔧 Comprehensive Tool Suite (17+ built-in)
| Tool Group | Tools | Description |
|-----------|-------|-------------|
| **Runtime** | `exec`, `process`, `shell` | Background execution, process management, timeouts |
| **Filesystem** | `read`, `write`, `edit`, `list_dir`, `apply_patch` | Full file operations + unified diff patching |
| **Web** | `web_search`, `web_fetch`, `browser` | Search, page extraction, CDP browser control |
| **Automation** | `cron`, `webhook` | Scheduled tasks, HTTP webhook endpoints |
| **Memory** | `memory`, `learning` | Persistent facts, preferences, continuous learning |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_close` | Inter-agent session management |

### 📡 10+ Channel Adapters
Discord · Telegram · Slack · Google Chat · WebChat · WhatsApp · Matrix · Signal · Microsoft Teams · BlueBubbles

### 🔐 Security Model
- Default: tools run on the host for the main session (full access when it's just you)
- Group/channel safety: Docker sandbox for non-main sessions
- DM pairing security (approve/deny new senders)
- Tool/path/network allowlisting

### 🌐 Gateway Dashboard
- Dark-mode web UI served from the gateway
- Real-time WebSocket updates
- Panels: Overview, WebChat, Agents, Sessions, Skills, Channels, Security

### 🤝 Model Agnostic
- **Anthropic** (Claude) · **OpenAI** (GPT) · **Google** (Gemini) · **Ollama** (local models)
- Automatic provider failover
- Model resolution from `provider/model` syntax

---

## Architecture

```
Discord / Telegram / Slack / Google Chat / WebChat / WhatsApp / ...
                           │
                           ▼
                ┌──────────────────────┐
                │      Gateway         │
                │  (control plane)     │
                │  ws://127.0.0.1:18789│
                └─────────┬────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
   Multi-Agent       Dashboard           REST API
    Router            WebUI             /api/*
        │
  ┌─────┴──────┐
  │ Agent 1..5 │  ← Independent models, prompts, sessions
  └─────┬──────┘
        │
  ┌─────┴──────┐
  │  Tool      │  ← 17+ built-in skills
  │  Runner    │
  └─────┬──────┘
        │
  ┌─────┴──────┐
  │  Learning  │  ← Continuous improvement
  │  Engine    │
  └────────────┘
```

### Directory Structure

```
~/.titan/
├── titan.json          # Configuration
├── knowledge.json      # Learning engine knowledge base
├── memory/             # Persistent memory store
├── logs/               # Log files
└── workspace/
    ├── AGENTS.md       # Agent behavior instructions (injected)
    ├── SOUL.md         # Personality customization (injected)
    ├── TOOLS.md        # Tool usage notes (injected)
    └── skills/         # Workspace skills
        └── <skill>/SKILL.md
```

---

## Tools

### Runtime
- **exec** — Execute shell commands with background support, timeouts (up to 30 min), working directory. Returns `sessionId` for background processes.
- **process** — Manage background processes: `list`, `poll`, `log`, `write` (stdin), `kill`, `clear`.
- **shell** — Simple synchronous command execution.

### Filesystem
- **read_file** / **write_file** / **edit_file** / **list_dir** — Full file operations.
- **apply_patch** — Apply unified diff patches (like `git diff` output). Creates new files, handles hunks.

### Web
- **web_search** — DuckDuckGo search (no API key required).
- **web_fetch** — Fetch any URL, extract as markdown or text with configurable max chars.
- **browser** — CDP-based browser control: navigate, snapshot, extract, evaluate JS, click, type, screenshot.

### Automation
- **cron** — Create, list, remove scheduled tasks.
- **webhook** — Register and manage HTTP webhook endpoints.

### Sessions
- **sessions_list** — List all active agent sessions.
- **sessions_history** — Get message history for a session.
- **sessions_send** — Send messages across sessions (inter-agent communication).
- **sessions_close** — Close a specific session.

### Memory
- **memory** — Store and retrieve persistent facts and preferences.

---

## Multi-Agent

TITAN supports up to **5 concurrent agent instances**, each with:
- Independent model selection
- Custom system prompts
- Channel bindings for routing
- Isolated session tracking

```bash
# List agents
titan agents --list

# Spawn a specialist agent
titan agents --spawn "Code Reviewer" --model openai/gpt-4o

# Stop an agent
titan agents --stop <agent-id>
```

**API:**
```bash
# List agents
GET /api/agents

# Spawn
POST /api/agents/spawn  { "name": "Writer", "model": "anthropic/claude-sonnet-4-20250514" }

# Stop
POST /api/agents/stop   { "agentId": "abc12345" }
```

---

## Channels

| Channel | Status | Setup |
|---------|--------|-------|
| **WebChat** | Built-in | Automatic — served from gateway |
| **Discord** | Supported | Set `DISCORD_TOKEN` |
| **Telegram** | Supported | Set `TELEGRAM_TOKEN` |
| **Slack** | Supported | Set `SLACK_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` |
| **Google Chat** | Supported | Configure service account |
| **WhatsApp** | Config ready | Channel config in `titan.json` |
| **Matrix** | Config ready | Channel config in `titan.json` |
| **Signal** | Config ready | Channel config in `titan.json` |
| **MS Teams** | Config ready | Channel config in `titan.json` |
| **BlueBubbles** | Config ready | Channel config in `titan.json` |

---

## Security

### DM Pairing
New DM senders are quarantined until approved:

```bash
# List pending pairing requests
titan pairing --list

# Approve a sender
titan pairing --approve discord ABC123

# Deny
titan pairing --deny ABC123

# List approved users
titan pairing --approved
```

### Sandbox Modes
| Mode | Description |
|------|-------------|
| `host` | Tools run directly on the host (default for main user) |
| `docker` | Non-main sessions run in per-session Docker containers |
| `none` | No sandboxing (not recommended for shared access) |

---

## Configuration

Minimal `~/.titan/titan.json`:

```json
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic/Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `DISCORD_TOKEN` | Discord bot token |
| `TELEGRAM_TOKEN` | Telegram bot token |
| `SLACK_TOKEN` / `SLACK_SIGNING_SECRET` / `SLACK_APP_TOKEN` | Slack credentials |
| `TITAN_MODEL` | Override default model |
| `TITAN_GATEWAY_PORT` | Override gateway port (default: 18789) |
| `TITAN_LOG_LEVEL` | Log level: debug/info/warn/error |

---

## Docker

```bash
# Build
docker build -t titan .

# Run with docker-compose
docker-compose up -d
```

The Docker setup uses:
- Multi-stage Alpine build (small image)
- Non-root user for security
- Health check endpoint
- Persistent data volume at `~/.titan`

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `titan onboard` | Interactive setup wizard |
| `titan gateway` | Start the gateway server |
| `titan agent -m "..."` | Send a direct message to the agent |
| `titan send --to ch:id -m "..."` | Send to a specific channel destination |
| `titan pairing` | Manage DM pairing approvals |
| `titan agents` | Manage multiple agent instances |
| `titan doctor` | Run diagnostics |
| `titan skills` | List/manage skills |
| `titan config` | View/edit configuration |
| `titan update` | Update to latest version |

---

## Comparison

| Feature | TITAN | OpenClaw |
|---------|-------|----------|
| Multi-agent (concurrent) | ✅ Up to 5 | ✅ |
| Continuous learning | ✅ Built-in | ❌ |
| Browser control | ✅ CDP | ✅ CDP |
| Background processes | ✅ exec+process | ✅ exec+process |
| Apply patch | ✅ | ✅ |
| Web fetch (markdown) | ✅ | ✅ |
| Session tools | ✅ | ✅ |
| DM pairing | ✅ | ✅ |
| Model failover | ✅ | ✅ |
| Workspace prompts | ✅ AGENTS/SOUL/TOOLS.md | ✅ |
| Docker sandbox | ✅ | ✅ |
| Local models (Ollama) | ✅ | ✅ |
| Channel count | 10+ | 12+ |
| Dashboard | ✅ Dark-mode | ✅ |
| npm install (no native deps) | ✅ Pure JS | ❌ (native deps) |

---

## Credits

**Project Creator / Owner:** [Tony Elliott](https://github.com/Djtony707)

### Acknowledgments

TITAN's architecture is inspired by and built upon patterns from the open-source community:

- **[OpenClaw](https://github.com/openclaw/openclaw)** — The original personal AI assistant framework. TITAN's gateway architecture, skills system, session model, channel adapters, and security model are inspired by OpenClaw's excellent design. MIT License. Thank you to the OpenClaw team for pioneering this approach.

- **[Anthropic](https://www.anthropic.com)** — Claude API and the Anthropic SDK
- **[OpenAI](https://openai.com)** — GPT API and the OpenAI SDK
- **[Google](https://ai.google.dev)** — Gemini API and the Google Generative AI SDK
- **[Ollama](https://ollama.ai)** — Local LLM support
- **[discord.js](https://discord.js.org)** — Discord bot framework
- **[grammY](https://grammy.dev)** — Telegram bot framework
- **[Bolt](https://slack.dev/bolt-js)** — Slack app framework
- **[Zod](https://zod.dev)** — TypeScript schema validation
- **[Commander.js](https://github.com/tj/commander.js)** — CLI framework
- **[Express](https://expressjs.com)** — HTTP/WS server
- **[ws](https://github.com/websockets/ws)** — WebSocket library
- **[chalk](https://github.com/chalk/chalk)** — Terminal styling
- **[uuid](https://github.com/uuidjs/uuid)** — UUID generation
- **[Vitest](https://vitest.dev)** — Testing framework

---

## License

MIT License — Copyright (c) 2026 Tony Elliott. See [LICENSE](LICENSE) for details.
