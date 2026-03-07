# TITAN — The Intelligent Task Automation Network

<p align="center">
  <img src="assets/titan-logo.png" alt="TITAN Logo" width="280"/>
</p>

<p align="center">
  <strong>A fully autonomous AI agent framework with Autopilot Mode, Deliberative Reasoning, and Gmail OAuth. 21 providers. 86 tools. 3,171 tests. Pure JavaScript — no native compilation. No, seriously.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/titan-agent"><img src="https://img.shields.io/npm/v/titan-agent?color=blue&label=npm" alt="npm version"/></a>
  <a href="https://github.com/Djtony707/TITAN/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"/></a>
  <a href="#providers"><img src="https://img.shields.io/badge/providers-21-purple" alt="21 Providers"/></a>
  <a href="#built-in-tools"><img src="https://img.shields.io/badge/tools-86-orange" alt="78 Tools"/></a>
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

> **WARNING — EXPERIMENTAL SOFTWARE**
> TITAN is experimental, actively developed software. It can execute shell commands, modify files, access the network, and take autonomous actions on your system. **Use at your own risk.** Think of it less as "software you install" and more as "a very motivated intern with root access." The author and contributors provide this software "as is" without warranty of any kind. By installing or running TITAN, you accept full responsibility for any consequences, including but not limited to data loss, system instability, unintended actions, API charges, or security issues. Always review TITAN's configuration, run it in supervised mode first, and never grant it access to systems or credentials you cannot afford to lose. See [LICENSE](LICENSE) for the full legal terms.

---

## Quick Start

**Requirements:** Node.js >= 20, an API key, and a healthy sense of adventure.

