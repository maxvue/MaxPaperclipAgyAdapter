import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { buildAgyArgs, redactPromptArgument, type PermissionMode } from "./args.js";
import {
  DEFAULT_GRACE_SEC,
  ADAPTER_TYPE,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SEC,
} from "./constants.js";
import { inferProvider } from "./models.js";
import {
  isAuthenticationError,
  isInvalidSessionError,
  isQuotaError,
  isTransientError,
  parseAgyStream,
} from "./parser.js";
import { buildPrompt } from "./prompt.js";
import { sessionCodec } from "./session.js";
import { isRecord, positiveNumber, stringValue } from "./value-utils.js";

function resolveWorkspaceCwd(ctx: AdapterExecutionContext): string {
  const workspace = isRecord(ctx.context.paperclipWorkspace)
    ? ctx.context.paperclipWorkspace
    : null;
  const selected =
    (workspace ? stringValue(workspace.cwd) : "") ||
    stringValue(ctx.config.cwd) ||
    process.cwd();
  if (!path.isAbsolute(selected)) {
    throw new Error(`O diretório de trabalho deve ser absoluto: ${selected}`);
  }
  return path.resolve(selected);
}

function resolvePermissionMode(value: unknown): PermissionMode {
  return value === "workspace" ? "workspace" : "sandbox";
}

function makeErrorCode(input: {
  stdout: string;
  stderr: string;
  parsedError: string | null;
  timedOut: boolean;
}): { code: string; family?: "provider_quota" | "transient_upstream" } {
  if (input.timedOut) return { code: "agy_timeout" };
  if (isAuthenticationError(input.stdout, input.stderr, input.parsedError)) {
    return { code: "agy_authentication_required" };
  }
  if (isQuotaError(input.stdout, input.stderr, input.parsedError)) {
    return { code: "agy_quota_exhausted", family: "provider_quota" };
  }
  if (isTransientError(input.stdout, input.stderr, input.parsedError)) {
    return { code: "agy_upstream_unavailable", family: "transient_upstream" };
  }
  return { code: "agy_execution_failed" };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const cwd = resolveWorkspaceCwd(ctx);
  await fs.mkdir(cwd, { recursive: true });

  const command = stringValue(ctx.config.command) || "agy";
  const model = stringValue(ctx.config.model) || DEFAULT_MODEL;
  const effort = stringValue(ctx.config.effort);
  const permissionMode = resolvePermissionMode(ctx.config.permissionMode);
  const timeoutSec = positiveNumber(ctx.config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const graceSec = positiveNumber(ctx.config.graceSec, DEFAULT_GRACE_SEC);
  const environment: Record<string, string> = {
    ...buildPaperclipEnv(ctx.agent),
    ...buildRuntimeToolsEnv(ctx.runtimeTools),
    PAPERCLIP_RUN_ID: ctx.runId,
  };
  if (ctx.authToken) environment.PAPERCLIP_API_KEY = ctx.authToken;

  const stored = sessionCodec.deserialize(
    ctx.runtime.sessionParams ?? ctx.runtime.sessionId,
  );
  const storedConversationId = stored
    ? stringValue(stored.conversationId)
    : "";
  const storedCwd = stored ? stringValue(stored.cwd) : "";
  const canResume =
    Boolean(storedConversationId) &&
    (!storedCwd || path.resolve(storedCwd) === cwd);
  const initialConversationId = canResume ? storedConversationId : null;

  if (storedConversationId && !canResume) {
    await ctx.onLog(
      "stderr",
      `[paperclip] A conversa ${storedConversationId} pertence a outro diretório; uma nova conversa será iniciada.\n`,
    );
  }

  await ctx.onCancellationReady?.();
  let dispatched = false;

  const runAttempt = async (conversationId: string | null) => {
    const prompt = await buildPrompt(ctx, Boolean(conversationId));
    const args = buildAgyArgs({
      prompt,
      conversationId,
      model,
      effort,
      cwd,
      permissionMode,
      timeoutSec,
    });

    await ctx.onMeta?.({
      adapterType: ADAPTER_TYPE,
      command,
      cwd,
      commandArgs: redactPromptArgument(args),
      commandNotes: [
        "A saída é recebida no protocolo stream-json.",
        permissionMode === "sandbox"
          ? "As aprovações automáticas estão contidas pelo sandbox do Antigravity."
          : "O operador autorizou alterações diretas no workspace.",
      ],
      env: buildInvocationEnvForLogs(environment),
      prompt,
      context: ctx.context,
    });

    if (!dispatched) {
      ctx.onDispatch?.();
      dispatched = true;
    }
    const processResult = await runChildProcess(ctx.runId, command, args, {
      cwd,
      env: environment,
      timeoutSec,
      graceSec,
      onLog: ctx.onLog,
      onSpawn: ctx.onSpawn,
    });
    return {
      processResult,
      parsed: parseAgyStream(processResult.stdout),
    };
  };

  let attempt = await runAttempt(initialConversationId);
  let retriedWithoutSession = false;
  if (
    initialConversationId &&
    isInvalidSessionError(
      attempt.processResult.stdout,
      attempt.processResult.stderr,
      attempt.parsed.errorMessage,
    )
  ) {
    retriedWithoutSession = true;
    await ctx.onLog(
      "stderr",
      "[paperclip] A conversa armazenada não existe mais; repetindo uma vez com uma nova conversa.\n",
    );
    attempt = await runAttempt(null);
  }

  const { processResult, parsed } = attempt;
  const succeeded =
    !processResult.timedOut &&
    processResult.exitCode === 0 &&
    parsed.status === "SUCCESS";
  const effectiveModel = model === DEFAULT_MODEL ? "auto" : model;
  const sessionParams = parsed.conversationId
    ? {
        version: 1,
        conversationId: parsed.conversationId,
        cwd,
        model: effectiveModel,
      }
    : null;

  const error = succeeded
    ? null
    : makeErrorCode({
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        parsedError: parsed.errorMessage,
        timedOut: processResult.timedOut,
      });
  const errorMessage = succeeded
    ? null
    : parsed.errorMessage ||
      (processResult.timedOut
        ? `agy excedeu o limite de ${timeoutSec} segundos`
        : processResult.stderr.trim() ||
          `agy encerrou com código ${processResult.exitCode ?? "desconhecido"}`);

  return {
    exitCode: succeeded ? 0 : processResult.exitCode ?? 1,
    signal: processResult.signal,
    timedOut: processResult.timedOut,
    errorCode: error?.code ?? null,
    errorFamily: error?.family ?? null,
    errorMessage,
    usage: parsed.usage,
    usageBasis: "per_run",
    sessionId: parsed.conversationId,
    sessionParams,
    sessionDisplayId: parsed.conversationId,
    clearSession: retriedWithoutSession && !parsed.conversationId,
    provider: inferProvider(effectiveModel),
    biller: "antigravity",
    model: effectiveModel,
    billingType: "subscription",
    costUsd: null,
    summary: parsed.response?.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null,
    resultJson: {
      ...(parsed.result ?? {}),
      antigravity: {
        thinkingTokens: parsed.thinkingTokens,
        tools: parsed.tools,
        availableTools: parsed.availableTools,
        permissionMode: parsed.permissionMode,
        malformedLines: parsed.malformedLines,
        unknownEvents: parsed.unknownEvents,
        retriedWithoutSession,
      },
    },
  };
}
