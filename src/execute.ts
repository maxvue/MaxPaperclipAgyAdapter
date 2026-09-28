import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  adapterExecutionTargetSessionIdentity,
  adapterExecutionTargetSessionMatches,
  adapterExecutionTargetIsRemote,
  ensureAdapterExecutionTargetDirectory,
  readAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
  runAdapterExecutionTargetProcess,
} from "@paperclipai/adapter-utils/execution-target";
import {
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  readPaperclipIssueWorkModeFromContext,
  runningProcesses,
  signalRunningProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { buildAgyArgs, buildAgyStdin, type PermissionMode } from "./args.js";
import { ADAPTER_TYPE, DEFAULT_GRACE_SEC, DEFAULT_MODEL, DEFAULT_TIMEOUT_SEC } from "./constants.js";
import { inferProvider } from "./models.js";
import {
  isAuthenticationError,
  isQuotaError,
  isTransientError,
  parseAgyError,
  parseAgyStream,
} from "./parser.js";
import { buildPrompt } from "./prompt.js";
import { collectSensitiveValues, createStreamingRedactor, redactRecord, redactString } from "./redaction.js";
import { sessionCodec } from "./session.js";
import { boundedNumber, isRecord, stringValue } from "./value-utils.js";

const INHERITED_ENV_ALLOWLIST = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM",
  "TMPDIR", "TMP", "TEMP", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME",
  "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "GEMINI_API_KEY", "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_CONFIG", "GOOGLE_CLOUD_PROJECT",
  "GCLOUD_PROJECT", "CLI_GRAPHICS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
]);

function allowedEnvironment(injected: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of INHERITED_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  Object.assign(result, injected);
  return result;
}

function isolatedLocalEnvironment(injected: Record<string, string>): Record<string, string> {
  const result: Record<string, string | undefined> = {};
  for (const key of Object.keys(process.env)) result[key] = undefined;
  Object.assign(result, allowedEnvironment(injected));
  return result as Record<string, string>;
}

function resolveLocalCwd(ctx: AdapterExecutionContext): string {
  const workspace = isRecord(ctx.context.paperclipWorkspace) ? ctx.context.paperclipWorkspace : null;
  const workspaceCwd = workspace ? stringValue(workspace.cwd) : "";
  const workspaceSource = workspace ? stringValue(workspace.source) : "";
  const configured = stringValue(ctx.config.cwd);
  const selected = workspaceSource === "agent_home"
    ? configured || workspaceCwd || process.cwd()
    : workspaceCwd || configured || process.cwd();
  if (!path.isAbsolute(selected)) throw new Error(`O diretório de trabalho deve ser absoluto: ${selected}`);
  return path.resolve(selected);
}

function resolveAdditionalDirectories(ctx: AdapterExecutionContext, cwd: string): string[] {
  const raw = ctx.context.paperclipWorkspaces;
  if (!Array.isArray(raw)) return [];
  const result = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const candidate = stringValue(item.authoritativeRoot) || stringValue(item.cwd) || stringValue(item.path);
    if (candidate && path.isAbsolute(candidate) && path.resolve(candidate) !== path.resolve(cwd)) result.add(path.resolve(candidate));
  }
  return [...result];
}

function permissionMode(value: unknown): PermissionMode {
  return value === "workspace" ? "workspace" : "sandbox";
}

function cancelledBeforeDispatch(message = "Execução cancelada antes de iniciar o Antigravity."): AdapterExecutionResult {
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorCode: "agy_cancelled_before_dispatch",
    errorMessage: message,
    executionRecovery: { kind: "bootstrap", providerWorkStarted: false },
  };
}

