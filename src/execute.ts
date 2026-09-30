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
import { ADAPTER_TYPE, DEFAULT_GRACE_SEC, DEFAULT_MODEL, DEFAULT_TERMINAL_RESULT_CLEANUP_GRACE_MS, DEFAULT_TIMEOUT_SEC } from "./constants.js";
import { allowedEnvironment, inheritedEnvironmentForRedaction, isolatedLocalEnvironment } from "./environment.js";
import { inferProvider } from "./models.js";
import {
  isAuthenticationError,
  isQuotaError,
  isTransientError,
  hasAgyTerminalResult,
  parseAgyError,
  parseAgyStream,
} from "./parser.js";
import { buildPrompt, loadInstructions } from "./prompt.js";
import { collectSensitiveValues, collectSensitiveValuesFromValue, createStreamingRedactor, redactRecord, redactString } from "./redaction.js";
import { sessionCodec } from "./session.js";
import { boundedNumber, isRecord, stringValue } from "./value-utils.js";

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
  cancelled: boolean;
  deniedActionCount: number;
}): { code: string; family?: "provider_quota" | "transient_upstream" } {
  if (input.cancelled) return { code: "agy_cancelled" };
  if (input.timedOut) return { code: "agy_timeout" };
  if (input.deniedActionCount > 0) return { code: "agy_permission_denied" };
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
  if (effort && !["low", "medium", "high", "max"].includes(effort)) throw new Error("effort deve ser low, medium, high, max ou vazio.");
  if (effort && model !== DEFAULT_MODEL) throw new Error("effort só pode ser usado com o modelo automático; modelos explícitos já definem sua capacidade de raciocínio.");
  const timeoutSec = boundedNumber(ctx.config.timeoutSec, DEFAULT_TIMEOUT_SEC, 1, 86_400, "timeoutSec", true);
  const graceSec = boundedNumber(ctx.config.graceSec, DEFAULT_GRACE_SEC, 1, 120, "graceSec");
  const terminalResultCleanupGraceMs = boundedNumber(
    ctx.config.terminalResultCleanupGraceMs,
    DEFAULT_TERMINAL_RESULT_CLEANUP_GRACE_MS,
    0,
    60_000,
    "terminalResultCleanupGraceMs",
    true,
  );
  const persistSession = ctx.config.persistSession !== false;
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
    ...inheritedEnvironmentForRedaction(),
    ...injected,
  });
  sensitiveValues.push(...collectSensitiveValuesFromValue(ctx.context));
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
  const instructions = await loadInstructions(ctx.config);
  const storedConversationId = stored ? stringValue(stored.conversationId) : "";
  const storedCwd = stored ? stringValue(stored.cwd) : "";
  const storedInstructionsFingerprint = stored ? stringValue(stored.instructionsFingerprint) : "";
  const instructionsMatch = instructions.fingerprint
    ? storedInstructionsFingerprint === instructions.fingerprint
    : !storedInstructionsFingerprint;
  const canResume = persistSession && Boolean(storedConversationId) && instructionsMatch &&
    (!storedCwd || storedCwd === localCwd || storedCwd === cwd) &&
    adapterExecutionTargetSessionMatches(stored?.executionTarget, target);
  const conversationId = canResume ? storedConversationId : null;
  if (storedConversationId && !canResume) {
    await ctx.onLog("stderr", `[paperclip] A conversa ${storedConversationId} não é compatível com a configuração, as instruções, o diretório ou o ambiente atuais; uma nova conversa será iniciada.\n`);
  }

  const prompt = await buildPrompt(ctx, Boolean(conversationId), instructions.content);
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
    dangerouslySkipPermissions: ctx.config.dangerouslySkipPermissions === true,
    mode: planning ? "plan" : "default",
    agent: stringValue(ctx.config.agent),
    disableSlashCommands: ctx.config.disableSlashCommands !== false,
    additionalDirectories: adapterExecutionTargetIsRemote(target) ? [] : resolveAdditionalDirectories(ctx, localCwd),
  });
  const automaticApproval = ctx.config.dangerouslySkipPermissions === true;
  await ctx.onMeta?.({
    adapterType: ADAPTER_TYPE,
    command,
    cwd,
    commandArgs: args,
    commandNotes: [
      "O prompt é enviado por stdin no protocolo stream-json.",
      automaticApproval
        ? "Aprovação automática de ferramentas habilitada explicitamente."
        : "Aprovação automática de ferramentas desabilitada.",
      permissionMode(ctx.config.permissionMode) === "sandbox"
        ? "O sandbox do Antigravity cobre somente comandos de terminal."
        : "O sandbox de terminal do Antigravity está desabilitado.",
    ],
    env: buildInvocationEnvForLogs(injected),
    prompt: redactString(prompt, sensitiveValues),
    context: redactRecord(ctx.context, sensitiveValues),
  });

  let dispatched = false;
  let forceKillTimer: NodeJS.Timeout | null = null;
  let cancellationTask: Promise<void> | null = null;
  const requestCancellation = () => {
    const running = runningProcesses.get(ctx.runId);
    if (running) {
      signalRunningProcess(running, "SIGTERM");
      if (!forceKillTimer) {
        forceKillTimer = setTimeout(() => {
          const stillRunning = runningProcesses.get(ctx.runId);
          if (stillRunning) signalRunningProcess(stillRunning, "SIGKILL");
        }, graceSec * 1_000);
        forceKillTimer.unref();
      }
    }
    if (!cancellationTask) {
      cancellationTask = Promise.resolve(ctx.stopRemoteStartup?.()).catch(async (error) => {
        try {
          await ctx.onLog("stderr", `${redactString(`[paperclip] Falha ao cancelar a inicialização remota: ${String(error)}`, sensitiveValues)}\n`);
        } catch {
          // Uma falha de observabilidade não deve impedir o encerramento local.
        }
      });
    }
  };
  const abortHandler = () => {
    requestCancellation();
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
      terminalResultCleanup: {
        graceMs: terminalResultCleanupGraceMs,
        hasTerminalResult: hasAgyTerminalResult,
      },
      onSpawn: async (meta) => {
        if (!dispatched) {
          dispatched = true;
          ctx.onDispatch?.();
        }
        await ctx.onSpawn?.(meta);
        if (ctx.signal?.aborted) requestCancellation();
      },
    });
  } finally {
    ctx.signal?.removeEventListener("abort", abortHandler);
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (cancellationTask) await cancellationTask;
    await streamingLog.flush();
  }

  const parsed = parseAgyStream(processResult.stdout);
  const providerError = parseAgyError(processResult.stderr);
  const terminalResultWasCleanedUp = Boolean(processResult.terminalResultCleanup);
  const succeeded = !processResult.timedOut &&
    (processResult.exitCode === 0 || terminalResultWasCleanedUp) &&
    parsed.status === "SUCCESS";
  const effectiveModel = parsed.effectiveModel || (model === DEFAULT_MODEL ? "auto" : model);
  const sessionParams = persistSession && parsed.conversationId ? {
    version: 1,
    conversationId: parsed.conversationId,
    cwd: localCwd,
    model: effectiveModel,
    executionTarget: adapterExecutionTargetSessionIdentity(target),
    ...(instructions.fingerprint ? { instructionsFingerprint: instructions.fingerprint } : {}),
  } : null;
  const error = succeeded ? null : makeErrorCode({
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    parsedError: providerError?.message || parsed.errorMessage,
    timedOut: processResult.timedOut,
    providerCode: providerError?.code || null,
    cancelled: ctx.signal?.aborted === true,
    deniedActionCount: parsed.deniedActions.length,
  });
  const rawErrorMessage = succeeded ? null : providerError?.message || parsed.errorMessage ||
    (processResult.timedOut ? `agy excedeu o limite de ${timeoutSec} segundos` : processResult.stderr.trim() || `agy encerrou com código ${processResult.exitCode ?? "desconhecido"}`);
  const rawSummary = parsed.response?.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 2_000) ?? null;
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
      terminalResultCleanup: processResult.terminalResultCleanup ?? null,
    },
  }, sensitiveValues);

  return {
    exitCode: succeeded ? 0 : processResult.exitCode ?? 1,
    signal: succeeded ? null : processResult.signal,
    timedOut: processResult.timedOut,
    errorCode: error?.code ?? null,
    errorFamily: error?.family ?? null,
    errorMessage: rawErrorMessage ? redactString(rawErrorMessage, sensitiveValues) : null,
    retryNotBefore: providerError?.retryNotBefore ?? null,
    errorMeta: providerError ? redactRecord({ errorId: providerError.errorId, status: providerError.status, retryable: providerError.retryable }, sensitiveValues) : undefined,
    usage: parsed.usage,
    usageBasis: "session_cumulative",
    sessionId: persistSession ? parsed.conversationId : null,
    sessionParams,
    sessionDisplayId: persistSession ? parsed.conversationId : null,
    provider: inferProvider(effectiveModel),
    biller: "antigravity",
    model: effectiveModel,
    billingType: "subscription",
    costUsd: null,
    summary: rawSummary ? redactString(rawSummary, sensitiveValues) : null,
    resultJson,
  };
}
