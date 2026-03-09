# TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>An autonomous AI agent framework that actually does things. Sub-agent orchestration, goal-driven autopilot, deliberative reasoning, sandbox code execution, 15 channels, 34 providers, ~112 tools, ~3,561 tests. Pure JavaScript. No native compilation. No, seriously.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/titan-agent"><img src="https://img.shields.io/npm/v/titan-agent?color=blue&label=npm" alt="npm version"/></a>
  <a href="https://github.com/Djtony707/TITAN/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"/></a>
  <a href="#providers"><img src="https://img.shields.io/badge/providers-34-purple" alt="34 Providers"/></a>
  <a href="#built-in-tools"><img src="https://img.shields.io/badge/tools-112-orange" alt="112 Tools"/></a>
  <a href="#channels"><img src="https://img.shields.io/badge/channels-15-blue" alt="15 Channels"/></a>
  <a href="#tests"><img src="https://img.shields.io/badge/tests-3%2C561-brightgreen" alt="3,561 Tests"/></a>
</p>

<p align="center">
  <a href="https://railway.app/template/titan-agent"><img src="https://railway.app/button.svg" alt="Deploy on Railway" height="32"/></a>
  &nbsp;
  <a href="https://render.com/deploy?repo=https://github.com/Djtony707/TITAN"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32"/></a>
  &nbsp;
  <a href="https://replit.com/github/Djtony707/TITAN"><img src="https://replit.com/badge/github/Djtony707/TITAN" alt="Run on Replit" height="32"/></a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/Djtony707"><img src="https://img.shields.io/badge/%E2%9D%A4%EF%B8%8F_Sponsor-ea4aaa?style=for-the-badge&logo=github" alt="Sponsor on GitHub"/></a>
</p>

<p align="center">
  <em>TITAN is built solo by <a href="https://github.com/Djtony707">Tony Elliott</a> — a single father, college student studying AI Software Engineering, and open-source builder. I was laid off in October 2025 and have been building TITAN between classes and raising my kids on my own. If this project helps you, please consider sponsoring. Every dollar makes a real difference for my family right now.</em>
</p>

<p align="center">
  <a href="SUPPORTERS.md">View all supporters</a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#what-titan-does">What It Does</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#autonomy-system">Autonomy</a> &bull;
  <a href="#mission-control">Mission Control</a> &bull;
  <a href="#channels">Channels</a> &bull;
  <a href="#providers">Providers</a> &bull;
  <a href="#voice-pipeline">Voice</a> &bull;
  <a href="#mesh-networking">Mesh</a> &bull;
  <a href="#sandbox-code-execution">Sandbox</a> &bull;
  <a href="#cli-reference">CLI</a>
</p>

---

> **WARNING — EXPERIMENTAL SOFTWARE**
> TITAN is experimental, actively developed software. It can execute shell commands, modify files, access the network, and take autonomous actions on your system. **Use at your own risk.** Think of it less as "software you install" and more as "a very motivated intern with root access." The author and contributors provide this software "as is" without warranty of any kind. By installing or running TITAN, you accept full responsibility for any consequences, including but not limited to data loss, system instability, unintended actions, API charges, or security issues. Always review TITAN's configuration, run it in supervised mode first, and never grant it access to systems or credentials you cannot afford to lose. See [LICENSE](LICENSE) for the full legal terms.

---

## Quick Start

**Requirements:** Node.js >= 20, an API key, and a healthy sense of adventure.

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/Djtony707/TITAN/main/install.sh | bash
```

This detects your OS, installs Node.js if needed (via nvm), installs `titan-agent` globally, and launches the onboarding wizard.

### Manual Install

```bash
npm install -g titan-agent
titan onboard             # Interactive setup — pick a provider, paste your API key, give TITAN a soul
titan gateway             # Launch Mission Control at http://localhost:48420
```

### Docker

```bash
docker run -d -p 48420:48420 --name titan \
  -e ANTHROPIC_API_KEY=your-key \
  -v titan-data:/home/titan/.titan \
  ghcr.io/djtony707/titan:latest
