# TITAN Ollama Model Guide

Recommendations for running TITAN with local models via Ollama.

TITAN needs models with **native tool calling** (function calling) support. Models without it will fail to use tools reliably.

---

## Quick Recommendations

| Tier | RAM / VRAM | Model | Speed | Why |
|------|-----------|-------|-------|-----|
| **Starter** | 8 GB | `qwen3.5:4b` | ~150 tok/s | Best lightweight model, 256K context, native tool calling |
| **Standard** | 16 GB | `qwen3.5:9b` | ~80-120 tok/s | Best balanced — fast, accurate, 256K context |
| **Power** | 32 GB+ | `qwen3-coder:32b` | ~20-40 tok/s | Community-tested "extremely stable" tool calling |

```bash
# Install your tier
ollama pull qwen3.5:4b       # Starter
ollama pull qwen3.5:9b       # Standard
ollama pull qwen3-coder:32b  # Power
```

---

## By Use Case

### Coding & Development
| Model | Size | Notes |
|-------|------|-------|
| `qwen3-coder:32b` | 32B | Purpose-built for code, excellent tool schemas |
| `qwen3.5:9b` | 9B | Good code generation at 1/4 the size |

### Reasoning & Analysis
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:9b` | 9B | Strong reasoning with `/think` toggle |
| `qwen3.5:4b` | 4B | Surprisingly capable for lightweight reasoning |

### Speed-Critical (Real-Time Chat)
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:4b` | 4B | 150+ tok/s on modern hardware |
| `qwen3.5:1.5b` | 1.5B | Ultra-fast, basic tasks only |

### Tool Calling (Agent Use)
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:9b` | 9B | Native tool calling, 256K context |
| `qwen3-coder:32b` | 32B | Most reliable tool schemas |
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
| **LLaMA 3.x** (all sizes) | Weak tool schema adherence — frequently hallucinates parameters, inconsistent function call format |
| **LLaMA 3.1** | Previously TITAN's default; replaced due to poor tool calling reliability |
| **Mistral/Mixtral** (local) | Inconsistent tool calling support across quantizations |
| **Phi-3/Phi-4** | No native tool calling in Ollama builds |
| **Gemma 2** | Limited tool calling, tends to narrate instead of calling tools |

These models may work fine for simple chat, but will produce unreliable results when TITAN tries to use tools.

---

## Hardware Guidelines

| Setup | Recommendation |
|-------|---------------|
| Laptop, 8 GB RAM | `qwen3.5:4b` — runs well on CPU |
| Desktop, 16 GB RAM | `qwen3.5:9b` — good balance |
| Desktop, 24 GB VRAM (RTX 4090) | `qwen3-coder:32b` — full GPU offload |
| Server, 32+ GB RAM | `qwen3-coder:32b` or multiple models |
| Raspberry Pi 5 (8 GB) | `qwen3.5:1.5b` — basic tasks only |

### GPU Acceleration

Ollama automatically uses your GPU if available. Check with:

```bash
ollama ps   # Shows running models and GPU layers
```

For NVIDIA GPUs, ensure you have the latest drivers. For Apple Silicon, Metal acceleration is automatic.

---

## Using Multiple Models

TITAN supports model aliases for routing different tasks to different models:

```json
{
  "agent": {
    "modelAliases": {
      "local": "ollama/qwen3.5:4b",
      "fast": "ollama/qwen3.5:4b",
      "smart": "ollama/qwen3-coder:32b"
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