```bash
npm install -g titan-agent
titan onboard             # Interactive setup (pick a provider, paste your API key, give TITAN a soul)
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
| **Setup** | `npm i -g titan-agent && titan onboard` | Docker, Python venvs, native compilation, 3 hours of your life |
| **Native compilation** | None — all pure JS deps | Often require node-gyp, system libraries, and a blood sacrifice |
| **Providers** | 20 (70+ preconfigured models) with automatic failover | 1-4 providers, no failover |
| **Reasoning** | Deliberative multi-stage reasoning with plan approval | Single-shot responses |
| **Security** | Prompt injection shield, DM pairing, E2E encryption, encrypted vault, audit log, tool sandboxing | "We'll add auth later" |
| **Memory** | 4 systems (episodic, learning, relationship, temporal graph) | Basic chat history |
| **Multi-computer** | Built-in mesh with mDNS + Tailscale auto-discovery | Manual config or unsupported |
| **Skills** | 86 built-in + drop-in YAML/JS creation (toggleable per-skill) | Fixed tool set |
| **Email** | Gmail OAuth + SMTP with zero extra dependencies | Not included |
| **Cost control** | Smart routing, daily budgets, context summarization | Uncapped token spend (surprise!) |
| **GUI** | 12-panel Mission Control dashboard with soul editor | CLI only or basic web UI |
| **Personality** | SOUL.md onboarding — your agent knows who you are | Generic "I'm a helpful assistant" |
| **Codebase** | ~27K lines TypeScript | 50K-200K+ lines |

---

## Features

### Deliberative Reasoning

Most agents give you a single-shot answer and call it a day. TITAN actually *thinks*.

When TITAN detects an ambitious request — "figure out how to monetize this homelab," "build me an automated content pipeline," "come up with a strategy for X" — it doesn't just wing it. Instead, it enters a multi-stage deliberation loop:

1. **Analyze** — Examines the request from multiple angles using a reasoning model with high thinking
2. **Plan** — Generates a structured, dependency-aware execution plan
3. **Approve** — Presents the plan for your review (because autonomy without oversight is how sci-fi movies start)
4. **Execute** — Runs each task step-by-step, reporting progress in real-time via WebSocket
5. **Adapt** — If a step fails, re-analyzes and adjusts the plan

```bash
/plan figure out how to make money with my homelab    # Force deliberation mode
/plan status                                            # Check progress
/plan cancel                                            # Abort mission
```

Or just ask something ambitious and TITAN will detect it automatically. The detection is configurable — you can tune the complexity threshold, require approval, set max plan steps, or disable it entirely if you prefer your agents impulsive.

### 21 AI Providers, 70+ Models

Connect any combination of cloud and local models. TITAN routes, fails over, and load-balances automatically.

```bash
titan model --discover       # Live-detect all available models
titan model --alias fast=openai/gpt-4o-mini   # Create shortcuts
titan model --set anthropic/claude-sonnet-4-20250514
```

Built-in aliases: `fast`, `smart`, `cheap`, `reasoning`, `local` — fully configurable.

> **Running locally?** See [docs/MODELS.md](docs/MODELS.md) for GPU-tiered Ollama model recommendations.

### 86 Built-in Tools

| Category | Tools |
|----------|-------|
| **Shell & Process** | `shell`, `exec`, `process` (list, kill, spawn, poll, log) |
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `list_dir`, `apply_patch` |
| **Web** | `web_search`, `web_fetch`, `web_read`, `web_act`, `browser` (CDP), `browse_url`, `browser_search`, `browser_auto_nav` (Playwright) |
| **Intelligence** | `auto_generate_skill`, `analyze_image`, `transcribe_audio`, `generate_speech` |
| **GitHub** | `github_repos`, `github_issues`, `github_prs`, `github_commits`, `github_files` |
| **Email** | `email_send`, `email_search`, `email_read`, `email_list` (Gmail OAuth + SMTP) |
| **Computer Use** | `screenshot`, `mouse_click`, `mouse_move`, `keyboard_type`, `keyboard_press`, `screen_read` |
| **Data & Documents** | `data_analysis`, `csv_parse`, `csv_stats`, `pdf_read`, `pdf_info` |
| **Smart Home** | `ha_devices`, `ha_control`, `ha_status` |
| **Image Generation** | `generate_image`, `edit_image` |
| **Automation** | `cron`, `webhook` |
| **Memory** | `memory`, `switch_model`, `graph_remember`, `graph_search`, `graph_entities`, `graph_recall` |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_close` |
| **Income Tracking** | `income_log`, `income_summary`, `income_list`, `income_goal` |
| **Freelance** | `freelance_search`, `freelance_match`, `freelance_draft`, `freelance_track` |
| **Content** | `content_research`, `content_outline`, `content_publish`, `content_schedule` |
| **Lead Gen** | `lead_scan`, `lead_score`, `lead_queue`, `lead_report` |

All skills can be individually enabled/disabled from the Mission Control dashboard.

### Gmail OAuth Integration

Full Gmail access via OAuth2 — search, read, list, and send email. No extra npm packages. No `googleapis`. Just native `fetch` and the Gmail REST API, the way nature intended.