```

Or with docker-compose:

```bash
git clone https://github.com/Djtony707/TITAN.git && cd TITAN
cp .env.example .env     # Edit with your API keys
docker compose up -d
```

That's it. From zero to a running autonomous agent with a dashboard.

### From Source

```bash
git clone https://github.com/Djtony707/TITAN.git && cd TITAN
npm install
npm run dev:gateway       # Start in dev mode
```

### First Contact

```bash
titan agent -m "Hello"                  # Terminal chat
titan agent -m "What's on my calendar?" # Uses tools automatically
```

Or open `http://localhost:48420` and use the WebChat panel. Same agent, nicer UI.

---

## What TITAN Does

TITAN is not a chatbot wrapper. It's a framework for building AI agents that take real actions. Here's what that looks like in practice:

**"Research competitors and draft a report"**
TITAN enters deliberation mode. It decomposes the task into subtasks, spawns a browser sub-agent to research each competitor in parallel, synthesizes findings, writes a structured report, and saves it to disk. You approve the plan before execution starts.

**"Monitor Upwork for Node.js contracts and send me the best ones"**
TITAN creates a recurring goal. Every cycle, it searches freelance platforms, scores matches against your profile, drafts proposals, and queues them for your review. The autopilot handles scheduling.

**"Set up a content pipeline for my blog"**
TITAN researches SEO keywords, generates outlines, writes drafts, and schedules publishing. Each step uses specialized tools — `web_search` for research, `content_outline` for structure, `content_publish` for output.

**"What did I spend on APIs this month?"**
TITAN queries the income tracker, pulls cost data from provider logs, runs the numbers in a sandbox Python script, and returns a summary with a chart.

**"Deploy this to my mini PC"**
TITAN SSHs into the target machine via the mesh network, pulls the latest code, builds the Docker container, and reports back. All through the `shell` tool with mesh routing.

No custom code required for any of the above. TITAN ships with 36 built-in skills exposing 95 tools. When it needs a capability it doesn't have, it can generate a new skill on the fly.

---

## Architecture at a Glance

```
                          CLI Interface
  onboard | gateway | agent | mesh | doctor | config | autopilot
                              |
                      Gateway Server
            HTTP + WebSocket Control Plane
        Express REST API | Dashboard | WS Broadcast
                              |
            +-----------------+-----------------+
            |                 |                 |
      Multi-Agent        Channel           Security
      Router (1-5)       Adapters (9)      Sandbox + Pairing
            |            Discord            Shield + Vault
      Agent Core         Telegram           Audit Log
      Session Mgmt       Slack
      Reflection         WhatsApp           Browsing
      Sub-Agents         Teams              Browser Pool
      Orchestrator       Google Chat        Stagehand
      Goals              Matrix
      Initiative         Signal              Mesh
            |            WebChat             mDNS + Tailscale
       +----+----+--------+                 Peer Discovery
       |         |         |                WS Transport
    Skills    LLM Providers  Voice
    39 files  34 providers   LiveKit WebRTC
    ~112 tools (4 native +   (STT + TTS)
       |       30 compat)
    Memory + Learning
    Graph + Relationship
    Briefings
```

Full architecture details: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Autonomy System

TITAN v2026.6.7 introduced a complete autonomy overhaul. This isn't just tool calling — it's self-directed goal pursuit with reflection, delegation, and initiative.

### Reflection

Every N tool-call rounds, TITAN pauses and asks itself: "Am I making progress? Should I continue, change approach, or stop?" Uses the `fast` model alias for cheap, quick self-checks. Prevents runaway loops and wasted tokens.

### Sub-Agents

The `spawn_agent` tool delegates tasks to isolated sub-agents with constrained toolsets. Four templates:

| Template | Tools | Use Case |
|----------|-------|----------|
| `explorer` | Web search, fetch, browse | Research and information gathering |
| `coder` | Shell, filesystem, edit | Code generation and modification |
| `browser` | Browser pool, Stagehand | Interactive web automation |
| `analyst` | Memory, data analysis | Analysis and synthesis |

Max depth = 1 (no sub-sub-agents). Each sub-agent gets its own session and returns results to the parent.

### Orchestrator

When a task involves multiple independent subtasks, the orchestrator:

1. Analyzes the request for delegation potential
2. Breaks it into parallel and sequential assignments
3. Spawns sub-agents for each
4. Runs independent tasks in parallel, dependent tasks sequentially
5. Synthesizes all results into a unified response

### Goals

Persistent goals with subtasks, scheduling, budget tracking, and progress monitoring. Goals drive the autopilot system — each cycle picks the next actionable subtask.

```
You: "I want to grow my Twitter following to 10K"

TITAN creates a goal with subtasks:
  1. Analyze current posting patterns        [complete]
  2. Research trending topics in your niche   [complete]
  3. Draft 5 tweets for review               [in_progress]
  4. Schedule optimal posting times           [pending]
  5. Monitor engagement metrics weekly        [recurring]
```

Tools: `goal_create`, `goal_list`, `goal_update`, `goal_delete`

### Self-Initiative

After completing a goal subtask, TITAN checks for the next ready task. In autonomous mode, it starts working immediately. In supervised mode, it proposes the next action. Rate-limited to prevent runaway execution.

### Autonomy Modes

| Mode | Behavior |
|------|----------|
| `autonomous` | Full auto — executes all tools, auto-triggers deliberation, self-initiates goal subtasks |
| `supervised` | Asks before dangerous operations, proposes next steps (default) |
| `locked` | Asks permission for every tool call |

```bash
titan config set autonomy.mode supervised
```

### Deliberative Reasoning

When TITAN detects an ambitious request, it enters a multi-stage loop:

1. **Analyze** — Examines the request from multiple angles using high thinking
2. **Plan** — Generates a structured, dependency-aware execution plan
3. **Approve** — Presents the plan for your review
4. **Execute** — Runs each step, reporting progress via WebSocket
5. **Adapt** — Re-analyzes and adjusts if a step fails

```bash
/plan figure out how to monetize this homelab     # Force deliberation
/plan status                                        # Check progress
/plan cancel                                        # Abort
```

---

## Mission Control

A 12-panel dark-mode dashboard at `http://localhost:48420`.

| Panel | What It Does |
|-------|-------------|
| **Overview** | System health, uptime, memory usage, model info, cost stats |
| **WebChat** | Real-time chat with your agent via WebSocket |
| **Agents** | Spawn, stop, and monitor up to 5 agent instances |
| **Settings** | 6-tab live config: AI, Providers, Channels, Security, Gateway, Profile |
| **Channels** | Connection status for all 9 channel adapters |
| **Skills** | 36 installed skills with per-skill enable/disable toggles |
| **Sessions** | Active sessions with message counts and history |
| **Learning** | Tool success rates and knowledge base stats |
| **Autopilot** | Schedule, status, history, and run control |
| **Security** | Audit log viewer and DM pairing management |
| **Logs** | Color-coded real-time log viewer with filtering |
| **Mesh** | Peer management — approve, reject, revoke connections |
| **Memory Graph** | Visual force-directed graph of entities and relationships |

Settings includes a SOUL.md live editor (Profile tab) and Google OAuth connection manager (Providers tab). All changes take effect without restarting the gateway.

---

## Channels

TITAN connects to 9 messaging platforms. All support the DM pairing security system.

