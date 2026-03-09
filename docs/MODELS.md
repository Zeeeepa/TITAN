# TITAN Ollama Model Guide

Recommendations for running TITAN with local models via Ollama.

TITAN needs models with **native tool calling** (function calling) support. Models without it will fail to use tools reliably.

---

## Quick Recommendations

| Tier | RAM / VRAM | Model | Speed | Why |
|------|-----------|-------|-------|-----|
| **Starter (GPU)** | 8 GB VRAM | `qwen3.5:4b` | ~150 tok/s | Best lightweight model, 256K context, native tool calling |
| **Starter (CPU)** | 8-12 GB RAM | `llama3.2:3b` | ~16 tok/s | Fastest CPU inference, native tool calling |
| **Standard** | 16 GB | `qwen3.5:9b` | ~80-120 tok/s | Best balanced — fast, accurate, 256K context |
| **Power** | 32 GB+ | `qwen3.5:35b` | ~20-40 tok/s | Excellent reasoning and tool calling, 256K context |
| **Power (Code)** | 32 GB+ | `qwen3-coder:32b` | ~20-40 tok/s | Purpose-built for code, stable tool schemas |

```bash
# Install your tier
ollama pull llama3.2:3b      # Starter (CPU-only)
ollama pull qwen3.5:4b       # Starter (GPU)
ollama pull qwen3.5:9b       # Standard
ollama pull qwen3.5:35b      # Power
ollama pull qwen3-coder:32b  # Power (Code)
```

---

## New Model Highlights (2026.6.x)

| Model | Size | Notes |
|-------|------|-------|
| **qwen3.5:35b** | 35B | Strong step up from 9B — better reasoning, better tool schemas, still fits in 32GB VRAM. Recommended as the new default "Power" tier. |
| **devstral-small-2** | ~22B | Mistral's latest code model. Good tool calling, optimized for development tasks. Viable alternative to qwen3-coder for coding workflows. |
| **kimi-k2.5** | Cloud | Available through the Kimi provider (OpenAI-compat). Competitive with GPT-4o on reasoning benchmarks. Use via `titan config set providers.kimi.apiKey "..."` |

---

## Tool Search & Compact Mode

TITAN's Tool Search system sends only 8 core tools to the LLM by default, adding others on demand via the `tool_search` meta-tool. This is especially beneficial for smaller local models:

- **Smaller context usage** — 8 tools instead of 95 means ~85% fewer input tokens per request
- **Better tool selection** — Smaller models make more accurate tool choices when they're not overwhelmed with 95 options
- **Faster inference** — Less input = faster generation, especially on CPU

If you're running models under 10B parameters, Tool Search is strongly recommended (enabled by default).

```json
{
  "toolSearch": {
    "enabled": true,
    "coreTools": ["shell", "read_file", "write_file", "edit_file", "list_dir", "web_search", "memory", "tool_search"]
  }
}
```

---

## By Use Case

### Coding & Development
| Model | Size | Notes |
|-------|------|-------|
| `qwen3-coder:32b` | 32B | Purpose-built for code, excellent tool schemas |
| `devstral-small-2` | ~22B | Mistral's code model, good tool calling |
| `qwen3.5:9b` | 9B | Good code generation at 1/4 the size |

### Reasoning & Analysis
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:35b` | 35B | Strong reasoning with `/think` toggle |
| `qwen3.5:9b` | 9B | Solid reasoning at a lighter weight |
| `qwen3.5:4b` | 4B | Surprisingly capable for lightweight reasoning |

### Speed-Critical (Real-Time Chat)
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:4b` | 4B | 150+ tok/s on modern hardware |
| `qwen3.5:1.5b` | 1.5B | Ultra-fast, basic tasks only |

### Tool Calling (Agent Use)
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:35b` | 35B | Most reliable tool calling at this tier |
| `qwen3.5:9b` | 9B | Native tool calling, 256K context |
| `qwen3-coder:32b` | 32B | Most reliable tool schemas for code tasks |
| `qwen3.5:4b` | 4B | Good tool calling for its size |

---

## Installation

```bash
# 1. Install Ollama (if not already installed)
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Pull a recommended model
ollama pull qwen3.5:9b

# 3. Configure TITAN to use it
titan config set agent.model ollama/qwen3.5:9b

