# TITAN Architecture

> **TITAN — The Intelligent Task Automation Network**
> Created by Tony Elliott · Inspired by OpenClaw

## System Overview

TITAN is a TypeScript-based autonomous AI agent framework with a modular architecture designed for extensibility, security, and multi-agent operation.

## Core Components

```
┌──────────────────────────────────────────────────────┐
│                    CLI Interface                      │
│  onboard │ gateway │ agent │ pairing │ agents │ ...  │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────┐
│                   Gateway Server                      │
│         HTTP + WebSocket Control Plane                │
│     Express REST API │ Dashboard │ WS Broadcast       │
└────────────────────────┬─────────────────────────────┘
                         │
         ┌───────────────┼───────────────────┐
         │               │                   │
┌────────▼───────┐ ┌─────▼──────┐  ┌────────▼────────┐
│  Multi-Agent   │ │  Channel   │  │   Security      │
│  Router (1-5)  │ │  Adapters  │  │  Sandbox+Pairing│
└────────┬───────┘ └────────────┘  └─────────────────┘
         │
┌────────▼───────┐
│  Agent Core    │
│  Session Mgmt  │
│  Tool Runner   │
└────────┬───────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐ ┌───▼────────┐
│Skills│ │  LLM       │
│ 17+  │ │ Providers  │
│built │ │ (4 impls)  │
│ in   │ │ + failover │
└──────┘ └────────────┘
    │
┌───▼──────────┐
│  Memory +    │
│  Learning    │
│  Engine      │
└──────────────┘
```

## Data Flow

1. **Inbound** — Messages arrive from channels (Discord, Telegram, WebChat, etc.)
2. **Routing** — Multi-agent router resolves which agent handles the message
3. **Context** — Agent builds system prompt with workspace files, learning context, memories
4. **LLM** — Provider router sends to best available LLM (with failover)
5. **Tools** — Multi-round tool execution loop (up to 10 rounds)
6. **Learning** — Tool results tracked, knowledge base updated
7. **Response** — Final response routed back to originating channel

## Security Model

- **Main session**: Full host access (single-user mode)
- **Non-main sessions**: Docker sandbox per session
- **DM pairing**: New senders quarantined until approved
- **Tool allowlists**: Configurable per-agent tool permissions
- **Network/filesystem allowlists**: Configurable access boundaries

## File Layout

```
src/
├── agent/
│   ├── agent.ts          # Core agent loop with learning integration
│   ├── session.ts        # Per-user/per-channel session management
│   ├── toolRunner.ts     # Tool execution engine with sandboxing
│   └── multiAgent.ts     # Multi-agent router (max 5)
├── channels/
│   ├── base.ts           # Abstract channel adapter
│   ├── discord.ts        # Discord (discord.js)
│   ├── telegram.ts       # Telegram (grammY)
│   ├── slack.ts          # Slack (Bolt)
│   ├── googlechat.ts     # Google Chat
│   └── webchat.ts        # Built-in WebSocket chat
├── cli/
│   ├── index.ts          # CLI entrypoint (10 commands)
│   ├── onboard.ts        # Setup wizard
│   └── doctor.ts         # Diagnostics
├── config/
│   ├── schema.ts         # Zod-based configuration schema
│   └── config.ts         # Config manager
├── gateway/
│   └── server.ts         # HTTP+WS server, dashboard, APIs
├── memory/
│   ├── memory.ts         # JSON file-based persistent memory
│   └── learning.ts       # Continuous learning engine
├── providers/
│   ├── base.ts           # Abstract LLM provider
│   ├── anthropic.ts      # Claude
│   ├── openai.ts         # GPT
│   ├── google.ts         # Gemini
│   ├── ollama.ts         # Local models
│   └── router.ts         # Provider router + failover
├── security/
│   ├── sandbox.ts        # Session security contexts
│   └── pairing.ts        # DM pairing manager
├── skills/
│   ├── registry.ts       # Skills discovery + loader
│   └── builtin/
│       ├── shell.ts      # Shell execution
│       ├── filesystem.ts # File operations
│       ├── process.ts    # Background process management
│       ├── web_search.ts # DuckDuckGo search
│       ├── web_fetch.ts  # URL content extraction
│       ├── browser.ts    # CDP browser control
│       ├── apply_patch.ts# Unified diff patching
│       ├── cron.ts       # Scheduled tasks
│       ├── webhook.ts    # HTTP webhooks
│       ├── memory_skill.ts# Persistent memory
│       └── sessions.ts   # Inter-agent sessions
└── utils/
    ├── constants.ts      # Paths, defaults, version
    ├── logger.ts         # Structured logging
    └── helpers.ts        # File I/O utilities
```
