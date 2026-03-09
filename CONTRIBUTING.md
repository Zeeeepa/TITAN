# Contributing to TITAN

Thank you for your interest in contributing to TITAN. Here's everything you need to get started.

## Development Setup

```bash
git clone https://github.com/Djtony707/TITAN.git
cd TITAN
npm install
npm run dev:gateway
```

Open `http://localhost:48420` to verify the gateway is running.

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start CLI in development mode (tsx) |
| `npm run dev:gateway` | Start gateway in dev mode |
| `npm run dev:onboard` | Run onboarding wizard in dev mode |
| `npm run dev:doctor` | Run diagnostics in dev mode |
| `npm run dev:debug` | Start gateway with debug logging |
| `npm run build` | Production build (tsup, ESM) |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Coverage report (~82% line coverage) |
| `npm run ci` | Typecheck + full test suite |
| `npm start` | Run production build |

## Code Style

- TypeScript strict mode
- ESLint with `@typescript-eslint`
- Prefer named exports
- Use the logger for all output (no bare `console.log` in library code)
- Use Zod for runtime validation
- All async functions should handle errors
- ESM only (`import`/`export`, no `require`)

## Adding a New Skill

Skills are the primary way to add tools to TITAN. Each skill file registers one or more tools.

### 1. Create the skill file

```typescript
// src/skills/builtin/my_skill.ts
import { registerSkill } from '../registry.js';

export function registerMySkill(): void {
  registerSkill({
    name: 'my_tool',
    description: 'Does something useful',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'The input to process'
        },
        format: {
          type: 'string',
          description: 'Output format',
          enum: ['json', 'text', 'csv']
        }
      },
      required: ['input']
    },
    execute: async (args: { input: string; format?: string }) => {
      const result = processInput(args.input);

      if (args.format === 'json') {
        return JSON.stringify(result, null, 2);
      }
      return String(result);
    }
  });

  // You can register multiple tools in one skill file
  registerSkill({
    name: 'my_other_tool',
    description: 'A related tool',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    },
    execute: async (args: { query: string }) => {
      return `Results for: ${args.query}`;
    }
  });
}
```

### 2. Register in the skill loader

Add your registration function to `src/skills/registry.ts` in the `initBuiltinSkills()` function:

```typescript
import { registerMySkill } from './builtin/my_skill.js';

export async function initBuiltinSkills(): Promise<void> {
  // ... existing skills ...
  registerMySkill();
}
```

### 3. Add to the build config

Add the entry point to `tsup.entry` in `package.json`:

```json
{
  "tsup": {
    "entry": [
      "src/skills/builtin/my_skill.ts"
    ]
  }
}
```

### 4. Write tests

```typescript
// tests/skills/my_skill.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { registerMySkill } from '../../src/skills/builtin/my_skill.js';

describe('my_skill', () => {
  beforeAll(() => {
    registerMySkill();
  });

  it('should process input correctly', async () => {
    // Test your tool's execute function
  });
});
```

### Key rules for skills:

- Tool names should be `snake_case`
- Descriptions should be clear and concise (the LLM reads these)
- Parameters use JSON Schema format
- The `execute` function must return a string
- Keep tools focused — one action per tool

## Adding a New Provider

### OpenAI-Compatible Provider (Most Common)

Most new providers use the OpenAI-compatible chat completions API. To add one, update `src/providers/openai_compat.ts`:

```typescript
// In the PROVIDERS config object, add your provider:
const PROVIDERS: Record<string, CompatProviderConfig> = {
  // ... existing providers ...
  myprovider: {
    name: 'MyProvider',
    baseUrl: 'https://api.myprovider.com/v1',
    envKey: 'MYPROVIDER_API_KEY',
    models: [
      'myprovider/model-large',
      'myprovider/model-small',
    ]
  }
};
```

That's it. The unified OpenAI-compat adapter handles authentication, streaming, tool calling, and failover for all 17 compatible providers.

### Native Provider (Full API Integration)

If the provider has a significantly different API:

1. Create `src/providers/my_provider.ts`
2. Extend `LLMProvider` from `base.ts`
3. Implement: `chat()`, `chatStream()`, `listModels()`, `healthCheck()`
4. Register in `src/providers/router.ts`

Look at `anthropic.ts`, `openai.ts`, `google.ts`, or `ollama.ts` for examples of native provider implementations.

## Adding a New Channel

1. Create `src/channels/my_channel.ts`
2. Extend `ChannelAdapter` from `base.ts`
3. Implement: `connect()`, `disconnect()`, `send()`, `getStatus()`
4. Register in `src/gateway/server.ts`

See existing adapters (discord.ts, telegram.ts, slack.ts) for the pattern.

## Testing

TITAN uses Vitest. Current stats: 3,323 tests across 94 files, ~82% line coverage.

```bash
# Run all tests
npm run test

# Run specific test file
npx vitest run tests/skills/my_skill.test.ts

# Watch mode (re-runs on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test expectations

- All new features should have tests
- All new skills should have a corresponding test file
- Coverage target: ~82% line coverage (don't let it drop)
- Tests should be fast — mock external API calls
- Use `describe`/`it`/`expect` from Vitest
- Async tests should use `async`/`await`, not callbacks

## PR Checklist

Before submitting a pull request, make sure:

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run lint` passes (or `lint:fix` applied)
- [ ] `npm run test` passes — all 3,323+ tests green
- [ ] New features have tests
- [ ] New skills are registered in `registry.ts` and added to `tsup.entry`
- [ ] No new `console.log` statements (use the logger)
- [ ] No new runtime dependencies without discussion (TITAN aims for minimal deps)
- [ ] Tool descriptions are clear (the LLM reads them to decide when to use tools)
- [ ] Breaking config changes update `src/config/schema.ts`

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run the full check: `npm run typecheck && npm run lint && npm run test`
5. Commit with a descriptive message: `git commit -m "feat: add my feature"`
6. Push: `git push origin feat/my-feature`
7. Open a Pull Request

## Architecture Overview

```
src/
  agent/        Core agent loop, multi-agent, deliberation, reflection, sub-agents, orchestrator, goals
  auth/         OAuth token managers (Google)
  browsing/     Shared browser pool, Stagehand natural language automation
  channels/     9 adapters: Discord, Telegram, Slack, Google Chat, WhatsApp, Matrix, Signal, Teams, WebChat
  providers/    4 native + 17 OpenAI-compatible (21 total)
  memory/       Episodic, learning, relationship, temporal graph
  skills/       36 built-in skill files exposing 95 tools + user skill loader
  security/     Shield, sandbox, encryption, pairing, vault, audit log
  gateway/      HTTP/WS server + Mission Control dashboard + OAuth endpoints
  mesh/         mDNS + Tailscale peer discovery, WebSocket transport
  recipes/      Workflow engine + persistence
  mcp/          Model Context Protocol client
  config/       Zod schema + loader
  cli/          Commander.js CLI, self-healing doctor
  utils/        Constants, logger, helpers
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown.

## License

By contributing, you agree that your contributions will be licensed under MIT.
