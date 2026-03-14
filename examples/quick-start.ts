/**
 * TITAN Quick Start — send a single message and print the response.
 *
 * Prerequisites: a running TITAN gateway (`titan gateway`).
 * Run: npx tsx examples/quick-start.ts
 */

const TITAN_URL = process.env.TITAN_URL ?? "http://localhost:48420";

async function main() {
  const res = await fetch(`${TITAN_URL}/api/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Hello! What can you do?" }),
  });

  const data = await res.json();
  console.log(`Model: ${data.model}`);
  console.log(`Response: ${data.content}`);
  console.log(`Session: ${data.sessionId} | ${data.durationMs}ms`);
}

main().catch(console.error);
