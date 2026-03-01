# TITAN Development Roadmap & Task Tracker

**Last Updated:** 2026-03-01
**Current Version:** 2026.4.30
**Author:** Tony Elliott (Djtony707)

---

## Phase 1: Critical Bug Fixes & Dead Code Wiring (COMPLETED)

All critical bugs fixed, dead code wired up, 21+ fixes applied.

### Fixes Applied
1. **Loop detection** — `loopDetection.ts` was imported but never called. Wired into agent tool loop.
2. **Stall detector** — `stallDetector.ts` never checked. Integrated into agent processing.
3. **Cost optimizer** — `costOptimizer.ts` had dead routing logic. Connected to model selection.
4. **Context manager** — `contextManager.ts` never invoked for summarization. Wired into message history.
5. **Response cache** — `responseCache.ts` unused. Integrated into agent for duplicate detection.
6. **Monitor** — `monitor.ts` never started. Auto-starts with gateway.
7. **Parallel tools** — `parallelTools.ts` never used. Wired for concurrent tool execution.
8. **Learning engine** — Tool success/failure tracking wired into every tool execution.
9. **Relationship memory** — User profile updates wired into message processing.
10. **Briefing system** — Morning briefing generation wired up.
11. **Autonomy gates** — `checkAutonomy()` properly integrated into tool runner.
12. **Shield integration** — Prompt injection checks on all inbound messages.
13. **Filesystem skill** — File write/edit had path traversal gaps. Fixed.
14. **Web fetch** — Proper error handling and timeout enforcement.
15. **Web browser** — Playwright integration stabilized.
16. **Session management** — `stopSession()` was undefined. Fixed + added API endpoint.
17. **Dashboard WebSocket** — `ws.onmessage` monkey-patch ran on undefined `ws`. Fixed.
18. **Dashboard browser JS** — 3 SyntaxErrors from esbuild template literal compilation. All fixed.
19. **Generator** — Skill auto-generation had import issues. Fixed.
20. **Multi-agent** — Agent spawning had race conditions. Fixed.
21. **Config validation** — Zod schema defaults applied consistently.

---

## Phase 2: Production Grade (COMPLETED)

### 2A: Universal Model Router (DONE)
- **Model aliases** — `fast`, `smart`, `cheap`, `reasoning` map to specific models via config
- **Live model discovery** — `discoverAllModels()` queries all 14 providers with 60s cache
- **CLI commands** — `titan model --discover`, `titan model --alias`, `titan model --aliases`
- **API endpoints** — `GET /api/models/discover`, `POST /api/model/switch`

### 2B: Retry Logic (DONE)
- **`fetchWithRetry()`** in `src/utils/helpers.ts` — exponential backoff with Retry-After header respect
- Applied to all HTTP-calling providers (Anthropic, OpenAI, Google, OpenAI-compat)

### 2C: Gateway Hardening (DONE)
- **Rate limiting** — Inline per-IP rate limiter (100 req/15min)
- **CORS** — Proper headers on all responses
- **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Token TTL** — 24-hour token expiry

### 2D: Streaming (DONE)
- All 5 provider types have real SSE/NDJSON `chatStream()` implementations
- Gateway `POST /api/chat/stream` SSE endpoint
- Anthropic: SSE with content_block_delta/start/stop + tool accumulation
- OpenAI: SSE with delta parsing + `parseOpenAISSE()` helper
- Google: `streamGenerateContent?alt=sse` endpoint
- Ollama: NDJSON streaming with `stream: true`
- OpenAI-compat: Same SSE pattern as OpenAI (covers 10 providers)

### 2E: Critical Fixes from Triple-Check (DONE)
- Fixed remaining TypeScript issues found during audit
- All edge cases in tool runner addressed

### 2F: Test Coverage (DONE)
- 99 tests across 10 files (up from 52/7)
- New test files: providers.test.ts (19), config.test.ts (18), graph.test.ts (10)
- Covers: constants, helpers, config schema, provider routing, model aliases, graph memory, gateway API

### Additional Phase 2 Features Implemented

#### 10 New Model Providers (14 total)
All use the generic `OpenAICompatProvider` class (`src/providers/openai_compat.ts`):

