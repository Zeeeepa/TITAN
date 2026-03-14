/**
 * TITAN Discord Bot — configure and launch TITAN with Discord enabled.
 *
 * 1. Add a "discord" channel to ~/.titan/titan.json (see config below).
 * 2. Start the gateway — it will connect to Discord automatically.
 *
 * Required titan.json channel config:
 * {
 *   "channels": {
 *     "discord": {
 *       "enabled": true,
 *       "token": "YOUR_DISCORD_BOT_TOKEN",
 *       "prefix": "!titan",
 *       "allowedChannels": ["general", "ai-chat"],
 *       "adminRoles": ["Admin"]
 *     }
 *   }
 * }
 *
 * Run: npx tsx examples/discord-bot.ts
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".titan", "titan.json");

// Step 1: Read existing config
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

// Step 2: Ensure the Discord channel is configured
if (!config.channels?.discord?.token) {
  console.log("Discord bot token not found in titan.json.");
  console.log(`Edit ${CONFIG_PATH} and add a "discord" channel block:`);
  console.log(
    JSON.stringify(
      {
        channels: {
          discord: {
            enabled: true,
            token: "YOUR_DISCORD_BOT_TOKEN",
            prefix: "!titan",
            allowedChannels: ["general"],
            adminRoles: ["Admin"],
          },
        },
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

// Step 3: Enable the channel if it isn't already
if (!config.channels.discord.enabled) {
  config.channels.discord.enabled = true;
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log("Enabled Discord channel in titan.json.");
}

// Step 4: Start the gateway (Discord will auto-connect)
console.log("Starting TITAN gateway with Discord enabled...");
execSync("npx titan-agent gateway", { stdio: "inherit" });