| Channel | Library | Notes |
|---------|---------|-------|
| **Discord** | discord.js | Full bot integration |
| **Telegram** | grammY | Bot API with webhook support |
| **Slack** | @slack/bolt | Workspace app integration |
| **WhatsApp** | Baileys | No official API needed |
| **Microsoft Teams** | botbuilder | Enterprise integration |
| **Google Chat** | Webhooks | Real webhook-based adapter |
| **Matrix** | matrix-js-sdk | Decentralized chat support |
| **Signal** | signal-cli REST | Privacy-focused messaging |
| **WebChat** | Built-in WebSocket | Included in Mission Control |

Configure via `~/.titan/titan.json` or the Mission Control Settings panel.

---

## Providers

21 AI providers. Add your API key and go. TITAN routes, fails over, and load-balances automatically.

| Provider | Type | Notable Models |
|----------|------|----------------|
| **Anthropic** | Native | Claude Opus 4, Sonnet 4, Haiku 4, 3.5 Sonnet/Haiku |
| **OpenAI** | Native | GPT-4o, GPT-4o-mini, o1, o3-mini |
| **Google** | Native | Gemini 2.5 Pro/Flash, 2.0 Flash |
| **Ollama** | Native | Any locally installed model |
| **Groq** | OpenAI-compat | LLaMA 3.3 70B, Mixtral, DeepSeek-R1 Distill |
| **Mistral** | OpenAI-compat | Mistral Large, Codestral, Nemo |
| **OpenRouter** | OpenAI-compat | 290+ models from all providers |
| **Together** | OpenAI-compat | LLaMA 3.3, DeepSeek-R1, Qwen 2.5 |
| **Fireworks** | OpenAI-compat | LLaMA 3.3, Mixtral, Qwen 3 |
| **xAI** | OpenAI-compat | Grok-3, Grok-3-fast, Grok-3-mini |
| **DeepSeek** | OpenAI-compat | DeepSeek Chat, DeepSeek Reasoner |
| **Cerebras** | OpenAI-compat | LLaMA 3.3, Qwen 3 |
| **Cohere** | OpenAI-compat | Command-R+, Command-R |
| **Perplexity** | OpenAI-compat | Sonar, Sonar Pro, Sonar Reasoning |
| **Venice AI** | OpenAI-compat | LLaMA 3.3 70B, DeepSeek-R1 671B |
| **AWS Bedrock** | OpenAI-compat | Claude, Titan Text, LLaMA 3 (via proxy) |
| **LiteLLM** | OpenAI-compat | Any model via universal proxy |
| **Azure OpenAI** | OpenAI-compat | GPT-4o, GPT-4o-mini, o1 |
| **DeepInfra** | OpenAI-compat | LLaMA 3.3, Mixtral 8x22B, Qwen 2.5 |
| **SambaNova** | OpenAI-compat | LLaMA 3.3, DeepSeek-R1 Distill |
| **Kimi** | OpenAI-compat | Kimi K2.5 |

**4 native providers** with full API integration. **17 OpenAI-compatible providers** that work through a unified adapter. All 21 support automatic failover — your agent stays up even when OpenAI doesn't.

```bash
titan model --discover                              # Live-detect all available models
titan model --set anthropic/claude-sonnet-4-20250514
titan model --alias fast=openai/gpt-4o-mini         # Create shortcuts
```

Built-in aliases: `fast`, `smart`, `cheap`, `reasoning`, `local` — fully configurable.

> Running locally? See [docs/MODELS.md](docs/MODELS.md) for GPU-tiered Ollama model recommendations.

---

## Voice (LiveKit WebRTC)

TITAN's real-time voice uses [LiveKit](https://livekit.io/) — a production-grade WebRTC platform that handles echo cancellation, NAT traversal, codec negotiation, and jitter buffering. No custom audio pipelines, no PCM-over-WebSocket hacks.

**How it works:**
1. Click "Start Voice" in Mission Control
2. TITAN fetches a scoped JWT token (`POST /api/livekit/token`)
3. Browser connects to a LiveKit room via WebRTC
4. LiveKit's agent worker bridges STT → TITAN's agent brain → TTS
5. You talk, TITAN responds — sub-second latency, full duplex