| Provider | API | Models | Status |
|----------|-----|--------|--------|
| Anthropic | Native | Claude Opus/Sonnet/Haiku 4 | Active |
| OpenAI | Native | GPT-4o, o-series | Active |
| Google | Native | Gemini 2.5/2.0/1.5 | Active |
| Ollama | Native | Local models | Active |
| Groq | OpenAI-compat | LLaMA 3.3 70B, Mixtral, Gemma2 | Active |
| Mistral | OpenAI-compat | Mistral Large/Small/Nemo | Active |
| OpenRouter | OpenAI-compat | 290+ models | Active |
| Fireworks | OpenAI-compat | LLaMA 3.1, Mixtral, Qwen | Active |
| xAI | OpenAI-compat | Grok-3, Grok-3-fast, Grok-3-mini | Active |
| Together | OpenAI-compat | LLaMA 3.3, DeepSeek-R1, Qwen 2.5, Mixtral | Active |
| DeepSeek | OpenAI-compat | DeepSeek Chat, DeepSeek Reasoner | Active |
| Cerebras | OpenAI-compat | LLaMA 3.3, LLaMA 3.1, Qwen 3 | Active |
| Cohere | OpenAI-compat | Command-R+, Command-R, Command-R 7B | Active |
| Perplexity | OpenAI-compat | Sonar, Sonar Pro, Sonar Reasoning | Active |

**50+ models preconfigured** across all providers (more via live discovery).

#### TITAN Mesh Networking
Full peer-to-peer mesh for multi-computer deployments (`src/mesh/`):
- **Identity** — Stable node ID per machine (`~/.titan/node-id`)
- **Discovery** — mDNS/Bonjour (LAN) + Tailscale VPN + static peers
- **Transport** — WebSocket with HMAC-SHA256 authentication (30s window)
- **Registry** — Distributed model/agent registry with load-aware routing
- **CLI** — `titan mesh --init`, `--join`, `--status`, `--add`, `--leave`
- **API** — `/api/mesh/hello`, `/api/mesh/peers`, `/api/mesh/models`

#### Native Temporal Graph Memory (Graphiti replacement)
Pure TypeScript, no Docker/Neo4j required (`src/memory/graph.ts`):
- **Auto-recording** — All user and agent messages automatically saved as episodes
- **Context injection** — Relevant memories injected into system prompt per-query
- **Entity extraction** — Uses any configured LLM provider (not Ollama-only)
- **4 agent tools** — `graph_remember`, `graph_search`, `graph_entities`, `graph_recall`
- **Storage** — `~/.titan/graph.json`

#### Easy Skill Creation
- **YAML skills** — Drop `.yaml` files in `~/.titan/skills/` with inline JavaScript
- **JS skills** — Drop `.js` files in `~/.titan/skills/` with `export default { name, execute }`
- **CLI generator** — `titan skill create "description"` generates skills via AI
- **Hot-loading** — Skills discovered on startup from entire `~/.titan/skills/` tree
- **Sandboxed** — YAML skills only have access to built-in Node.js modules

---

## Phase 3: Compete with the Best (PLANNED)

### Research Findings: OpenClaw Use Cases

Based on comprehensive research of OpenClaw (241K+ GitHub stars) and its user community:

