#!/usr/bin/env node

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("1.2.12-fake");
  process.exit(0);
}
if (args.includes("models")) {
  console.log("fake-model\tModelo de teste");
  process.exit(0);
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
  event: "result",
  result: {
    status: "SUCCESS",
    response: "OK",
    num_turns: 1,
    usage: { input_tokens: 12, output_tokens: 1, cache_read_tokens: 3, thinking_tokens: 2 },
  },
}));

