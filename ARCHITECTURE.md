# TITAN Architecture

> **TITAN -- The Intelligent Task Automation Network**

## System Overview

TITAN is a TypeScript-based autonomous AI agent framework with a modular architecture designed for extensibility, security, and multi-agent operation.

## Core Components

```
                          CLI Interface
  onboard | gateway | agent | pairing | agents | doctor | config
                              |
                      Gateway Server
            HTTP + WebSocket Control Plane
        Express REST API | Dashboard | WS Broadcast
                              |
            +-----------------+-----------------+
            |                 |                 |
      Multi-Agent        Channel           Security
      Router (1-5)       Adapters (9)      Sandbox+Pairing
            |                                Shield+Vault
      Agent Core
      Session Mgmt
      Tool Runner
            |
       +----+----+
       |         |
    Skills    LLM Providers
    31 files  21 providers
    78 tools  (4 native + 17 compat)
       |
    Memory + Learning
    Graph + Relationship
    Briefings
```

## Data Flow

1. **Inbound** -- Messages arrive from channels (Discord, Telegram, WebChat, etc.)
2. **Routing** -- Multi-agent router resolves which agent handles the message
3. **Context** -- Agent builds system prompt with workspace files, learning context, memories
4. **Deliberation** -- Complex requests trigger multi-stage reasoning (analyze, plan, approve, execute)
5. **LLM** -- Provider router sends to best available LLM (with failover + retry)
6. **Tools** -- Multi-round tool execution loop (up to 10 rounds)
7. **Learning** -- Tool results tracked, knowledge base updated
8. **Response** -- Final response routed back to originating channel

## Security Model

- **Main session**: Full host access (single-user mode)
- **Non-main sessions**: Docker sandbox per session
- **DM pairing**: New senders quarantined until approved
- **Tool allowlists**: Configurable per-agent tool permissions
- **Network/filesystem allowlists**: Configurable access boundaries
- **Prompt injection shield**: Multi-layer detection (heuristic + LLM)
- **Secrets vault**: AES-256-GCM encrypted credential store
- **Audit log**: HMAC-SHA256 chained tamper-evident event trail

## File Layout