- **Dashboard OAuth flow** — Click "Connect Google Account" in Settings, complete consent, done
- **Real Gmail API** — `email_search`, `email_read`, `email_list` use the Gmail REST API with automatic token refresh
- **Smart sending** — `email_send` tries Gmail API first, falls back to SMTP if OAuth isn't configured
- **Zero dependencies** — Everything through native `fetch` (we don't believe in `node_modules` bloat)

```bash
# Or set credentials via environment variables
export GOOGLE_OAUTH_CLIENT_ID="your-client-id"
export GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
```

Token storage: `~/.titan/credentials/google.json` — separate from config, because credentials deserve their own apartment.

### SOUL.md — Personality That Persists

TITAN isn't just another "helpful assistant." It has a soul. Literally — it's a file called `SOUL.md`.

During onboarding, TITAN asks who you are and how you want it to behave. Your answers generate a personalized SOUL.md that's injected into every LLM system prompt:

```markdown
# SOUL.md - Who You Are

## About Your Human
Full-stack developer and startup founder. Builds side projects on weekends.
Prefers direct, no-fluff answers.

## Your Personality
Technical partner, not a tutor. Think like an architect.
Suggest better approaches proactively. Be concise.
```

Edit it anytime from Mission Control Settings → Profile → SOUL.md editor. Because your AI should know that you hate verbose explanations. *(The irony of this README's length is not lost on us.)*

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

Run up to 5 concurrent agents, each with its own model and personality. It's like having a team, except nobody argues about the thermostat.

```bash
titan agents --spawn researcher --model openai/gpt-4o
titan agents --spawn coder --model ollama/qwen3.5:4b
titan agents --list
```

### Prompt Injection Shield

Two-layer defense against prompt injection attacks:

- **Heuristic engine** — Detects "ignore previous instructions", system prompt extraction, developer mode exploits
- **Strict mode** — Keyword density analysis and tail manipulation detection

Combined with the separate **DM pairing** system, which requires new senders to be approved before they can interact with your agent. Because not everyone deserves to talk to your AI.

### Loop Detection & Circuit Breaker

Three detection algorithms prevent runaway tool loops:

- **Repeat detection** — Same tool, same arguments, called repeatedly
- **No-progress detection** — Tool returns identical output on consecutive calls
- **Ping-pong detection** — Alternating tool patterns with no forward progress
- **Global circuit breaker** — Hard stop after configurable threshold (your wallet says thanks)

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
- Classifies messages as simple/moderate/complex/ambitious for intelligent routing

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
- Enhanced by SOUL.md personality definition

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

`titan doctor --fix` automatically diagnoses and repairs common issues: missing directories, invalid configs, broken channels, stale logs, orphaned sessions, and file permissions. It's basically `have you tried turning it off and on again`, but automated.

### Autopilot Mode

TITAN runs hands-free on a schedule, evaluates a checklist of standing instructions, takes autonomous action, and reports results.

```bash
titan autopilot --init           # Create ~/.titan/AUTOPILOT.md checklist
titan autopilot --enable         # Turn on scheduled runs
titan autopilot --run            # Trigger an immediate run
titan autopilot --status         # View schedule and last run info
titan autopilot --history        # See past run results
```

Edit `~/.titan/AUTOPILOT.md` to control what TITAN watches each cycle. Results are classified as OK (silent), NOTABLE (summary delivered), or URGENT (priority alert). Cost-optimized: uses a cheaper model for routine runs, respects daily budgets, and skips runs outside active hours.

Pre-built playbook templates are available in [`docs/autopilot-playbooks/`](docs/autopilot-playbooks/) for common income strategies: freelance monitoring, content publishing, lead generation, and service automation.

### E2E Encrypted Sessions

AES-256-GCM encryption for sensitive conversations. Keys generated per-session, held in memory only.

### Skyvern Browser AI (Optional)

TITAN integrates with [Skyvern](https://github.com/Skyvern-AI/skyvern) for AI-powered browser automation. Instead of brittle CSS selectors, Skyvern uses vision + LLMs to interact with web pages using natural language.

**Native tools (built-in):** TITAN includes 3 native Skyvern tools (`skyvern_task`, `skyvern_extract`, `skyvern_sessions`) that call Skyvern's REST API directly — no extra dependencies needed.

**MCP integration (optional):** For the full 35-tool suite, register Skyvern as an MCP server:

```bash
pip install skyvern && skyvern init    # Install Skyvern (Python)
skyvern run server                      # Start the Skyvern backend (port 8000)
titan mcp --add skyvern                 # Register as MCP server in TITAN
```

The MCP integration adds `skyvern_act`, `skyvern_validate`, credential management, and self-healing script compilation.

> Skyvern is AGPL-3.0 licensed and runs as a separate service. TITAN's MIT license is not affected.

---

## Providers

TITAN supports 21 AI providers out of the box. Add your API key and go. Or add all 21. We won't judge.

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
| **Azure OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo, o1 | Cloud (Enterprise) |
| **DeepInfra** | LLaMA 3.3, Mixtral 8x22B, Qwen 2.5, DeepSeek-R1 | Cloud (Fast inference) |
| **SambaNova** | LLaMA 3.3, DeepSeek-R1 Distill, Qwen 2.5 | Cloud (Fast inference) |

All providers support automatic failover. If one goes down, TITAN seamlessly routes to the next available provider. Your agent stays up even when OpenAI doesn't.

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

A 12-panel dark-mode dashboard at `http://localhost:48420`. It's like NASA mission control, but for your AI agent, and with fewer rocket explosions.

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
| **Autopilot** | Schedule, status, history, and run control for autopilot mode |
| **Security** | Audit log and DM pairing management |
| **Logs** | Color-coded real-time log viewer with filtering |
| **Memory Graph** | Visual force-directed graph of entities and relationships |

**New in Settings:**
- **Providers tab** — Google OAuth connection (connect/disconnect with one click, manage client ID/secret)
- **Profile tab** — SOUL.md live editor (edit your agent's personality without touching the filesystem)

**New in Onboarding:**
- 4-step wizard: Profile → Soul → Provider → Autonomy
- Step 2 asks about you and how you want TITAN to behave
- Generates a personalized SOUL.md automatically

All settings are editable live without restarting the gateway.

---

## Mesh Networking

Connect up to **5 computers** together so they share AI models and API keys. One machine has a powerful GPU? The others can use it. One machine has an OpenAI subscription? Everyone benefits. TITAN finds your other machines automatically on your WiFi and asks before connecting.

### What You Need

Each computer in your mesh needs:
- **TITAN installed** (`npm i -g titan-agent`)
- **A network connection** — all machines on the same WiFi, or connected via Tailscale VPN

Then you pick what each machine brings to the table:

**For local models (free, runs on your GPU/CPU):**
1. Install [Ollama](https://ollama.com) on the machine
2. Pull the models you want: `ollama pull llama3.1` or `ollama pull qwen3:72b`
3. Ollama runs in the background — TITAN automatically detects which models you've pulled

**For cloud models (paid, needs an API key):**
- **Anthropic (Claude):** Get a key at [console.anthropic.com](https://console.anthropic.com) → set `ANTHROPIC_API_KEY` in your environment or `~/.titan/titan.json`
- **OpenAI (GPT-4o):** Get a key at [platform.openai.com](https://platform.openai.com) → set `OPENAI_API_KEY`
- **Google (Gemini):** Get a key at [aistudio.google.com](https://aistudio.google.com) → set `GOOGLE_API_KEY`
- **Any of the 17 other providers:** Set the matching env var (e.g. `GROQ_API_KEY`, `XAI_API_KEY`)

You only need keys on **one machine** — mesh sharing means every connected machine can use them.

### How Models Show Up

TITAN automatically finds every model available to you:

- **Ollama models** are discovered live by querying Ollama's API. Pull a new model? Hit "Refresh Ollama Models" in the dashboard (or restart the gateway) and it appears.
- **Cloud models** are listed based on which API keys you have set. No key = no models from that provider.
- **Mesh models** from connected peers appear alongside your local models in the dropdown.

Open the dashboard at `http://localhost:48420` → Settings → Model dropdown to see everything available. Models are grouped by provider: `LOCAL (Ollama)`, `ANTHROPIC`, `OPENAI`, etc.

### Step-by-Step: Connect Two Machines

**Machine 1** (e.g. your desktop with a GPU):
```bash
# 1. Install TITAN
npm i -g titan-agent

# 2. Install Ollama and pull some models
ollama pull llama3.1
ollama pull qwen3:72b

# 3. Create a mesh — this generates a secret code
titan mesh --init
# Output: Mesh Secret: TITAN-a1b2-c3d4-e5f6  ← copy this

# 4. Start TITAN
titan gateway
```

**Machine 2** (e.g. your laptop or a mini PC):
```bash
# 1. Install TITAN
npm i -g titan-agent

# 2. Set your cloud API key (if you have one)
export ANTHROPIC_API_KEY="sk-ant-..."

# 3. Join the mesh with the secret from Machine 1
titan mesh --join "TITAN-a1b2-c3d4-e5f6"

# 4. Start TITAN
titan gateway
```

**What happens next:**
1. Machine 2 automatically finds Machine 1 on your WiFi (via mDNS/Bonjour)
2. You see a message: `New TITAN node discovered: desktop-pc (192.168.1.100) — awaiting approval`
3. You approve it: `titan mesh --approve <nodeId>` (or click "Approve" in the dashboard)
4. Now both machines share models! Machine 2 can use Ollama models from Machine 1, and Machine 1 can use the Anthropic API through Machine 2

### Approving Connections

When TITAN finds another machine, it doesn't connect automatically — it asks you first. This prevents random machines from accessing your AI models.

```bash
# See who's been discovered and is waiting for your OK
titan mesh --pending

# Example output:
#   gpu-desktop
#     Node ID:  a1b2c3d4e5f6g7h8
#     Address:  192.168.1.100:48420
#     Models:   ollama/llama3.1, ollama/qwen3:72b
#     Approve:  titan mesh --approve a1b2c3d4e5f6g7h8

# Say yes
titan mesh --approve a1b2c3d4e5f6g7h8

# Say no
titan mesh --reject a1b2c3d4e5f6g7h8

# Already connected but want to disconnect?
titan mesh --revoke a1b2c3d4e5f6g7h8
```

TITAN remembers which machines you've approved. If you restart, it reconnects to them automatically.

### Skipping the Approval Step

If all machines on your network are yours and you don't want to manually approve each one:

```bash
titan mesh --auto-approve
```

Now any TITAN instance that shares your secret will connect automatically. Toggle it off the same way.

### Checking Status

```bash
titan mesh --status

# Shows:
#   Enabled:       Yes
#   Max peers:     5
#   Auto-approve:  Off
#   Connected Peers (2/5):
#     gpu-desktop  192.168.1.100:48420  |  3 models  |  load: 0
#     mini-pc      192.168.1.20:48420   |  12 models |  load: 0
```

### How Model Routing Works

When you ask TITAN to use a model:

1. **Local first** — If your machine has the model (e.g. you have the API key, or Ollama has it), it runs locally
2. **Mesh fallback** — If the local provider fails (no key, Ollama doesn't have it), TITAN checks your connected peers. If a peer has the model, the request is sent there
3. **Provider failover** — If no peer has it either, TITAN tries other local providers as a last resort

You don't have to do anything special — just pick a model from the dropdown. If it lives on another machine, TITAN handles the routing.

### Connecting Machines Not on the Same WiFi

If your machines are on different networks, you have two options:

**Option A: Tailscale (recommended)**
Install [Tailscale](https://tailscale.com) on both machines (free for personal use). TITAN auto-discovers peers on your Tailscale network.

```json
{
  "mesh": {
    "enabled": true,
    "tailscale": true
  }
}
```

**Option B: Manual IP address**
If you know the other machine's IP:

```bash
titan mesh --add "192.168.1.100:48420"
```

### Full Configuration

All settings live in `~/.titan/titan.json`:

```json
{
  "mesh": {
    "enabled": true,
    "secret": "TITAN-xxxx-xxxx-xxxx",
    "mdns": true,
    "tailscale": true,
    "maxPeers": 5,
    "autoApprove": false,
    "allowRemoteModels": true,
    "maxRemoteTasks": 3,
    "staticPeers": []
  }
}
```

| Setting | Default | What it does |
|---------|---------|--------------|
| `maxPeers` | 5 | How many other machines can connect at once |
| `autoApprove` | false | If `true`, skip the approval step for new machines |
| `allowRemoteModels` | true | Let other machines use your models. Set `false` to block them |
| `maxRemoteTasks` | 3 | How many requests from other machines to handle at once |
| `staticPeers` | [] | List of IP:port pairs for machines not on the same WiFi |

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

TITAN writes, compiles, and hot-loads the skill instantly. Because why write code when you can make your AI write code?

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
/plan            # Deliberative reasoning with plan approval
```

Recipes support parameterized prompts (`{{variable}}`), optional tool-direct steps, and confirmation gates.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `titan onboard` | Interactive setup wizard (now with soul onboarding) |
| `titan gateway` | Start Mission Control |
| `titan agent -m "..."` | Send a message to your agent |
| `titan send --to ch:id -m "..."` | Message a specific channel |
| `titan model --list` | Show all configured models |
| `titan model --discover` | Live-detect available models |
| `titan model --set <model>` | Switch the active model |
| `titan model --alias <name>=<model>` | Create a model alias |
| `titan agents` | Multi-agent management |
| `titan mesh --init` | Initialize mesh networking |
| `titan mesh --status` | View mesh peers, pending, and models |
| `titan mesh --pending` | Show peers waiting for approval |
| `titan mesh --approve <id>` | Approve a discovered peer |
| `titan mesh --reject <id>` | Reject a pending peer |
| `titan mesh --revoke <id>` | Disconnect an approved peer |
| `titan mesh --auto-approve` | Toggle auto-approve mode |
| `titan skills` | List installed skills |
| `titan skills --create "..."` | Generate a skill with AI |
| `titan pairing` | Manage DM access control |
| `titan doctor` | System diagnostics |
| `titan doctor --fix` | Auto-fix detected issues |
| `titan vault` | Manage encrypted secrets vault |
| `titan config [key]` | View/edit configuration (e.g. `titan config agent.model`) |
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
| `credentials/` | OAuth tokens (Google, etc.) |
| `workspace/SOUL.md` | Agent personality definition |
| `logs/` | Daily log files |
| `plans/` | Persistent task planner state |
| `skills/` | Custom user skills (YAML, JS) |
| `recipes/` | Saved recipe workflows |

---

## Development

```bash
npm run build          # tsup ESM production build
npm run test           # vitest (3,171 tests, 81 files)
npm run ci             # typecheck + full test suite
npm run typecheck      # tsc --noEmit
npm run dev:gateway    # Dev mode with tsx
npm run test:coverage  # Coverage report (78%+ with 55% threshold)
```

### Architecture

```
src/
  agent/        Core agent loop, multi-agent, swarm, planner, autonomy, deliberation, cost optimizer
  auth/         OAuth token managers (Google)
  channels/     Discord, Telegram, Slack, Google Chat, WhatsApp, Matrix, Signal, Teams, WebChat
  providers/    Anthropic, OpenAI, Google, Ollama + 16 OpenAI-compatible
  memory/       Episodic, learning, relationship, temporal graph
  skills/       86 built-in tools + user skill loader
  security/     Shield, sandbox, encryption, pairing, vault, audit log
  gateway/      HTTP/WS server + Mission Control dashboard + OAuth endpoints
  mesh/         mDNS + Tailscale peer discovery, WebSocket transport
  recipes/      Workflow engine + persistence
  mcp/          Model Context Protocol client
  config/       Zod schema + loader (with deliberation + OAuth config)
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

Email tools are classified by risk: `email_search`, `email_read`, `email_list` are safe; `email_send` is moderate (because sending emails on someone's behalf without asking is how you lose friends).

Configure via `titan config set autonomy.mode supervised` or Mission Control Settings.

---

## Roadmap

See [TASKS.md](TASKS.md) for the full development roadmap.

### Recently Shipped (v2026.5.x)
- **v2026.5.17**: GitHub-hosted Skills Marketplace ([Djtony707/titan-skills](https://github.com/Djtony707/titan-skills) — 12 curated skills), dynamic model dropdown showing all 21 providers, marketplace REST API, stale docs cleanup, 3,171 tests
- **v2026.5.14**: Income Automation Skills (income_tracker, freelance_monitor, content_publisher, lead_scorer — 16 new tools), Autopilot Playbook templates, per-skill enable/disable toggle in Mission Control, skill-to-tool mapping
- **v2026.5.13**: Kimi K2.5 provider, memory flush hook, web_read + web_act tools for local-LLM browsing
- **v2026.5.11**: Deliberative Reasoning (analyze→plan→approve→execute), Gmail OAuth integration (native fetch, zero deps), Soul Onboarding (4-step wizard with SOUL.md generation), SOUL.md live editor in dashboard, `/plan` slash command, ambitious message complexity detection, Google OAuth dashboard controls, 2,860+ tests
- **v2026.5.9**: Bug fixes + local model performance — port pre-check, small model tool reduction (<8B models get 7 core tools), Ollama `think:false`, configurable stall detector with GPU auto-detection, `titan config [key]`, slash commands via REST API, config validation, graph entity extraction hardening, concurrent LLM request limiting, 2,850+ tests
- **v2026.5.8**: Ollama model guide (`docs/MODELS.md`), 147→0 ESLint warnings, `local` model alias, 2,830+ tests
- **v2026.5.7**: Google Chat channel (real webhook), Autopilot dashboard panel, Cloudflare Tunnel support, 2,600+ tests
- **v2026.5.6**: 3 new providers (Azure OpenAI, DeepInfra, SambaNova), Skyvern MCP browser automation, docs cleanup
- **v2026.5.5**: Autopilot Mode — hands-free scheduled agent runs with cron
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
- **Vector Search & RAG Pipeline** — SQLite FTS5 + embeddings for semantic memory search
- **Code Interpreter** — Sandboxed JavaScript/Python execution for data analysis
- **Team Mode & RBAC** — Role-based access control for multi-user deployments

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push (`git push origin feat/my-feature`)
5. Open a Pull Request

We don't bite. Unless you submit a PR that adds `is-even` as a dependency.

---

## The Future of TITAN

TITAN is under active development and growing fast. Every release brings new providers, new tools, and deeper intelligence. The roadmap includes vector search & RAG, a code interpreter, plugin marketplace, team mode with RBAC, and much more.

It started as "what if I made an AI agent that actually does stuff" and evolved into a 27K-line TypeScript framework with 21 providers, 86 tools, deliberative reasoning, Gmail OAuth, mesh networking, and a personality system. We're not entirely sure when it became sentient, but the SOUL.md file is a good suspect.

If you're looking for an AI agent framework that's lightweight enough to run on a Raspberry Pi but powerful enough to orchestrate multi-model workflows across a mesh of machines — you're in the right place.

Star the repo, join the journey, and help shape what autonomous AI agents look like.

---

## Acknowledgments

TITAN stands on the shoulders of giants. Special thanks to the projects and people whose work made this possible.

### Architectural Inspiration

- **[OpenClaw](https://github.com/openclaw/openclaw)** by [Peter Steinberger](https://github.com/steipete) — TITAN's architecture, CLI surface, tool signatures, workspace layout (AGENTS.md, SOUL.md, TOOLS.md), and DM pairing system are inspired by OpenClaw, the open-source personal AI assistant framework. Licensed under MIT.

### Temporal Knowledge Graph

- **[Graphiti](https://github.com/getzep/graphiti)** by [Zep AI](https://www.getzep.com/) — TITAN's native temporal knowledge graph (`src/memory/graph.ts`) is inspired by the Graphiti project's approach to episodic memory, entity extraction, and temporal graph architecture. Created by [Daniel Chalef](https://github.com/danielchalef), [Preston Rasmussen](https://github.com/prasmussen15), [Pavlo Paliychuk](https://github.com/paul-paliychuk), Travis Beauvais, and [Jack Ryan](https://github.com/jackaldenryan). Licensed under Apache 2.0. Research paper: [arXiv:2501.13956](https://arxiv.org/abs/2501.13956).

### Browser Automation

- **[Skyvern](https://github.com/Skyvern-AI/skyvern)** by [Skyvern AI](https://skyvern.com/) — AI browser automation using vision + LLMs (native tools + MCP integration). Licensed under AGPL-3.0 (runs as a separate service).

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

## Disclaimer

TITAN IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

TITAN is an autonomous agent that can execute arbitrary commands, modify your filesystem, make network requests, and incur API costs. The author accepts no responsibility or liability for any actions taken by the software, including but not limited to: data loss, unauthorized access, unintended system modifications, API usage charges, security breaches, or any other damages resulting from use of this software. You are solely responsible for reviewing and approving all actions taken by TITAN on your systems.

---

## License

MIT License — Copyright (c) 2026 Tony Elliott

Created by [Tony Elliott (Djtony707)](https://github.com/Djtony707)
