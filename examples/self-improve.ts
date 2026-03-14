/**
 * TITAN Self-Improvement — enable the autopilot self-improvement cycle.
 *
 * This activates TITAN's autopilot mode, which allows the agent to
 * autonomously review its own performance, identify weaknesses, and
 * generate improvement plans.
 *
 * Prerequisites: a running TITAN gateway (`titan gateway`).
 * Run: npx tsx examples/self-improve.ts
 */

const TITAN_URL = process.env.TITAN_URL ?? "http://localhost:48420";

async function enableAutopilot() {
  // Step 1: Enable autopilot mode
  console.log("Enabling autopilot...");
  const toggleRes = await fetch(`${TITAN_URL}/api/autopilot/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  if (!toggleRes.ok) {
    throw new Error(`Failed to toggle autopilot: ${toggleRes.status}`);
  }

  const toggleData = await toggleRes.json();
  console.log("Autopilot status:", toggleData);

  // Step 2: Trigger a self-improvement task via a message
  console.log("\nTriggering self-improvement cycle...");
  const res = await fetch(`${TITAN_URL}/api/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content:
        "Run a self-improvement cycle: review recent conversations, " +
        "identify areas where your responses could be better, and " +
        "create an improvement plan.",
    }),
  });

  if (!res.ok) {
    throw new Error(`Message failed: ${res.status}`);
  }

  const data = await res.json();
  console.log(`\nModel: ${data.model}`);
  console.log(`Tools used: ${data.toolsUsed?.join(", ") ?? "none"}`);
  console.log(`Duration: ${data.durationMs}ms`);
  console.log(`\nResponse:\n${data.content}`);
}

async function disableAutopilot() {
  // Clean up: disable autopilot when done
  await fetch(`${TITAN_URL}/api/autopilot/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  console.log("\nAutopilot disabled.");
}

async function main() {
  try {
    await enableAutopilot();
  } finally {
    await disableAutopilot();
  }
}

main().catch(console.error);
