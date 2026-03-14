/**
 * TITAN as an MCP Server — expose TITAN's tools to Claude Desktop, Cursor, etc.
 *
 * TITAN can run as a Model Context Protocol (MCP) server, letting other
 * AI agents call TITAN's 100+ tools over JSON-RPC.
 *
 * Setup:
 *
 * 1. Enable MCP server mode in ~/.titan/titan.json:
 *    {
 *      "mcp": {
 *        "enabled": true,
 *        "transport": "stdio"
 *      }
 *    }
 *
 * 2. Add TITAN to your MCP client config:
 *
 *    Claude Desktop — ~/Library/Application Support/Claude/claude_desktop_config.json:
 *    {
 *      "mcpServers": {
 *        "titan": {
 *          "command": "npx",
 *          "args": ["titan-agent", "mcp"]
 *        }
 *      }
 *    }
 *
 *    Cursor — .cursor/mcp.json (in your project root):
 *    {
 *      "mcpServers": {
 *        "titan": {
 *          "command": "npx",
 *          "args": ["titan-agent", "mcp"]
 *        }
 *      }
 *    }
 *
 * 3. Restart your MCP client. TITAN's tools will appear automatically.
 *
 * Run this script to verify your config is correct:
 *   npx tsx examples/mcp-server.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".titan", "titan.json");

function checkConfig() {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    console.error(`Could not read ${CONFIG_PATH}`);
    console.error('Run "titan gateway" first to generate a default config.');
    process.exit(1);
  }

  // Check MCP config
  const mcp = config.mcp as Record<string, unknown> | undefined;
  if (!mcp?.enabled) {
    console.log("MCP server mode is NOT enabled in titan.json.");
    console.log(`\nAdd this to ${CONFIG_PATH}:\n`);
    console.log(
      JSON.stringify({ mcp: { enabled: true, transport: "stdio" } }, null, 2),
    );
    console.log("\nThen restart your MCP client.");
    return;
  }

  console.log("MCP server mode is enabled.");
  console.log(`Transport: ${mcp.transport ?? "stdio"}`);

  // Check Claude Desktop config
  const claudeConfigPath = join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
  try {
    const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, "utf-8"));
    if (claudeConfig.mcpServers?.titan) {
      console.log("\nClaude Desktop: TITAN MCP server configured.");
    } else {
      console.log("\nClaude Desktop: TITAN not found in mcpServers.");
      console.log(`Add to ${claudeConfigPath}:`);
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              titan: { command: "npx", args: ["titan-agent", "mcp"] },
            },
          },
          null,
          2,
        ),
      );
    }
  } catch {
    console.log("\nClaude Desktop config not found (optional).");
  }

  console.log('\nTo start TITAN in MCP mode: npx titan-agent mcp');
}

checkConfig();
