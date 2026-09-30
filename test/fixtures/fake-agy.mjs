#!/usr/bin/env node

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("1.2.12-fake");
  process.exit(0);
}
if (args.includes("models")) {
  if (args.includes("json")) {
    console.log(JSON.stringify({ command: { name: "models", data: { models: [{ id: "fake-model", label: "Modelo de teste" }] } } }));
  } else {
    console.log("fake-model\tModelo de teste");
  }
  process.exit(0);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input.trim());
if (event.event !== "user" || typeof event.message?.content !== "string") {
  console.error("AGY_ERROR: " + JSON.stringify({ code: "invalid_input", message: "Evento de entrada inválido" }));
  process.exit(2);
}

if (event.message.content.includes("__HANG__")) {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

if (event.message.content.includes("__RESULT_THEN_HANG__")) {
  process.on("SIGTERM", () => {});
  console.log(JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: "resultado-terminal", conversation_id: "conv-terminal" },
  }));
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

if (event.message.content.includes("__DENIED__")) {
  console.log(JSON.stringify({
    event: "result",
    result: { status: "ERROR", denied_actions: [{ action: "run_command" }] },
  }));
  process.exit(1);
}

console.log(JSON.stringify({
  event: "init",
  conversation_id: "conv-integration",
  init: { cwd: process.cwd(), tools: [], permission_mode: "sandbox" },
}));
console.log(JSON.stringify({
  event: "step_update",
  step_update: { step_index: 1, state: "DONE", step_type: "agent_response", text_delta: "OK" },
}));
console.log(JSON.stringify({
  event: "step_update",
  step_update: {
    step_index: 2,
    state: "DONE",
    step_type: "tool",
    tool_name: "run_command",
    tool_info: {
      parameters: { CommandLine: "env" },
      output: `PAPERCLIP_API_KEY=${process.env.PAPERCLIP_API_KEY ?? "ausente"}\nunrelated=${process.env.MAXPAPERCLIP_TEST_SECRET ?? "ausente"}`,
    },
  },
}));
console.log(JSON.stringify({
  event: "result",
  result: {
    status: "SUCCESS",
    response: "OK",
    num_turns: 1,
    usage: { input_tokens: 12, output_tokens: 1, cache_read_tokens: 3, thinking_tokens: 2 },
  },
}));