**Deployment options:**
- **LiveKit Cloud** — zero infrastructure, set `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
- **Self-hosted** — run `livekit-server` on your own hardware

The file-based voice tools (`generate_speech`, `transcribe_audio`) still work independently via the OpenAI API for offline use cases.

---

## Mesh Networking

Connect up to 5 machines so they share AI models and API keys. One machine has a GPU? The others can use its local models. One machine has an OpenAI key? Everyone benefits.

TITAN finds your other machines automatically via mDNS on your local network, or via Tailscale if they're remote.

### Quick Setup

**Machine 1** (your GPU desktop):
```bash
titan mesh --init         # Generates a secret: TITAN-a1b2-c3d4-e5f6
titan gateway
```

**Machine 2** (your laptop):
```bash
titan mesh --join "TITAN-a1b2-c3d4-e5f6"
titan gateway
```

Machine 2 discovers Machine 1 automatically. You approve the connection (or enable `--auto-approve`), and both machines now share all available models.

### How Routing Works

1. **Local first** — If your machine has the model, it runs locally
2. **Mesh fallback** — If not, TITAN checks connected peers
3. **Provider failover** — Last resort, tries other local providers

### Approval System

New peers are quarantined until approved. Manage from CLI or the Mesh dashboard panel:

```bash
titan mesh --pending                    # See who's waiting
titan mesh --approve <nodeId>           # Allow connection
titan mesh --reject <nodeId>            # Deny connection
titan mesh --revoke <nodeId>            # Disconnect an approved peer
titan mesh --auto-approve               # Trust all peers with your secret
```

Approved peers persist to `~/.titan/approved-peers.json` and reconnect automatically on restart.

### Remote Machines (Tailscale)

```json
{
  "mesh": {
    "enabled": true,
    "tailscale": true
  }
}
```

Or add static peers manually: `titan mesh --add "192.168.1.100:48420"`

---

## MCP Server Mode

TITAN can act as an **MCP server**, exposing all ~112 tools to other AI agents via the [Model Context Protocol](https://modelcontextprotocol.io/). Claude Code, Cursor, Windsurf, or any MCP client can connect and use TITAN's tools.

**HTTP transport** (runs on the gateway port):
```json
// titan.json
{ "mcp": { "server": { "enabled": true } } }
```
Then any MCP client can connect to `http://localhost:48420/mcp`.

**Stdio transport** (launch TITAN as a subprocess):
```json
// claude_desktop_config.json or .cursor/mcp.json
{
  "mcpServers": {
    "titan": {
      "command": "npx",
      "args": ["titan-agent", "mcp-server"]
    }
  }
}
```

Security: MCP server respects the same `security.deniedTools` and `security.allowedTools` config as the gateway.

---

## Sandbox Code Execution

When the LLM needs to run complex logic — loops, data processing, batch operations — it writes Python and executes it in an isolated Docker container. Tool calls from inside the sandbox route through a secure HTTP bridge back to TITAN.

```
Traditional approach: 50 individual tool calls x LLM round-trips = bloated context + slow
Sandbox approach:     1 Python script with a for-loop = fast, accurate, minimal tokens
```

The LLM writes code like this:
```python
from tools import web_search, read_file

results = []
for topic in ["AI agents", "LLM tools", "code sandbox"]:
    data = web_search(query=topic)
    results.append(data)

print(f"Found {len(results)} results")
```

**Security:** Containers run with `--cap-drop=ALL`, `--read-only`, `--security-opt=no-new-privileges`, memory/CPU limits, and session-token authenticated bridge. Dangerous tools (`shell`, `exec`, `process`) are blocked inside the sandbox.

```json
{
  "sandbox": {
    "enabled": true,
    "timeoutMs": 60000,
    "memoryMB": 512,
    "deniedTools": ["shell", "exec", "code_exec", "process", "apply_patch"]
  }
}
```

