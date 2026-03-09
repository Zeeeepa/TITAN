# TITAN Validation Results

---

# v2026.6.7 — Autonomy Overhaul Validation

**Hardware:** GMKtec M5 PLUS (Mini PC) + Powerhouse PC (RTX 5090, 32GB VRAM)
**TITAN Version:** 2026.6.7
**Date:** 2026-03-08
**Tester:** Claude Opus 4.6 (automated)

---

## Test Suite Results

| Metric | Value |
|--------|-------|
| Total Tests | 3,323 |
| Test Files | 94 |
| Passing | 3,323 (100%) |
| Failing | 0 |
| TypeScript | Clean build (0 new errors) |

### New Test Files (v2026.6.7)

| Test File | Tests | Module |
|-----------|-------|--------|
| reflection.test.ts | 16 | Agent self-assessment |
| subAgent.test.ts | 10 | Sub-agent spawning |
| orchestrator.test.ts | 10 | Task delegation |
| goals.test.ts | 17 | Goal management |
| initiative.test.ts | 5 | Self-initiative |
| goals-skill.test.ts | 12 | Goal skill handlers |
| x-poster.test.ts | 14 | X/Twitter posting |
| browser-pool.test.ts | 7 | Shared browser pool |
| stagehand.test.ts | 7 | Stagehand automation |
| **Total New** | **98** | |

---

## Code Changes Validated

### Orphaned Code Wiring
| Change | Status | Notes |
|--------|--------|-------|
| Initiative → Autopilot | PASS | `checkInitiative()` called after successful goal subtask completion |
| Browser Pool → web_browser.ts | PASS | Replaced local browser mgmt with shared pool |
| Browser Pool → web_browse_llm.ts | PASS | Replaced local browser mgmt with shared pool |
| Deliberation fallback fix | PASS | Uses configured model instead of hardcoded o3-mini |

### Mini PC Deployment
| Check | Status | Notes |
|-------|--------|-------|
| Docker build | PASS | Clean build, no cached layers |
| Health endpoint | PASS | Reports v2026.6.7 |
| Tool calling (qwen3.5:35b on RTX 5090) | PASS | Tools used in responses |
| Response speed | PASS | "Super fast" — browser pool eliminates duplicate Chromium |

---

## Previous Validation Results

---

# v2026.5.9 — Mini PC Validation Results

**Hardware:** GMKtec M5 PLUS — Ryzen 7 5825U (8C/16T), 12 GB RAM, CPU-only inference
**TITAN Version:** 2026.5.9
**Date:** 2026-03-04
**Tester:** Claude Opus 4.6 (automated)

---

## Batch 9 Fix Validation

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| 3a | Port pre-check | PASS | Second instance shows friendly error "Port 48420 is already in use", exits cleanly (code 1) |
| 3b | Config get key | PASS | `titan config agent.model` → `ollama/llama3.2:3b`, `titan config nonexistent` → "Key not found" |
| 3c | Small model tool reduction | PASS | Logs "[SmallModel] Reducing tools from 10 to 7 for ollama/llama3.2:3b" (1 message per request) |
| 3d | Slash commands via /api/message | PASS | `/status` returns instantly (8ms), `model: "system"`, no LLM routing |
| 3e | Config validation | PASS | Returns 400 "No recognized fields" with valid field list |
| 3f | Stall detector (GPU detection) | FAIL | `/dev/kfd` exists (AMD iGPU), so `detectGpu()` returns true — stall timeout stays at 30s instead of 120s |
| 3g | Concurrent LLM limit | PARTIAL | Mechanism works, but default limit (5) is too high for CPU-only hardware |

**Score: 5 PASS, 1 FAIL, 1 PARTIAL** (5/7 clean, 7/7 code deployed correctly)

---

## Raw Ollama Benchmark (Bypass TITAN)

Simple prompt: "What is 2+2?"

| Model | Response | Tokens | Prompt Eval | Gen Time | Total | Tok/s |
|-------|----------|--------|-------------|----------|-------|-------|
| qwen3.5:4b | "4" | 173 | 0.5s | 29.7s | 30.8s | 5.8 |
| llama3.2:3b | "2 + 2 = 4" | 8 | 0.5s | 0.4s | 4.4s | 18.4 |
| dolphin3:8b | "Four." | 3 | 1.3s | 0.3s | 8.5s | 10.6 |
| arcee-agent:7b | "Four." | 3 | 1.4s | 0.3s | 7.6s | 9.5 |

Longer prompt: "Explain quantum computing in 3 sentences."

| Model | Tokens | Prompt Eval | Gen Time | Total | Tok/s | Quality |
|-------|--------|-------------|----------|-------|-------|---------|
| qwen3.5:4b | 1039 | 0.5s | 182.7s | 191.0s | 5.7 | Excellent (verbose) |
| llama3.2:3b | 97 | 0.5s | 6.0s | 9.8s | 16.1 | Good |
| dolphin3:8b | 106 | 2.7s | 15.1s | 27.2s | 7.0 | Good |
| arcee-agent:7b | 96 | 1.3s | 14.7s | 22.7s | 6.5 | Good |

