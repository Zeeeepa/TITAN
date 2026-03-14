/**
 * TITAN Research Agent — trigger a deep research task via the API.
 *
 * Sends a research prompt that activates TITAN's deep_research tool,
 * then streams the results back in real time using SSE.
 *
 * Prerequisites: a running TITAN gateway (`titan gateway`).
 * Run: npx tsx examples/research-agent.ts
 */

const TITAN_URL = process.env.TITAN_URL ?? "http://localhost:48420";

const RESEARCH_PROMPT =
  "Research the top 5 AI agent frameworks and compare them. " +
  "Include architecture, language support, tool ecosystem, and community size.";

async function main() {
  console.log("Starting research task (streaming)...\n");

  // Use SSE streaming so results arrive incrementally
  const res = await fetch(`${TITAN_URL}/api/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      content: RESEARCH_PROMPT,
      // Omit sessionId to start a new session, or pass one to continue
    }),
  });

  if (!res.ok) {
    throw new Error(`TITAN returned ${res.status}: ${await res.text()}`);
  }

  // Read the SSE stream
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") {
        console.log("\n\nResearch complete.");
        return;
      }
      try {
        const event = JSON.parse(payload);
        if (event.content) process.stdout.write(event.content);
        if (event.toolsUsed) {
          console.log(`\n\nTools used: ${event.toolsUsed.join(", ")}`);
        }
      } catch {
        // non-JSON line, skip
      }
    }
  }
}

main().catch(console.error);
