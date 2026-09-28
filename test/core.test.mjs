import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildAgyArgs,
  buildAgyStdin,
  buildPrompt,
  createStreamingRedactor,
  createServerAdapter,
  inferProvider,
  isTransientError,
  parseAgyStream,
  parseAgyError,
  redactValue,
  sessionCodec,
} from "../dist/index.js";

const require = createRequire(import.meta.url);
const uiParser = require("../ui-parser.cjs");

test("registra o contrato externo esperado pelo Paperclip", () => {
  const adapter = createServerAdapter();
  assert.equal(adapter.type, "maxpaperclip_agy");
  assert.equal(typeof adapter.execute, "function");
  assert.equal(typeof adapter.testEnvironment, "function");
  assert.equal(adapter.supportsInstructionsBundle, true);
  assert.equal(adapter.runtimeToolDelivery, "environment");
});

test("monta argumentos seguros com sandbox por padrão", () => {
  const args = buildAgyArgs({
    conversationId: "conv-1",
    model: "auto",
    effort: "high",
    cwd: "/workspace",
    permissionMode: "sandbox",
  });
  assert.deepEqual(args.slice(0, 4), ["--input-format", "stream-json", "--output-format", "stream-json"]);
  assert.ok(args.includes("--conversation"));
  assert.ok(args.includes("--dangerously-skip-permissions"));
  assert.ok(args.includes("--sandbox"));
  assert.equal(args.includes("--print"), false);
  assert.equal(args.includes("--print-timeout"), false);
  assert.equal(buildAgyStdin("Faça a tarefa"), '{"event":"user","message":{"content":"Faça a tarefa"}}\n');
});

test("não combina effort com modelo que já contém o nível", () => {
  const args = buildAgyArgs({
    conversationId: null,
    model: "gemini-flash-high",
    effort: "low",
    cwd: "/workspace",
    permissionMode: "workspace",
  });
  assert.equal(args.includes("--effort"), false);
  assert.equal(args.includes("--sandbox"), false);
});

test("só envia effort no modo automático", () => {
  const automatic = buildAgyArgs({ conversationId: null, model: "auto", effort: "high", cwd: "/workspace", permissionMode: "sandbox" });
  const claude = buildAgyArgs({ conversationId: null, model: "claude-sonnet-4-6", effort: "high", cwd: "/workspace", permissionMode: "sandbox" });
  assert.ok(automatic.includes("--effort"));
  assert.equal(claude.includes("--effort"), false);
});

test("encaminha tarefas de planejamento e desabilita comandos slash", () => {
  const args = buildAgyArgs({ conversationId: null, model: "auto", effort: "", cwd: "/workspace", permissionMode: "sandbox", mode: "plan" });
  assert.ok(args.includes("--mode"));
  assert.ok(args.includes("plan"));
  assert.ok(args.includes("--disable-slash-commands"));
});

test("redige segredos divididos entre chunks sem falsos positivos", async () => {
  const logs = [];
  const redactor = createStreamingRedactor(["segredo-muito-comprido"], async (_stream, chunk) => logs.push(chunk));
  await redactor.write("stdout", "valor=segredo-muito-");
  await redactor.write("stdout", "comprido\nmonkey=visível\n");
  await redactor.flush();
  assert.equal(logs.join("").includes("segredo-muito-comprido"), false);
  assert.match(logs.join(""), /\*\*\*REDACTED\*\*\*/);
  assert.match(logs.join(""), /monkey=visível/);
  assert.deepEqual(redactValue({ accessToken: { nested: "nunca" }, tokenizer: "mantido", keyboardShortcut: "mantido" }), {
    accessToken: "***REDACTED***",
    tokenizer: "mantido",
    keyboardShortcut: "mantido",
  });
});

test("interpreta erros estruturados do agy", () => {
  const parsed = parseAgyError('aviso\nAGY_ERROR: {"code":"quota","status":"RESOURCE_EXHAUSTED","message":"limite","retryable":true,"error_id":"e-1","retry_not_before":"2026-10-01T00:00:00Z"}\n');
  assert.equal(parsed.code, "quota");
  assert.equal(parsed.retryable, true);
  assert.equal(parsed.errorId, "e-1");
});

test("interpreta conversa, ferramentas e uso de tokens", async () => {
  const fixture = await fs.readFile(new URL("./fixtures/success.jsonl", import.meta.url), "utf8");
  const parsed = parseAgyStream(fixture);
  assert.equal(parsed.conversationId, "conv-123");
  assert.equal(parsed.status, "SUCCESS");
  assert.equal(parsed.response, "Trabalho concluído.");
  assert.deepEqual(parsed.usage, {
    inputTokens: 100,
    outputTokens: 25,
    cachedInputTokens: 40,
  });
  assert.equal(parsed.thinkingTokens, 7);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0].completed, true);
  assert.equal(parsed.tools[0].output, "conteúdo");
});