**Key findings:**
- llama3.2:3b is 3x faster than qwen3.5:4b in tok/s (16.1 vs 5.7)
- qwen3.5:4b generates much longer responses (1039 vs ~100 tokens for same prompt)
- 8B models (dolphin3, arcee) are ~7 tok/s — usable but slow
- qwen3.5:4b quality is excellent but verbosity makes it impractical for CPU

---

## TITAN Agent Benchmark (Full Pipeline)

### qwen3.5:4b via TITAN
| Test | Duration | Tokens | Tools Used | Response |
|------|----------|--------|------------|----------|
| Q&A "2+2" | 168.6s | 2433 | (none) | "Four" — correct |
| List /etc | TIMEOUT (300s) | - | - | Failed |
| Read /etc/hostname | TIMEOUT (300s) | - | - | Failed |
| /help slash cmd | TIMEOUT (300s) | - | - | Failed |

### llama3.2:3b via TITAN
| Test | Duration | Tokens | Tools Used | Response |
|------|----------|--------|------------|----------|
| Q&A "2+2" | 130.0s | 4572 | web_search | "Four" — correct but used unnecessary tool |
| List /etc | 132.0s | 6647 | list_dir | Raw JSON in response |
| Read /etc/hostname | 71.4s | 4799 | read_file | Correct: "titanmini-M5-PL..." |
| /help slash cmd | 67.9s | 4580 | memory | Incorrect: used memory tool instead |

### dolphin3:8b via TITAN
| Test | Result | Notes |
|------|--------|-------|
| All tests | FAIL | "does not support tools" — Ollama native tool calling not supported |

### arcee-agent:7b via TITAN
| Test | Result | Notes |
|------|--------|-------|
| All tests | FAIL | "does not support tools" — Ollama native tool calling not supported |

**Key findings:**
- Only qwen3.5:4b and llama3.2:3b support Ollama native tool calling
- TITAN adds massive overhead: raw Ollama 30.8s vs TITAN 168.6s for qwen3.5:4b (5.5x slowdown)
- Stall detector firing at 30s interrupts inference and likely causes retries
- llama3.2:3b hallucinates tool calls on trivial questions
- qwen3.5:4b tool-use tests timeout because verbose output + stall interrupts = runaway duration

---

## SSE Streaming Test

`/api/chat/stream` with qwen3.5:4b, prompt: "Explain quantum computing in 3 sentences"
- **Result:** Working — clean token-by-token SSE delivery
- **Time:** ~118s
- **Quality:** Coherent, accurate response
- **Note:** SSE bypasses agent loop, so no tool calling overhead

---

## Bugs Discovered (8 total)

