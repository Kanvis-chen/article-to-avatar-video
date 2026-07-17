import { CodexAppServerClient } from "./client.js";

const client = new CodexAppServerClient();
const timeoutMs = 60_000;
let output = "";
let completed = false;
const wireEvents: Array<{ method?: string; id?: string | number; response?: boolean }> = [];

try {
  const initialized = await client.connect();
  client.onWireMessage((message) => {
    if (!message || typeof message !== "object") return;
    const candidate = message as { method?: string; id?: string | number; result?: unknown; error?: unknown };
    wireEvents.push({
      ...(candidate.method ? { method: candidate.method } : {}),
      ...(candidate.id !== undefined ? { id: candidate.id } : {}),
      ...("result" in candidate || "error" in candidate ? { response: true } : {}),
    });
    if (wireEvents.length > 50) wireEvents.shift();
  });
  const thread = await client.startThread({
    cwd: process.cwd(),
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    baseInstructions: "You are running a connectivity probe. Do not call tools or modify files. Reply with the exact requested text only.",
  });
  const completion = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(
      `Codex App Server probe timed out after ${timeoutMs}ms. Events: ${JSON.stringify(wireEvents)}. Stderr: ${client.stderrTail}`,
    )), timeoutMs);
    client.onNotification((notification) => {
      if (notification.method === "item/agentMessage/delta" && notification.params.threadId === thread.thread.id) {
        output += notification.params.delta;
      }
      if (notification.method === "turn/completed" && notification.params.threadId === thread.thread.id) {
        completed = true;
        clearTimeout(timer);
        resolve();
      }
    });
  });
  await client.startTurn({
    threadId: thread.thread.id,
    input: [{ type: "text", text: "Reply with exactly VISUALHYPER_APP_SERVER_OK", text_elements: [] }],
  });
  await completion;
  const ok = completed && output.trim() === "VISUALHYPER_APP_SERVER_OK";
  console.log(JSON.stringify({
    ok,
    platformFamily: initialized.platformFamily,
    platformOs: initialized.platformOs,
    threadId: thread.thread.id,
    output: output.trim(),
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await client.close();
}