---

## Built-in Tools

39 skills exposing ~112 tools. All individually toggleable from Mission Control.

| Category | Tools |
|----------|-------|
| **Shell & Process** | `shell`, `exec`, `process` (list, kill, spawn, poll, log) |
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `list_dir`, `apply_patch` |
| **Web** | `web_search`, `web_fetch`, `web_read`, `web_act`, `browser` (CDP), `browse_url`, `browser_search`, `browser_auto_nav` |
| **Intelligence** | `auto_generate_skill`, `analyze_image`, `transcribe_audio`, `generate_speech` |
| **GitHub** | `github_repos`, `github_issues`, `github_prs`, `github_commits`, `github_files` |
| **Email** | `email_send`, `email_search`, `email_read`, `email_list` (Gmail OAuth + SMTP) |
| **Computer Use** | `screenshot`, `mouse_click`, `mouse_move`, `keyboard_type`, `keyboard_press`, `screen_read` |
| **Data & Documents** | `data_analysis`, `csv_parse`, `csv_stats`, `pdf_read`, `pdf_info` |
| **Smart Home** | `ha_devices`, `ha_control`, `ha_status` |
| **Image Generation** | `generate_image`, `edit_image` |
| **Weather** | `weather` (real-time via wttr.in, no API key) |
| **Automation** | `cron`, `webhook` |
| **Memory** | `memory`, `switch_model`, `graph_remember`, `graph_search`, `graph_entities`, `graph_recall` |
| **Sandbox** | `code_exec` (Python/JS in isolated Docker with tool bridge) |
| **Meta** | `tool_search` (discover tools on demand), `plan_task` (deliberative planning) |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_close` |
| **Income Tracking** | `income_log`, `income_summary`, `income_list`, `income_goal` |
| **Freelance** | `freelance_search`, `freelance_match`, `freelance_draft`, `freelance_track` |
| **Content** | `content_research`, `content_outline`, `content_publish`, `content_schedule` |
| **Lead Gen** | `lead_scan`, `lead_score`, `lead_queue`, `lead_report` |
| **Goals** | `goal_create`, `goal_list`, `goal_update`, `goal_delete` |
| **X/Twitter** | `x_post`, `x_reply`, `x_search`, `x_review` |
| **Sub-Agents** | `spawn_agent` (delegate to isolated sub-agents) |

### Tool Search — Compact Mode

TITAN doesn't dump all 95 tool schemas into every LLM call. It sends only 8 core tools plus `tool_search`. When the LLM needs a capability, it calls `tool_search("email")` and gets the relevant tools added dynamically.

```
Before: 95 tools x ~50 tokens each = ~4,750 input tokens
After:  10 core tools + tool_search  = ~700 input tokens (85% reduction)
```

Works with all 21 providers. Especially beneficial for smaller local models where context window is precious.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `titan onboard` | Interactive setup wizard (profile, soul, provider, autonomy) |
| `titan gateway` | Start Mission Control + API server |
| `titan agent -m "..."` | Send a message from the terminal |
| `titan send --to ch:id -m "..."` | Message a specific channel |
| `titan model --list` | Show all configured models |
| `titan model --discover` | Live-detect available models |
| `titan model --set <model>` | Switch the active model |
| `titan model --alias <name>=<model>` | Create a model alias |
| `titan agents` | Multi-agent management (spawn, stop, list) |
| `titan mesh --init` | Initialize mesh networking |
| `titan mesh --status` | View peers, pending, and shared models |
| `titan mesh --pending` | Show peers waiting for approval |
| `titan mesh --approve <id>` | Approve a discovered peer |
| `titan mesh --reject <id>` | Reject a pending peer |
| `titan mesh --revoke <id>` | Disconnect an approved peer |
| `titan mesh --auto-approve` | Toggle auto-approve mode |
| `titan skills` | List installed skills |
| `titan skills --create "..."` | Generate a skill with AI |
| `titan skills --scaffold --name <n> --format js\|ts\|yaml` | Scaffold a skill project from template |
| `titan create-skill <name>` | Alias for skill scaffolding |
| `titan skills --test <name>` | Test a skill with sample arguments |
| `titan mcp-server` | Launch as stdio MCP server for external clients |
| `titan teams` | List teams |
| `titan teams --create <name>` | Create a new team |
| `titan teams --info <teamId>` | Show team details and members |
| `titan teams --add-member <teamId> --user <id> --role <role>` | Add a team member |
| `titan teams --invite <teamId>` | Generate invite code |
| `titan teams --join <code>` | Join a team via invite |
| `titan teams --set-role <teamId> --user <id> --role <role>` | Change member role |
| `titan pairing` | Manage DM access control |
| `titan doctor` | System diagnostics |
| `titan doctor --fix` | Auto-fix detected issues |
| `titan vault` | Manage encrypted secrets vault |
| `titan config [key]` | View/edit configuration |
| `titan graphiti --init` | Initialize knowledge graph |
| `titan graphiti --stats` | Graph statistics |
| `titan mcp` | Manage MCP servers (client + server mode) |
| `titan recipe --list` | List and run saved recipes |
| `titan monitor` | Manage proactive monitors |
| `titan autopilot --init` | Create AUTOPILOT.md checklist |
| `titan autopilot --run` | Trigger immediate autopilot run |
| `titan autopilot --enable` | Toggle autopilot scheduling |
| `titan autopilot --status` | View schedule and last run info |
| `titan update` | Update to latest version |

---

## Custom Skills

Create new tools in seconds. Use the scaffolding CLI or drop files into `~/.titan/skills/`:

### Scaffold a Skill (Recommended)

```bash
# Generate a full skill project with template, metadata, and tests
titan create-skill my_tool --format ts

