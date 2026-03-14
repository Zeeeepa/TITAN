# TITAN Examples

Runnable examples for the [titan-agent](https://www.npmjs.com/package/titan-agent) framework.

## Prerequisites

- Node.js 20+
- A running TITAN gateway (`titan gateway` or `npx titan-agent gateway`)
- [tsx](https://github.com/privatenumber/tsx) for running TypeScript directly

## Examples

| File | Description |
|------|-------------|
| [quick-start.ts](quick-start.ts) | Minimal example — send a message and print the response. Start here. |
| [discord-bot.ts](discord-bot.ts) | Configure TITAN as a Discord bot via `titan.json` channel config. |
| [research-agent.ts](research-agent.ts) | Trigger a deep research task through the API. |
| [self-improve.ts](self-improve.ts) | Enable TITAN's self-improvement cycle via the Autopilot API. |
| [mcp-server.ts](mcp-server.ts) | Configure TITAN as an MCP server for Claude Desktop or Cursor. |

## Running

Start the TITAN gateway first:

```bash
titan gateway
# or
npx titan-agent gateway
```

Then run any example:

```bash
npx tsx examples/quick-start.ts
npx tsx examples/research-agent.ts
```

## Configuration

TITAN reads its config from `~/.titan/titan.json`. Each example includes comments showing the relevant config keys. See the main [README](../README.md) for full configuration docs.
