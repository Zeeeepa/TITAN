# TITAN Implementation Task Checklist
# Plan: Identity Fix + Full Settings WebGUI + Openclaw-Inspired Onboarding
# Version: 2026.4.15 — COMPLETE

Each task: [x] = done

### TASK 1 — Identity Fix (src/agent/agent.ts) ✅
- [x] Extract modelId from config.agent.model
- [x] Prepend CRITICAL: Your Identity block as FIRST content in buildSystemPrompt()
- [x] Identity block: forbids "Claude/Anthropic/GPT/Gemini", includes answer scripts
- [x] Rest of system prompt unchanged
- [x] 0 typecheck errors, 25/25 tests

### TASK 2 — New API Endpoints (src/gateway/server.ts) ✅
- [x] GET /api/models — grouped provider list + live Ollama detection (3s timeout)
- [x] GET /api/profile — returns name, technicalLevel, projectCount, goalCount
- [x] POST /api/profile — saves name + technicalLevel to relationship profile
- [x] POST /api/config — expanded: anthropicKey, openaiKey, googleKey, ollamaUrl, maxTokens, temperature, systemPrompt, shieldEnabled, shieldMode, deniedTools, networkAllowlist, gatewayPort, gatewayAuthMode, gatewayPassword, gatewayToken, channels
- [x] GET /api/config — expanded: providers (configured:bool), security (deniedTools, networkAllowlist), channels (enabled+dmPolicy)

### TASK 3 — Full Settings WebGUI (src/gateway/dashboard.ts) ✅
- [x] 6-tab settings panel with tab navigation + showStab() JS function
- [x] Tab 1 AI & Model: model dropdown (optgroup per provider), manual override, refresh Ollama, autonomy, log level, temperature slider, max tokens, custom system prompt
- [x] Tab 2 Providers: masked API key inputs with configured status, Ollama URL + test button
- [x] Tab 3 Channels: 8 channel cards (discord/telegram/slack/googlechat/whatsapp/signal/matrix/msteams) with enabled toggle, token, DM policy, save per channel
- [x] Tab 4 Security: sandbox mode, shield toggle + strictness, denied tools, network allowlist
- [x] Tab 5 Gateway: port, auth mode (none/token/password), conditional token/password fields, warning banner
- [x] Tab 6 Profile: name, technical level, project/goal count stats
- [x] Settings nav click triggers loadConfig() + populateModels() + loadProfileTab()

### TASK 4 — Improved Onboarding (src/cli/onboard.ts) ✅
- [x] Step 0: Node.js version check, Ollama model detection, Docker check
- [x] Step 0: Profile name + technical level prompt (saved to relationship profile at end)
- [x] Step 5: Added Google Chat (webhook URL) + WhatsApp (pairing note)
- [x] Step 6.5: Daemon install prompt (calls existing installDaemonService())
- [x] Completion: shows provider/model, enabled channels, daemon status, profile name

### TASK 5 — Verification ✅
- [x] TITAN_VERSION = '2026.4.15' in constants.ts
- [x] Test assertion updated to '2026.4.15'
- [x] npm run typecheck: 0 errors
- [x] npm test: 25/25 passed
- [x] npm run build: clean ESM build
- [x] npm install -g .: titan --version = 2026.4.15