### Bug 1: Monitor Feedback Loop (CRITICAL)
- **Trigger:** File monitor watching `/tmp`
- **Root cause:** TITAN writes to `/tmp` (node compile cache, jiti, temp files). Each write triggers the monitor → agent message → more file I/O → infinite loop.
- **Impact:** 74K log lines in minutes, gateway completely unresponsive, 16K+ monitor triggers
- **Severity:** Critical
- **Fix needed:**
  1. Debounce file monitor events (coalesce within 2s window)
  2. Add self-reference protection (ignore TITAN's own writes)
  3. Warn users when monitoring high-churn dirs like `/tmp`
  4. Add max trigger rate limit (e.g., 1 trigger/10s per monitor)

### Bug 2: GPU Detection False Positive on Integrated GPUs (MAJOR)
- **Hardware:** Ryzen 7 5825U (Barcelo/Vega iGPU)
- **Root cause:** `/dev/kfd` exists for AMD iGPU, `detectGpu()` returns true
- **Reality:** Ollama shows `100% CPU` — iGPU is NOT used for LLM inference
- **Impact:** Stall detector fires at 30s instead of 120s, interrupting valid CPU inference
- **Severity:** Major
- **Fix:** Query `ollama ps` for actual processor usage, or check for discrete GPU with sufficient VRAM (>4GB). Also check ROCm/HIP availability rather than just `/dev/kfd`.

### Bug 3: Stall Detector Interrupts Valid CPU Inference (MAJOR)
- **Caused by:** Bug 2 (GPU false positive → 30s threshold instead of 120s)
- **Impact:** Stall nudges fire every 30s during normal CPU inference, potentially confusing the model and adding overhead. Contributes to 5.5x TITAN vs raw Ollama slowdown.
- **Severity:** Major
- **Fix:** Depends on Bug 2 fix. Also consider disabling nudges entirely for local models.

### Bug 4: Small Models Hallucinate Tool Calls (MAJOR)
- **Model:** llama3.2:3b
- **Steps:** Send "What is 2+2?" or "Say the number 1"
- **Actual:** Model calls `web_search` or `shell` for trivial questions
- **Impact:** Double inference time (tool call + final response), confusing behavior
- **Severity:** Major
- **Fix options:**
  1. Remove `web_search` from small model core tools (keep: shell, read_file, write_file, edit_file, list_dir, memory)
  2. Add system prompt instruction: "Only use tools when the user explicitly asks for an action. For questions, answer directly."
  3. Add a "no tools needed" classifier for simple questions

### Bug 5: Raw Tool Call JSON Leaked in Response (MINOR)
- **Model:** llama3.2:3b
- **Example response:** `The answer is 4. {"name": "web_search", "parameters": {"query"...`
- **Severity:** Minor — cosmetic but unprofessional
- **Fix:** Post-process responses to strip unparsed tool call JSON

### Bug 6: Models Without Tool Support Crash Immediately (MAJOR)
- **Models:** dolphin3:8b, arcee-ai/arcee-agent
- **Error:** `registry.ollama.ai/library/dolphin3:8b does not support tools`
- **Impact:** These models are completely unusable with TITAN despite being good general-purpose models
- **Severity:** Major — limits model compatibility
- **Fix:** When a model doesn't support Ollama's native tool calling:
  1. Detect the 400 error and fall back to prompt-based tool calling
  2. Or strip tools from the request and run in "chat-only" mode
  3. Or maintain a list of tool-capable models and warn users

### Bug 7: maxConcurrentTasks Too High for CPU (MINOR)
- **Default:** 5 concurrent tasks
- **Impact on CPU:** 5 simultaneous LLM requests cause 213-435s response times
- **Fix:** Auto-detect CPU-only inference and reduce to maxConcurrentTasks=2

### Bug 8: qwen3.5:4b Verbose Output (PERFORMANCE)
- **Observation:** qwen3.5:4b generates 1039 tokens for "explain quantum computing in 3 sentences" vs ~100 for other models
- **Impact:** 10x more tokens = 10x slower on CPU (191s vs ~20s)
- **Fix:** May need lower `max_tokens` for qwen3.5:4b, or use qwen3.5:4b-fast variant
- **Note:** qwen3.5:4b has thinking mode which generates internal reasoning tokens

---

## Model Recommendations

### For CPU-only mini PCs (8-12GB RAM):

| Rank | Model | Tool Support | Tok/s | Quality | Recommendation |
|------|-------|-------------|-------|---------|----------------|
| 1 | llama3.2:3b | Yes (native) | 16.1 | Good | Best for speed, but hallucinates tools |
| 2 | dolphin3:8b | No (needs fallback) | 7.0 | Good | Good quality, needs prompt-based tools |
| 3 | arcee-agent:7b | No (needs fallback) | 6.5 | Good | Despite name, no native tool support |
| 4 | qwen3.5:4b | Yes (native) | 5.7 | Excellent | Too verbose/slow for CPU, great quality |

**Default model should remain `llama3.2:3b`** for CPU hardware — it's 3x faster and has native tool calling. But needs system prompt improvements to reduce tool hallucination.

**qwen3.5:4b** is excellent quality but impractical on CPU due to verbose generation (1039 tokens for a 3-sentence answer). May work well with `max_tokens` limit or the `:4b-fast` variant.

### SMALL_MODEL_PATTERNS Updates
- Keep existing: `llama3.2`, `phi`, `gemma:2b`, `qwen3.5:4b`, `tinyllama`
- Add: `dolphin3` (no native tools — needs special handling)
- Consider: A separate `NO_TOOL_MODELS` list for models that don't support Ollama tool calling

---

## Recommendations for Batch 10

### Priority 1 (Critical)
1. **Fix monitor debouncing** — add 2s debounce + max 1 trigger/10s per monitor + ignore TITAN's own writes

### Priority 2 (Major)
2. **Fix GPU detection** — query Ollama for actual GPU/CPU processor split instead of checking `/dev/kfd`
3. **Add tool calling fallback** — when Ollama returns "does not support tools", fall back to prompt-based tool calling or chat-only mode
4. **Reduce small model tool hallucination** — remove `web_search` from core tools for small models, add "answer directly" system prompt guidance

### Priority 3 (Minor/Performance)
5. **Auto-tune concurrency** — if CPU-only, set maxConcurrentTasks=2
6. **Strip raw tool JSON** from responses
7. **Add qwen3.5:4b max_tokens cap** (e.g., 256 for small model pattern)
8. **Test qwen3.5:4b-fast** variant as potential default

---

## Verification Summary

| Criteria | Status |
|----------|--------|
| All 7 Batch 9 fixes confirmed on real hardware | 5/7 PASS (2 need refinement) |
| 4 models benchmarked with consistent test prompts | DONE |
| Bug list generated for Batch 10 | 8 bugs documented |
| Model recommendations updated based on real data | DONE |
| TITAN usable on M5 PLUS for simple tasks | PARTIAL — works but slow, needs Bug 2+3 fixes |