test("tolera linha inválida e evento futuro", () => {
  const parsed = parseAgyStream('{inválido}\n{"event":"future_event"}\n');
  assert.equal(parsed.malformedLines, 1);
  assert.deepEqual(parsed.unknownEvents, ["future_event"]);
});

test("classifica indisponibilidade temporária do Antigravity", () => {
  assert.equal(
    isTransientError("Eligibility check failed: UNAVAILABLE (code 503)"),
    true,
  );
  assert.equal(isTransientError("invalid prompt"), false);
});

test("normaliza sessões antigas e remove campos desconhecidos", () => {
  const session = sessionCodec.deserialize({
    sessionId: "legacy-1",
    cwd: "/workspace",
    secret: "não persistir",
  });
  assert.deepEqual(session, {
    version: 1,
    conversationId: "legacy-1",
    cwd: "/workspace",
  });
});

test("não atribui o modelo automático a um fornecedor específico", () => {
  assert.equal(inferProvider("auto"), "antigravity");
  assert.equal(inferProvider("claude-sonnet"), "anthropic");
  assert.equal(inferProvider("gpt-oss"), "openai");
});

test("rejeita arquivo de instruções com caminho relativo", async () => {
  await assert.rejects(
    buildPrompt({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { instructionsFilePath: "AGENTS.md" },
      context: {},
      onLog: async () => {},
    }),
    /deve ser absoluto/,
  );
});

test("parser visual associa chamada e resultado da ferramenta", async () => {
  const fixture = await fs.readFile(new URL("./fixtures/success.jsonl", import.meta.url), "utf8");
  const entries = fixture
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => uiParser.parseStdoutLine(line, "2026-09-28T00:00:00Z"));
  assert.ok(entries.some((entry) => entry.kind === "assistant" && entry.delta === true));
  const call = entries.find((entry) => entry.kind === "tool_call");
  const result = entries.find((entry) => entry.kind === "tool_result");
  assert.equal(call.toolUseId, result.toolUseId);
  assert.ok(entries.some((entry) => entry.kind === "result" && entry.inputTokens === 100));
});

test("executa o fluxo completo pelo contrato do Paperclip", async () => {
  const fakeAgy = fileURLToPath(new URL("./fixtures/fake-agy.mjs", import.meta.url));
  await fs.chmod(fakeAgy, 0o755);
  const logs = [];
  const secret = "segredo-de-teste-comprido-123";
  process.env.MAXPAPERCLIP_TEST_SECRET = "não-deve-ser-herdado-987654321";
  let dispatches = 0;
  const result = await createServerAdapter().execute({
    runId: "run-integration",
    agent: {
      id: "agent-integration",
      companyId: "company-integration",
      name: "Agente de integração",
      adapterType: "maxpaperclip_agy",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: "TASK-1",
    },
    config: {
      command: fakeAgy,
      cwd: process.cwd(),
      permissionMode: "sandbox",
      timeoutSec: 10,
      graceSec: 1,
    },
    context: { taskTitle: "Teste de integração" },
    authToken: secret,
    onLog: async (stream, chunk) => logs.push({ stream, chunk }),
    onDispatch: () => { dispatches += 1; },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary, "OK");
  assert.equal(result.sessionDisplayId, "conv-integration");
  assert.deepEqual(result.usage, {
    inputTokens: 12,
    outputTokens: 1,
    cachedInputTokens: 3,
  });
  assert.equal(result.usageBasis, "session_cumulative");
  assert.equal(result.resultJson.antigravity.thinkingTokens, 2);
  assert.equal(dispatches, 1);
  assert.ok(logs.some((log) => log.stream === "stdout"));
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.match(JSON.stringify(result), /\*\*\*REDACTED\*\*\*/);
  assert.equal(JSON.stringify(result).includes("não-deve-ser-herdado"), false);
  assert.match(JSON.stringify(result), /unrelated=ausente/);
  delete process.env.MAXPAPERCLIP_TEST_SECRET;
});

test("não inicia o provedor quando o cancelamento chega antes do despacho", async () => {
  const controller = new AbortController();
  let dispatches = 0;
  const result = await createServerAdapter().execute({
    runId: "run-cancelled-before-dispatch",
    signal: controller.signal,
    onCancellationReady: async () => controller.abort(),
    agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { command: "/comando/que/não/deve/ser/executado", cwd: process.cwd() },
    context: {},
    onLog: async () => {},
    onDispatch: () => { dispatches += 1; },
  });
  assert.equal(result.errorCode, "agy_cancelled_before_dispatch");
  assert.deepEqual(result.executionRecovery, { kind: "bootstrap", providerWorkStarted: false });
  assert.equal(dispatches, 0);
});