# Or use the long form
titan skills --scaffold --name my_tool --format js --description "Fetches data" --author "Your Name"

# Test your skill
titan skills --test my_tool
```

This creates `~/.titan/skills/my_tool/` with the skill source, `SKILL.md` metadata, and a test file.

### YAML (Easiest)

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

### JavaScript

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

### AI-Generated

```bash
titan skills --create "a tool that converts CSV files to JSON"
```

TITAN writes, compiles, and hot-loads the skill instantly.

---

## Security

Defense-in-depth, not "we'll add auth later."

| Layer | What It Does |
|-------|-------------|
| **Prompt Injection Shield** | Two-layer detection — heuristic engine + keyword density analysis |
| **DM Pairing** | New senders quarantined until approved |
| **Sandbox** | Docker isolation with `--cap-drop=ALL`, read-only filesystem, memory limits |
| **Secrets Vault** | AES-256-GCM encrypted credential store with PBKDF2 key derivation |
| **Audit Log** | HMAC-SHA256 chained tamper-evident JSONL trail |
| **E2E Encryption** | AES-256-GCM per-session encryption, keys held in memory only |
| **Tool Allowlists** | Configurable per-agent tool permissions |
| **Network Allowlists** | Configurable outbound connection boundaries |
| **Autonomy Gates** | Risk classification with human-in-the-loop approval |

---

## Memory Systems

| System | Storage | Purpose |
|--------|---------|---------|
| **Episodic** | `~/.titan/titan-data.json` | Conversation history per session |
| **Learning** | `~/.titan/knowledge.json` | Tool success/failure rates, error patterns, resolutions |
| **Relationship** | `~/.titan/profile.json` | User preferences, work context, personal continuity |
| **Temporal Graph** | `~/.titan/graph.json` | Entities, episodes, relationships — searchable across time |

The temporal graph is pure TypeScript — no Neo4j, no Docker, no external services. Entities are extracted from conversations automatically, linked with timestamps, and injected into every system prompt.

---

## Development

```bash
npm run build          # tsup ESM production build
npm run test           # vitest (3,323 tests across 94 files)
npm run test:coverage  # ~82% line coverage
npm run ci             # typecheck + full test suite
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run dev:gateway    # Dev mode with tsx hot-reload
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide and [ARCHITECTURE.md](ARCHITECTURE.md) for the codebase layout.

