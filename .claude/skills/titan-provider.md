---
name: titan-provider
description: TITAN LLM provider development helper. Understands the provider system, model routing, and how to add/debug providers.
user_invocable: true
---

# TITAN Provider Development

Context for working with TITAN's LLM provider system.

## Architecture

- **Router**: `src/providers/base.ts` — `parseModelId()` splits `"provider/model"` format
- **34 providers**: 4 native (Anthropic, OpenAI, Google, Ollama) + 30 OpenAI-compatible
- **Format**: Always `"provider/model-name"` (e.g., `"ollama/qwen3.5:35b"`)
- **Config**: `src/config/schema.ts` — model, provider, fallback chains

## Model Routing Flow

1. User sends `POST /api/message` with optional `model` field
2. Gateway calls `routeMessage()` which resolves the active model
3. `parseModelId("ollama/qwen3.5:35b")` returns `{ provider: "ollama", model: "qwen3.5:35b" }`
4. Provider adapter sends request to the LLM
5. Response streamed back via SSE or returned as JSON

## Adding a New Provider

1. Check if it's OpenAI-compatible (most are)
2. If OpenAI-compatible, add to the provider registry in `src/providers/`
3. If custom protocol, create a new provider class extending the base
4. Add model IDs to the models list
5. Test: `curl -s -X POST http://192.168.1.11:48420/api/message -H "Content-Type: application/json" -d '{"content": "test", "model": "newprovider/model-name"}'`

## Debugging Provider Issues

```bash
# Check available models
curl -s http://192.168.1.11:48420/api/models | python3 -m json.tool

# Check current config
curl -s http://192.168.1.11:48420/api/config | python3 -m json.tool | grep -A5 model

# Switch model
curl -s -X POST http://192.168.1.11:48420/api/model/switch \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama/qwen3.5:35b"}'

# Test with specific model
curl -s -X POST http://192.168.1.11:48420/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "ping", "model": "ollama/qwen3.5:35b"}'
```

## Ollama on Titan PC

- URL: `http://localhost:11434` (from Titan PC) or `http://192.168.1.11:11434` (from LAN)
- Models: qwen3.5:35b, qwen3:30b, devstral-small-2
- GPU: RTX 5090 32GB VRAM
