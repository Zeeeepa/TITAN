# Contributing to TITAN

Thank you for your interest in contributing to TITAN! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/titan-agent/titan.git
cd titan
npm install
npm run dev -- gateway
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode (with tsx) |
| `npm run build` | Build for production (with tsup) |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix linting issues |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run gateway:watch` | Start gateway with auto-reload |

## Code Style

- TypeScript strict mode
- ESLint with `@typescript-eslint`
- Prefer named exports
- Use the logger for all output (no bare `console.log` in library code)
- Use Zod for runtime validation
- All async functions should handle errors

## Adding a New Skill

1. Create `src/skills/builtin/my_skill.ts`
2. Export a `registerMySkill()` function
3. Use `registerSkill()` from the registry
4. Import and call in `registry.ts` → `initBuiltinSkills()`

## Adding a New Channel

1. Create `src/channels/my_channel.ts`
2. Extend `ChannelAdapter` from `base.ts`
3. Implement `connect()`, `disconnect()`, `send()`, `getStatus()`
4. Register in `gateway/server.ts`

## Adding a New LLM Provider

1. Create `src/providers/my_provider.ts`
2. Extend `LLMProvider` from `base.ts`
3. Implement `chat()`, `chatStream()`, `listModels()`, `healthCheck()`
4. Register in `providers/router.ts`

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run `npm run typecheck && npm run lint && npm run test`
5. Submit a pull request

## License

By contributing, you agree that your contributions will be licensed under MIT.
