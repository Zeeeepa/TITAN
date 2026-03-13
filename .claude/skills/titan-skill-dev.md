---
name: titan-skill-dev
description: TITAN tool/skill development helper. Understands the skill registry, tool definitions, Zod schemas, and how to add new tools.
user_invocable: true
---

# TITAN Skill/Tool Development

Context for adding or modifying TITAN's tools and skills.

## Architecture

- **Skill files**: `src/skills/builtin/` (36 files, ~112 tools)
- **Dev skills**: `src/skills/dev/` (env-gated with `TITAN_DEV_SKILLS=1`)
- **Registry**: `src/skills/registry.ts` — registers all tools at startup
- **Tool format**: Each tool is an object with `name`, `description`, `parameters` (Zod schema), and `execute` function

## Tool Definition Pattern

```typescript
import { z } from 'zod';

export const myTool = {
  name: 'my_tool',
  description: 'Does something useful',
  parameters: z.object({
    input: z.string().describe('The input to process'),
    verbose: z.boolean().optional().describe('Enable verbose output'),
  }),
  async execute(params: { input: string; verbose?: boolean }) {
    // Implementation
    return { result: 'done' };
  },
};
```

## Adding a New Tool

1. Create or edit a skill file in `src/skills/builtin/`
2. Export the tool definition following the pattern above
3. The registry auto-discovers exported tools from skill files
4. Build: `npm run build`
5. Test: Send a message that triggers tool use

## Testing Tools

```bash
# Check tool is registered
curl -s http://192.168.1.11:48420/api/tools | python3 -m json.tool | grep -A3 "tool_name"

# Trigger tool via chat
curl -s -X POST http://192.168.1.11:48420/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Use the my_tool tool with input hello"}'
```

## Key Files

| File | Purpose |
|------|---------|
| `src/skills/registry.ts` | Tool registration, discovery |
| `src/skills/builtin/web.ts` | Web browsing tools |
| `src/skills/builtin/code.ts` | Code execution tools |
| `src/skills/builtin/memory.ts` | Memory/learning tools |
| `src/skills/builtin/voice.ts` | Voice tools (file-based STT/TTS) |
| `src/skills/builtin/research.ts` | Deep research agent |
