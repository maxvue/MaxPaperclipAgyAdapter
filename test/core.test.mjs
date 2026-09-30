import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildAgyArgs,
  buildAgyStdin,
  buildPrompt,
  allowedEnvironment,
  collectSensitiveValuesFromValue,
  createStreamingRedactor,
  createServerAdapter,
  inferProvider,
  isTransientError,
  parseAgyStream,
  parseAgyError,
  redactValue,
  loadInstructions,
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
  assert.equal(adapter.requiresMaterializedRuntimeSkills, false);
  assert.equal(adapter.runtimeToolDelivery, "environment");
});

test("mantém aprovação automática desabilitada por padrão", () => {
  const args = buildAgyArgs({
    conversationId: "conv-1",
    model: "auto",
    effort: "high",
    cwd: "/workspace",
    permissionMode: "sandbox",
  });
  assert.deepEqual(args.slice(0, 4), ["--input-format", "stream-json", "--output-format", "stream-json"]);
  assert.ok(args.includes("--conversation"));
  assert.equal(args.includes("--dangerously-skip-permissions"), false);
  assert.ok(args.includes("--sandbox"));
  assert.equal(args.includes("--print"), false);
  assert.equal(args.includes("--print-timeout"), false);
  assert.equal(buildAgyStdin("Faça a tarefa"), '{"event":"user","message":{"content":"Faça a tarefa"}}\n');
});

test("só habilita aprovação automática quando solicitada explicitamente", () => {
  const args = buildAgyArgs({
    conversationId: null,
    model: "auto",
    effort: "",
    cwd: "/workspace",
    permissionMode: "sandbox",
    dangerouslySkipPermissions: true,
  });
  assert.ok(args.includes("--dangerously-skip-permissions"));
});

test("usa uma única lista segura de variáveis herdadas", () => {
  const environment = allowedEnvironment({ PAPERCLIP_RUN_ID: "run-1" }, {
    PATH: "/bin",
    GOOGLE_API_KEY: "segredo-google",
    VARIAVEL_NAO_PERMITIDA: "não-herdar",
  });
  assert.deepEqual(environment, {
    PATH: "/bin",
    GOOGLE_API_KEY: "segredo-google",
    PAPERCLIP_RUN_ID: "run-1",
  });
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

test("aceita o nível de raciocínio máximo do Antigravity atual", () => {
  const args = buildAgyArgs({ conversationId: null, model: "auto", effort: "max", cwd: "/workspace", permissionMode: "sandbox" });
  assert.deepEqual(args.slice(args.indexOf("--effort"), args.indexOf("--effort") + 2), ["--effort", "max"]);
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
  assert.deepEqual(collectSensitiveValuesFromValue({ nested: { clientSecret: "valor-contextual" }, tokenizer: "ignorado" }), ["valor-contextual"]);
});

test("descarta até a quebra de linha depois de uma linha excessiva", async () => {
  const logs = [];
  const redactor = createStreamingRedactor([], async (_stream, chunk) => logs.push(chunk));
  await redactor.write("stdout", "x".repeat(1024 * 1024 + 1));
  await redactor.write("stdout", "trecho-que-deve-ser-descartado");
  await redactor.write("stdout", "\nlinha-segura\n");
  await redactor.flush();
  assert.equal(logs.join("").includes("trecho-que-deve-ser-descartado"), false);
  assert.match(logs.join(""), /linha-segura/);
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

test("gera impressão digital das instruções e não as repete em sessão retomada", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "maxpaperclip-instructions-"));
  const filename = path.join(directory, "AGENTS.md");
  await fs.writeFile(filename, "MARCADOR_DE_INSTRUÇÕES\n", "utf8");
  try {
    const context = {
      runId: "run-instructions",
      agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { instructionsFilePath: filename },
      context: { taskTitle: "Teste" },
      onLog: async () => {},
    };
    const loaded = await loadInstructions(context.config);
    const first = await buildPrompt(context, false, loaded.content);
    const resumed = await buildPrompt(context, true, loaded.content);
    assert.equal(typeof loaded.fingerprint, "string");
    assert.match(first, /MARCADOR_DE_INSTRUÇÕES/);
    assert.equal(resumed.includes("MARCADOR_DE_INSTRUÇÕES"), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
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
  let invocationMeta = null;
  const secret = "segredo-de-teste-comprido-123";
  const contextSecret = "segredo-contextual-distinto-456";
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
      promptTemplate: "{{context.apiToken}}",
    },
    context: { taskTitle: "Teste de integração", apiToken: contextSecret },
    authToken: secret,
    onLog: async (stream, chunk) => logs.push({ stream, chunk }),
    onDispatch: () => { dispatches += 1; },
    onMeta: async (meta) => { invocationMeta = meta; },
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
  assert.equal(JSON.stringify(invocationMeta).includes(secret), false);
  assert.equal(JSON.stringify(invocationMeta).includes(contextSecret), false);
  assert.match(JSON.stringify(invocationMeta), /\*\*\*REDACTED\*\*\*/);
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

test("força o encerramento depois da graça quando o processo ignora SIGTERM", async () => {
  const fakeAgy = fileURLToPath(new URL("./fixtures/fake-agy.mjs", import.meta.url));
  await fs.chmod(fakeAgy, 0o755);
  const controller = new AbortController();
  const startedAt = Date.now();
  const result = await createServerAdapter().execute({
    runId: "run-cancelled-after-dispatch",
    signal: controller.signal,
    agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { command: fakeAgy, cwd: process.cwd(), timeoutSec: 20, graceSec: 1 },
    context: { taskTitle: "__HANG__" },
    onLog: async () => {},
    onDispatch: () => setTimeout(() => controller.abort(), 50),
  });
  assert.equal(result.errorCode, "agy_cancelled");
  assert.ok(Date.now() - startedAt < 5_000);
});

test("encerra processo órfão depois de receber o resultado terminal", async () => {
  const fakeAgy = fileURLToPath(new URL("./fixtures/fake-agy.mjs", import.meta.url));
  const startedAt = Date.now();
  const result = await createServerAdapter().execute({
    runId: "run-terminal-cleanup",
    agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { command: fakeAgy, cwd: process.cwd(), timeoutSec: 20, graceSec: 1, terminalResultCleanupGraceMs: 50 },
    context: { taskTitle: "__RESULT_THEN_HANG__" },
    onLog: async () => {},
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.errorCode, null);
  assert.equal(result.summary, "resultado-terminal");
  assert.ok(Date.now() - startedAt < 5_000);
  assert.ok(result.resultJson.antigravity.terminalResultCleanup);
});

test("classifica ações negadas e permite desabilitar a persistência", async () => {
  const fakeAgy = fileURLToPath(new URL("./fixtures/fake-agy.mjs", import.meta.url));
  const base = {
    agent: { id: "agent-1", companyId: "company-1", name: "Agente", adapterType: "maxpaperclip_agy", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    onLog: async () => {},
  };
  const denied = await createServerAdapter().execute({
    ...base,
    runId: "run-denied",
    config: { command: fakeAgy, cwd: process.cwd() },
    context: { taskTitle: "__DENIED__" },
  });
  assert.equal(denied.errorCode, "agy_permission_denied");

  const stateless = await createServerAdapter().execute({
    ...base,
    runId: "run-stateless",
    config: { command: fakeAgy, cwd: process.cwd(), persistSession: false },
    context: { taskTitle: "Teste sem sessão" },
  });
  assert.equal(stateless.sessionId, null);
  assert.equal(stateless.sessionParams, null);
  assert.equal(stateless.sessionDisplayId, null);
});