function makeErrorCode(input: {
  stdout: string;
  stderr: string;
  parsedError: string | null;
  timedOut: boolean;
  providerCode: string | null;
}): { code: string; family?: "provider_quota" | "transient_upstream" } {
  if (input.timedOut) return { code: "agy_timeout" };
  if (isAuthenticationError(input.stdout, input.stderr, input.parsedError)) return { code: "agy_authentication_required" };
  if (isQuotaError(input.stdout, input.stderr, input.parsedError)) return { code: input.providerCode || "agy_quota_exhausted", family: "provider_quota" };
  if (isTransientError(input.stdout, input.stderr, input.parsedError)) return { code: input.providerCode || "agy_upstream_unavailable", family: "transient_upstream" };
  return { code: input.providerCode || "agy_execution_failed" };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const target = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });
  const localCwd = resolveLocalCwd(ctx);
  const cwd = resolveAdapterExecutionTargetCwd(target, localCwd, process.cwd());
  const command = stringValue(ctx.config.command) || "agy";
  const model = stringValue(ctx.config.model) || DEFAULT_MODEL;
  const effort = stringValue(ctx.config.effort).toLowerCase();
  if (effort && !["low", "medium", "high"].includes(effort)) throw new Error("effort deve ser low, medium, high ou vazio.");
  if (effort && model !== DEFAULT_MODEL) throw new Error("effort só pode ser usado com o modelo automático; modelos explícitos já definem sua capacidade de raciocínio.");
  const timeoutSec = boundedNumber(ctx.config.timeoutSec, DEFAULT_TIMEOUT_SEC, 1, 86_400, "timeoutSec", true);
  const graceSec = boundedNumber(ctx.config.graceSec, DEFAULT_GRACE_SEC, 1, 120, "graceSec");
  const injected: Record<string, string> = {
    ...buildPaperclipEnv(ctx.agent),
    ...buildRuntimeToolsEnv(ctx.runtimeTools),
    PAPERCLIP_RUN_ID: ctx.runId,
  };
  if (ctx.authToken) injected.PAPERCLIP_API_KEY = ctx.authToken;
  const environment = adapterExecutionTargetIsRemote(target)
    ? allowedEnvironment(injected)
    : isolatedLocalEnvironment(injected);
  const sensitiveValues = collectSensitiveValues({
    ...Object.fromEntries([...INHERITED_ENV_ALLOWLIST].flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : [])),
    ...injected,
  });
  const streamingLog = createStreamingRedactor(sensitiveValues, ctx.onLog);

  await ctx.onCancellationReady?.();
  if (ctx.signal?.aborted) return cancelledBeforeDispatch();
  await ensureAdapterExecutionTargetDirectory(ctx.runId, target, cwd, {
    cwd,
    env: environment,
    timeoutSec: 30,
    graceSec,
    createIfMissing: true,
  });
  if (ctx.signal?.aborted) {
    await ctx.stopRemoteStartup?.();
    return cancelledBeforeDispatch();
  }

  const stored = sessionCodec.deserialize(ctx.runtime.sessionParams ?? ctx.runtime.sessionId);
  const storedConversationId = stored ? stringValue(stored.conversationId) : "";
  const storedCwd = stored ? stringValue(stored.cwd) : "";
  const canResume = Boolean(storedConversationId) && (!storedCwd || storedCwd === cwd) &&
    adapterExecutionTargetSessionMatches(stored?.executionTarget, target);
  const conversationId = canResume ? storedConversationId : null;
  if (storedConversationId && !canResume) {
    await ctx.onLog("stderr", `[paperclip] A conversa ${storedConversationId} pertence a outro diretório ou ambiente; uma nova conversa será iniciada.\n`);
  }

  const prompt = await buildPrompt(ctx, Boolean(conversationId));
  const wake = isRecord(ctx.context.paperclipWake) ? ctx.context.paperclipWake : {};
  const acceptedPlanRouting = isRecord(ctx.context.acceptedPlanWakeRouting) ? ctx.context.acceptedPlanWakeRouting : {};
  const acceptedPlanContinuation = Object.keys(acceptedPlanRouting).length > 0 ||
    stringValue(ctx.context.workspaceRefreshReason) === "accepted_plan_confirmation" ||
    ((stringValue(ctx.context.interactionKind) || stringValue(wake.interactionKind)) === "request_confirmation" &&
      (stringValue(ctx.context.interactionStatus) || stringValue(wake.interactionStatus)) === "accepted");
  const planning = !ctx.context.conversationMode && !acceptedPlanContinuation &&
    readPaperclipIssueWorkModeFromContext(ctx.context) === "planning";
  const args = buildAgyArgs({
    conversationId,
    model,
    effort,
    cwd,
    permissionMode: permissionMode(ctx.config.permissionMode),
    mode: planning ? "plan" : "default",
    agent: stringValue(ctx.config.agent),
    disableSlashCommands: ctx.config.disableSlashCommands !== false,
    additionalDirectories: adapterExecutionTargetIsRemote(target) ? [] : resolveAdditionalDirectories(ctx, localCwd),
  });
  await ctx.onMeta?.({
    adapterType: ADAPTER_TYPE,
    command,
    cwd,
    commandArgs: args,
    commandNotes: [
      "O prompt é enviado por stdin no protocolo stream-json.",
      permissionMode(ctx.config.permissionMode) === "sandbox"
        ? "Aprovação automática habilitada; o sandbox do Antigravity cobre somente comandos de terminal."
        : "Aprovação automática habilitada sem sandbox de terminal.",
    ],
    env: buildInvocationEnvForLogs(injected),
    prompt,
    context: ctx.context,
  });

  let dispatched = false;
  const abortHandler = () => {
    const running = runningProcesses.get(ctx.runId);
    if (running) signalRunningProcess(running, "SIGTERM");
    void ctx.stopRemoteStartup?.();
  };
  ctx.signal?.addEventListener("abort", abortHandler, { once: true });
  let processResult;
  try {
    if (ctx.signal?.aborted) return cancelledBeforeDispatch();
    processResult = await runAdapterExecutionTargetProcess(ctx.runId, target, command, args, {
      cwd,
      env: environment,
      stdin: buildAgyStdin(prompt),
      timeoutSec,
      graceSec,
      onLog: (stream, chunk) => streamingLog.write(stream, chunk),
      onRuntimeProgress: ctx.onRuntimeProgress,
      onSpawn: async (meta) => {
        if (!dispatched) {
          dispatched = true;
          ctx.onDispatch?.();
        }
        await ctx.onSpawn?.(meta);
      },
    });
  } finally {
    ctx.signal?.removeEventListener("abort", abortHandler);
    await streamingLog.flush();
  }

  const parsed = parseAgyStream(processResult.stdout);
  const providerError = parseAgyError(processResult.stderr);
  const succeeded = !processResult.timedOut && processResult.exitCode === 0 && parsed.status === "SUCCESS";
  const effectiveModel = parsed.effectiveModel || (model === DEFAULT_MODEL ? "auto" : model);
  const sessionParams = parsed.conversationId ? {
    version: 1,
    conversationId: parsed.conversationId,
    cwd,
    model: effectiveModel,
    executionTarget: adapterExecutionTargetSessionIdentity(target),
  } : null;
  const error = succeeded ? null : makeErrorCode({
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    parsedError: providerError?.message || parsed.errorMessage,
    timedOut: processResult.timedOut,
    providerCode: providerError?.code || null,
  });
  const rawErrorMessage = succeeded ? null : providerError?.message || parsed.errorMessage ||
    (processResult.timedOut ? `agy excedeu o limite de ${timeoutSec} segundos` : processResult.stderr.trim() || `agy encerrou com código ${processResult.exitCode ?? "desconhecido"}`);
  const rawSummary = parsed.response?.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null;
  const resultJson = redactRecord({
    ...(parsed.result ?? {}),
    antigravity: {
      thinkingTokens: parsed.thinkingTokens,
      tools: parsed.tools,
      availableTools: parsed.availableTools,
      permissionMode: parsed.permissionMode,
      malformedLines: parsed.malformedLines,
      unknownEvents: parsed.unknownEvents,
      unknownStepTypes: parsed.unknownStepTypes,
      deniedActions: parsed.deniedActions,
      providerError: providerError?.raw ?? null,
    },
  }, sensitiveValues);

  return {
    exitCode: succeeded ? 0 : processResult.exitCode ?? 1,
    signal: processResult.signal,
    timedOut: processResult.timedOut,
    errorCode: error?.code ?? null,
    errorFamily: error?.family ?? null,
    errorMessage: rawErrorMessage ? redactString(rawErrorMessage, sensitiveValues) : null,
    retryNotBefore: providerError?.retryNotBefore ?? null,
    errorMeta: providerError ? redactRecord({ errorId: providerError.errorId, status: providerError.status, retryable: providerError.retryable }, sensitiveValues) : undefined,
    usage: parsed.usage,
    usageBasis: "session_cumulative",
    sessionId: parsed.conversationId,
    sessionParams,
    sessionDisplayId: parsed.conversationId,
    provider: inferProvider(effectiveModel),
    biller: "antigravity",
    model: effectiveModel,
    billingType: "subscription",
    costUsd: null,
    summary: rawSummary ? redactString(rawSummary, sensitiveValues) : null,
    resultJson,
  };
}