#### Top User Workflows (by frequency)
1. **Morning briefing** — Calendar + weather + news + email summary delivered daily
2. **Multi-channel messaging** — WhatsApp (#1 requested), SMS, email from single agent
3. **Shell/file operations** — System administration, file management, automation
4. **Web research** — Deep research with citations across multiple sources
5. **Code assistance** — PR review, code generation, debugging
6. **Smart home integration** — Home Assistant, IoT device control
7. **Personal assistant** — Reminders, scheduling, note-taking
8. **Data analysis** — CSV/Excel processing, visualization
9. **Social media management** — Posting, monitoring, analytics

#### TITAN Capability Audit (Score: 9.0/10)

| Category | Score | Notes |
|----------|-------|-------|
| Core Agent | 10/10 | Planner, loop detection, stall detection, cost optimization |
| Tools/Skills | 9/10 | 16 skill modules, 30 tools. Missing: GitHub, email, image gen |
| Memory | 10/10 | 4 systems: episodic, learning, relationship, graph |
| Providers | 10/10 | 14 providers, 66 models, aliases, failover |
| Security | 10/10 | Shield, sandbox, encryption, pairing, autonomy gates |
| Channels | 6/10 | 5 working (Discord, Telegram, Slack, Google Chat, WebChat). Missing: WhatsApp, Matrix, Signal, Teams |
| Dashboard | 8/10 | 11 panels. Missing: real-time charts, premium polish |
| Networking | 8/10 | Mesh with mDNS + Tailscale. New, needs battle-testing |
| Developer UX | 9/10 | YAML/JS skills, CLI generator, recipes |
| Documentation | 7/10 | Good README, needs API docs |

#### TITAN's Competitive Advantages Over OpenClaw
1. **Security** — OpenClaw has CVE-2026-25253 (critical prompt injection). TITAN has Shield + Pairing.
2. **Memory** — OpenClaw's memory is buggy (common complaint). TITAN has 4 working memory systems.
3. **Cost** — OpenClaw users report $3,600/month token costs. TITAN has cost optimizer + budget controls.
4. **Skills** — OpenClaw's marketplace has malicious skills (documented). TITAN sandboxes all skills.
5. **Codebase** — OpenClaw is 200K+ lines. TITAN is ~15K lines with comparable features.

### Priority Implementation Plan

#### P1 — Critical (implement first)
- [ ] **Premium Dashboard Overhaul** — Make Mission Control feel premium, fun, and professional:
  - Smooth CSS transitions and micro-animations (panel switches, button hovers, card reveals)
  - Glassmorphism or frosted-glass card design with subtle gradients
  - Animated TITAN logo/branding on login and sidebar
  - Real-time animated stats (counters that tick up, pulsing active indicators)
  - Typing indicator animation in WebChat (bouncing dots, not just text)
  - Toast notifications with slide-in/fade-out animations
  - Skeleton loading states instead of blank panels
  - Color-coded status badges with glow effects (green pulse for active, amber for warning)
  - Memory Graph: smoother force-directed animation, particle effects on edges, zoom/pan controls
  - Dark/light theme toggle with smooth transition
  - Responsive layout that works on tablets
  - Sound effects option (subtle clicks, notification chimes)
  - Agent avatar/personality display in chat bubbles
  - Session timeline visualization with activity sparklines
  - Professional footer with version, uptime, and connection status
- [ ] **GitHub Skill** — PR review, issue management, repo operations, commit analysis
- [ ] **Email Skill** — IMAP/SMTP with OAuth2 (Gmail, Outlook) + plain auth
- [ ] **Morning Briefing Recipe** — Calendar + weather + email + news aggregation
- [ ] **Computer Use** — Screenshot capture, mouse/keyboard control, window management
- [ ] **Proactive Cron Enhancement** — Channel delivery routing, session isolation per job

#### P2 — Important (implement second)
- [ ] **WhatsApp Channel** — Via WhatsApp Business API or Baileys library
- [ ] **Image Generation Skill** — DALL-E, Stable Diffusion, Flux API integration
- [ ] **PDF Parsing Skill** — Extract text/tables from PDF documents
- [ ] **Calendar Integration** — Google Calendar, Outlook Calendar read/write
- [ ] **Persistent Webhooks** — Survive gateway restarts (store in titan-data.json)

#### P3 — Nice to Have (implement third)
- [ ] **Matrix Channel** — Matrix.org protocol adapter
- [ ] **Signal Channel** — Signal protocol adapter
- [ ] **MS Teams Channel** — Microsoft Teams adapter
- [ ] **Smart Home Skill** — Home Assistant API integration
- [ ] **Data Analysis Skill** — CSV/Excel processing with chart generation
- [ ] **Notion/Jira Skill** — Project management integration
- [ ] **Real-time Dashboard Charts** — Live cost/token/response time graphs (pairs with P1 dashboard overhaul)
- [ ] **API Documentation** — Full OpenAPI spec for gateway endpoints

---

## Phase 4: Market Leader (PLANNED)

### Vision
TITAN should be the most capable, secure, and user-friendly AI agent framework available.

#### Key Differentiators to Build
- [ ] **Plugin Marketplace** — Curated, security-audited skill marketplace
- [ ] **Team Mode** — Multi-user with RBAC and shared agent pools
- [ ] **OAuth Hub** — One-click connection to 50+ SaaS services
- [ ] **Mobile App** — React Native companion app for iOS/Android
- [ ] **Voice-First Mode** — Always-on voice assistant (wake word detection)
- [ ] **Multi-modal Pipelines** — Image → text → code → execution chains
- [ ] **Agent-to-Agent Protocol** — Standardized inter-agent communication
- [ ] **Self-Healing** — Auto-detect and fix configuration/dependency issues
- [ ] **Telemetry Dashboard** — Usage analytics, cost forecasting, performance trends

### Test Coverage Goals
- Phase 2 achieved: 99 tests, 10 files
- Phase 3 target: 130+ tests, 60% line coverage
- Phase 4 target: 180+ tests, 80% line coverage
- Add integration tests for: mesh, channels, recipes, skill loader, streaming

---

## Files Changed in Phase 2

### New Files
| File | Purpose |
|------|---------|
| `src/providers/openai_compat.ts` | Generic OpenAI-compatible provider (10 presets) |
| `src/mesh/identity.ts` | Stable node ID generation |
| `src/mesh/discovery.ts` | mDNS + Tailscale peer discovery |
| `src/mesh/transport.ts` | WebSocket peer-to-peer transport |
| `src/mesh/registry.ts` | Distributed model/agent registry |
| `src/mesh/index.ts` | Barrel exports |

### Modified Files (25 total)
| File | Changes |
|------|---------|
| `package.json` | Added `bonjour-service` optional dep, bumped version |
| `src/agent/agent.ts` | Graph memory auto-recording, context injection, Memory Tools in system prompt |
| `src/agent/autonomy.ts` | Edge case fixes |
| `src/agent/costOptimizer.ts` | Smart routing improvements |
| `src/agent/generator.ts` | Import fixes |
| `src/agent/loopDetection.ts` | Additional detection patterns |
| `src/agent/multiAgent.ts` | Race condition fixes |
| `src/agent/toolRunner.ts` | Learning engine integration, timeout improvements |
| `src/cli/index.ts` | `titan model`, `titan mesh`, `titan skill create` commands |
| `src/config/schema.ts` | MeshConfigSchema, modelAliases, 10 new provider configs |
| `src/gateway/dashboard.ts` | Memory Graph panel, Logs panel improvements |
| `src/gateway/server.ts` | Rate limiting, CORS, mesh endpoints, model discovery API |
| `src/memory/graph.ts` | Provider-agnostic entity extraction, getGraphContext() |
| `src/memory/memory.ts` | Edge case fixes |
| `src/providers/anthropic.ts` | fetchWithRetry, streaming improvements |
| `src/providers/google.ts` | fetchWithRetry, streaming improvements |
| `src/providers/ollama.ts` | Minor fixes |
| `src/providers/openai.ts` | fetchWithRetry, streaming improvements |
| `src/providers/router.ts` | Alias resolution, model discovery, 14-provider registry |
| `src/security/shield.ts` | Pattern updates |
| `src/skills/builtin/filesystem.ts` | Path traversal fix |
| `src/skills/builtin/web_browser.ts` | Stability improvements |
| `src/skills/builtin/web_fetch.ts` | Error handling, timeout enforcement |
| `src/skills/registry.ts` | YAML/JS skill loading, directory tree scanning |
| `src/utils/helpers.ts` | `fetchWithRetry()`, `ensureDir()` improvements |

---

## Architecture Notes for Future Development

### Dashboard.ts Golden Rule
**NEVER use inline onclick with string IDs in dashboard.ts.** Always use `data-*` attributes:
```javascript
// CORRECT:
'<button data-id="' + item.id + '" onclick="myFn(this.dataset.id)">Click</button>'
// WRONG (breaks after esbuild compilation):
'<button onclick="myFn(\\''+item.id+'\\')">Click</button>'
```

### Validate Browser JS After Dashboard Changes
```bash
npm run build
node -e "
const fs=require('fs');
const s=fs.readFileSync('dist/gateway/server.js','utf8');
const a=s.indexOf('<script>')+8, b=s.indexOf('</script>',a);
fs.writeFileSync('/tmp/browser_check.js', s.slice(a,b));
"
node --check /tmp/browser_check.js
```

### Version Strings
Never hardcode version strings. Always import `TITAN_VERSION` from `src/utils/constants.ts`.

### Provider Pattern
Use `OpenAICompatProvider` for any new provider that supports the OpenAI chat completions API format. Only create a custom provider class for providers with unique APIs (like Anthropic's Messages API or Google's Gemini API).

### Skill Pattern
All skills follow the `ToolHandler` interface:
```typescript
{
  name: string;
  description: string;
  parameters: { type: 'object', properties: {...}, required?: string[] };
  execute: (args: Record<string, unknown>) => Promise<string>;
}
```

### Channel Pattern
All channels extend `ChannelAdapter` from `src/channels/base.ts`:
```typescript
abstract class ChannelAdapter extends EventEmitter {
  abstract name: string;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: OutboundMessage): Promise<void>;
  abstract getStatus(): ChannelStatus;
}
```