---

## Roadmap

### Recently Shipped (v2026.6.x)

- **v2026.6.7**: Autonomy Overhaul — reflection, sub-agents, orchestrator, goals, initiative, shared browser pool, Stagehand browser automation, X/Twitter integration, deliberation fallback fix. 3,323 tests across 94 files.

### Previously Shipped (v2026.5.x)

- **v2026.5.17**: GitHub-hosted Skills Marketplace, dynamic model dropdown, 3,171 tests
- **v2026.5.14**: Income Automation Skills (16 new tools), autopilot playbooks, per-skill toggles
- **v2026.5.13**: Kimi K2.5 provider, web_read + web_act tools
- **v2026.5.11**: Deliberative Reasoning, Gmail OAuth, Soul Onboarding, 2,860+ tests
- **v2026.5.9**: Small model tool reduction, config validation, stall detector
- **v2026.5.4**: Secrets vault, audit log, self-healing doctor, 3 new providers

### Upcoming

- **Vector Search & RAG** — SQLite FTS5 + embeddings for semantic memory
- **Team Mode & RBAC** — Role-based access control for multi-user deployments

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```bash
git clone https://github.com/Djtony707/TITAN.git && cd TITAN
npm install
npm run dev:gateway
```

We don't bite. Unless you submit a PR that adds `is-even` as a dependency.

---

## Acknowledgments

### Architectural Inspiration

- **[OpenClaw](https://github.com/openclaw/openclaw)** by [Peter Steinberger](https://github.com/steipete) — TITAN's architecture, CLI surface, tool signatures, workspace layout (AGENTS.md, SOUL.md, TOOLS.md), and DM pairing system are inspired by OpenClaw. Licensed under MIT.

### Temporal Knowledge Graph

- **[Graphiti](https://github.com/getzep/graphiti)** by [Zep AI](https://www.getzep.com/) — Inspired the episodic memory and temporal graph approach. Licensed under Apache 2.0. Research paper: [arXiv:2501.13956](https://arxiv.org/abs/2501.13956).

### Voice Pipeline

- **[LiveKit](https://livekit.io/)** by [LiveKit, Inc.](https://github.com/livekit) — Production-grade WebRTC platform for real-time voice. Voice UI adapted from [agent-starter-react](https://github.com/livekit-examples/agent-starter-react). Licensed under MIT.

### Browser Automation

- **[Skyvern](https://github.com/Skyvern-AI/skyvern)** by [Skyvern AI](https://skyvern.com/) — AI browser automation via vision + LLMs. Licensed under AGPL-3.0 (separate service).

### Open-Source Libraries

Express, Zod, Commander.js, ws, Chalk, Ora, Boxen, Inquirer, dotenv, node-cron, uuid, Playwright, bonjour-service, tsup, Vitest, TypeScript.

---

## Support

If TITAN saves you time, consider supporting its development:

[![Fund with thanks.dev](https://img.shields.io/badge/Fund%20with-thanks.dev-brightgreen)](https://thanks.dev/Djtony707/TITAN)

---

## Disclaimer

TITAN IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

TITAN is an autonomous agent that can execute arbitrary commands, modify your filesystem, make network requests, and incur API costs. The author accepts no responsibility or liability for any actions taken by the software. You are solely responsible for reviewing and approving all actions taken by TITAN on your systems.

---

## License

MIT License — Copyright (c) 2026 Tony Elliott

Created by [Tony Elliott (Djtony707)](https://github.com/Djtony707)