# Or use the 'local' alias (preconfigured)
titan model --set local
```

### Verifying Tool Calling Works

```bash
# Quick test — TITAN should use the shell tool
titan agent -m "What is the current date and time?"
```

If the model responds with a tool call to `shell` running `date`, tool calling is working.

---

## Models to Avoid for Agent Use

These models have known issues with TITAN's tool calling requirements:

| Model | Issue |
|-------|-------|
| **DeepSeek-R1** (all sizes) | Unstable tool calling — generates malformed JSON schemas, often ignores tool definitions entirely |
| **LLaMA 3.1** | Previously TITAN's default; replaced due to poor tool calling reliability |
| **Mistral/Mixtral** (local) | Inconsistent tool calling support across quantizations |
| **Phi-3/Phi-4** | No native tool calling in Ollama builds |
| **Gemma 2** | Limited tool calling, tends to narrate instead of calling tools |
| **dolphin3** (all sizes) | No Ollama native tool calling support — returns "does not support tools" error |
| **arcee-agent** (all sizes) | Despite being "built for function calling", no Ollama native tool support |

**Note on LLaMA 3.2:3b:** Supported for tool calling but tends to hallucinate unnecessary tool calls (e.g., calling `web_search` for "What is 2+2?"). TITAN's small model tool reduction mitigates this. Best option for CPU-only hardware due to speed.

These models may work fine for simple chat, but will produce unreliable results when TITAN tries to use tools.

---

## Hardware Guidelines

| Setup | Recommendation |
|-------|---------------|
| Mini PC, 8-12 GB RAM (CPU-only) | `llama3.2:3b` — 16 tok/s, fastest CPU model with tool calling |
| Laptop, 8 GB RAM | `qwen3.5:4b` — runs well on GPU, slow on CPU (~6 tok/s) |
| Desktop, 16 GB RAM | `qwen3.5:9b` — good balance |
| Desktop, 24 GB VRAM (RTX 4090) | `qwen3-coder:32b` — full GPU offload |
| Desktop, 32 GB VRAM (RTX 5090) | `qwen3.5:35b` — best all-around local model |
| Server, 32+ GB RAM | `qwen3.5:35b` or multiple models |
| Raspberry Pi 5 (8 GB) | `qwen3.5:1.5b` — basic tasks only |

### CPU-Only Benchmarks (Ryzen 7 5825U, 12GB RAM)

Tested on GMKtec M5 PLUS with TITAN v2026.5.9:

| Model | Raw Speed | Tool Calling | TITAN Agent | Notes |
|-------|-----------|-------------|-------------|-------|
| `llama3.2:3b` | 16.1 tok/s | Native (Ollama) | 68-132s per query | Fastest, but hallucinates tools on simple questions |
| `qwen3.5:4b` | 5.7 tok/s | Native (Ollama) | 169s+ per query | Excellent quality, too verbose for CPU |
| `dolphin3:8b` | 7.0 tok/s | Not supported | N/A | Good quality, no Ollama tool calling support |
| `arcee-agent:7b` | 6.5 tok/s | Not supported | N/A | Despite name, no native tool calling in Ollama |

**Recommendation for CPU-only:** Use `llama3.2:3b` for speed. Accept ~70-130s response times for tool-using queries. For chat-only (no tools), `dolphin3:8b` gives better quality at ~7 tok/s.

### GPU Acceleration

Ollama automatically uses your GPU if available. Check with:

```bash
ollama ps   # Shows running models and GPU/CPU split
```

For NVIDIA GPUs, ensure you have the latest drivers. For Apple Silicon, Metal acceleration is automatic.

> **Note:** Integrated GPUs (AMD APUs, Intel UHD) are generally NOT used by Ollama for inference. `ollama ps` will show `100% CPU` even if `/dev/kfd` exists.

---

## Using Multiple Models

TITAN supports model aliases for routing different tasks to different models:

```json
{
  "agent": {
    "modelAliases": {
      "local": "ollama/qwen3.5:35b",
      "fast": "ollama/qwen3.5:4b",
      "smart": "ollama/qwen3.5:35b"
    }
  }
}
```

With smart routing enabled, TITAN automatically picks the cheaper model for simple queries.

---

## Updating Models

Ollama models update regularly. Pull the latest version:

```bash
ollama pull qwen3.5:9b   # Re-pulls if a newer version exists
```

Check what you have installed:

```bash
ollama list
```