```
src/
+-- agent/
|   +-- agent.ts            # Core agent loop with learning integration
|   +-- autonomy.ts         # Risk classification + HITL approval gates
|   +-- autopilot.ts        # Hands-free scheduled agent runs
|   +-- contextManager.ts   # Context window management + compaction
|   +-- costOptimizer.ts    # Token cost tracking + optimization
|   +-- deliberation.ts     # Multi-stage reasoning for complex requests
|   +-- generator.ts        # Auto-generate skills from natural language
|   +-- loopDetection.ts    # Detect infinite tool-call loops
|   +-- monitor.ts          # File/process monitoring
|   +-- multiAgent.ts       # Multi-agent router (max 5 agents)
|   +-- parallelTools.ts    # Parallel tool execution
|   +-- planner.ts          # Task planning + execution
|   +-- responseCache.ts    # LRU response cache
|   +-- session.ts          # Per-user/per-channel session management
|   +-- stallDetector.ts    # Detect stalled LLM inference
|   +-- swarm.ts            # Agent swarm coordination
|   +-- toolRunner.ts       # Tool execution engine with sandboxing
+-- auth/
|   +-- google.ts           # Google OAuth
+-- channels/
|   +-- base.ts             # Abstract channel adapter
|   +-- discord.ts          # Discord
|   +-- telegram.ts         # Telegram
|   +-- slack.ts            # Slack
|   +-- googlechat.ts       # Google Chat
|   +-- webchat.ts          # Built-in WebSocket chat
|   +-- whatsapp.ts         # WhatsApp (Baileys)
|   +-- matrix.ts           # Matrix
|   +-- signal.ts           # Signal
|   +-- msteams.ts          # Microsoft Teams
+-- cli/
|   +-- index.ts            # CLI entrypoint (10+ commands)
|   +-- onboard.ts          # Setup wizard
|   +-- doctor.ts           # Diagnostics + self-healing
+-- config/
|   +-- schema.ts           # Zod-based configuration schema
|   +-- config.ts           # Config manager
+-- gateway/
|   +-- server.ts           # HTTP+WS server, REST APIs
|   +-- dashboard.ts        # Mission Control inline HTML/JS
|   +-- slashCommands.ts    # Slash command registry
+-- mcp/
|   +-- ...                 # MCP protocol support
+-- memory/
|   +-- memory.ts           # JSON file-based persistent memory
|   +-- graph.ts            # Temporal graph memory (entities + episodes)
|   +-- learning.ts         # Continuous learning engine
|   +-- relationship.ts     # User relationship tracking
|   +-- briefing.ts         # Morning briefing generation
+-- mesh/
|   +-- ...                 # Mesh networking (mDNS + Tailscale)
+-- providers/
|   +-- base.ts             # Abstract LLM provider
|   +-- anthropic.ts        # Claude (native Messages API)
|   +-- openai.ts           # GPT (native)
|   +-- google.ts           # Gemini (native)
|   +-- ollama.ts           # Local models (native)
|   +-- openai_compat.ts    # 17 OpenAI-compatible providers
|   +-- router.ts           # Provider router + failover
|   +-- authResolver.ts     # Auth profile rotation
+-- recipes/
|   +-- ...                 # Recipe system (multi-step workflows)
+-- security/
|   +-- sandbox.ts          # Session security contexts
|   +-- pairing.ts          # DM pairing manager
|   +-- shield.ts           # Prompt injection detection
|   +-- secrets.ts          # Encrypted secrets vault
|   +-- encryption.ts       # AES-256-GCM encryption
|   +-- auditLog.ts         # Tamper-evident audit trail
+-- skills/
|   +-- registry.ts         # Skill discovery, loading, toggle
|   +-- marketplace.ts      # ClaWHub marketplace integration
|   +-- builtin/            # 31 built-in skill files (78 tools)
|       +-- shell.ts        # Shell execution
|       +-- filesystem.ts   # File operations
|       +-- browser.ts      # CDP browser control
|       +-- web_search.ts   # DuckDuckGo search
|       +-- web_fetch.ts    # URL content extraction
|       +-- web_browse_llm.ts # web_read + web_act (LLM-powered browsing)
|       +-- github.ts       # GitHub API (5 tools)
|       +-- email.ts        # Email (4 tools)
|       +-- computer_use.ts # Computer use (6 tools)
|       +-- vision.ts       # Image analysis
|       +-- voice.ts        # Text-to-speech / speech-to-text
|       +-- image_gen.ts    # Image generation
|       +-- pdf.ts          # PDF parsing
|       +-- calendar.ts     # Calendar management
|       +-- data_analysis.ts# Data analysis + charting
|       +-- smart_home.ts   # Smart home control
|       +-- skyvern.ts      # Skyvern MCP browser automation
|       +-- income_tracker.ts    # Financial ledger (4 tools)
|       +-- freelance_monitor.ts # Job search + matching (4 tools)
|       +-- content_publisher.ts # SEO content pipeline (4 tools)
|       +-- lead_scorer.ts      # Lead gen + scoring (4 tools)
|       +-- cron.ts         # Scheduled tasks
|       +-- webhook.ts      # HTTP webhooks
|       +-- memory_skill.ts # Persistent memory ops
|       +-- memory_graph.ts # Graph memory ops
|       +-- sessions.ts     # Inter-agent sessions
|       +-- process.ts      # Background processes
|       +-- apply_patch.ts  # Unified diff patching
|       +-- auto_generate.ts# Skill generation from NL
|       +-- model_switch.ts # Runtime model switching
|       +-- web_browser.ts  # Additional browser tools
+-- utils/
    +-- constants.ts        # Paths, defaults, version
    +-- logger.ts           # Structured logging
    +-- helpers.ts          # File I/O utilities
```
