import type { UsageSummary } from "@paperclipai/adapter-utils";
import { finiteNumber, isRecord, stringValue } from "./value-utils.js";

export interface ParsedToolCall {
  stepIndex: number;
  name: string;
  parameters: Record<string, unknown> | null;
  output: string | null;
  durationSeconds: number | null;
  completed: boolean;
  isError: boolean;
}

export interface ParsedAgyStream {
  conversationId: string | null;
  status: string | null;
  effectiveModel: string | null;
  response: string | null;
  assistantText: string;
  usage?: UsageSummary;
  thinkingTokens: number | null;
  numTurns: number | null;
  durationSeconds: number | null;
  permissionMode: string | null;
  availableTools: string[];
  tools: ParsedToolCall[];
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  malformedLines: number;
  unknownEvents: string[];
  unknownStepTypes: string[];
  deniedActions: unknown[];
}

export interface ParsedAgyError {
  code: string | null;
  status: string | null;
  message: string | null;
  retryable: boolean | null;
  errorId: string | null;
  retryNotBefore: string | null;
  raw: Record<string, unknown>;
}

export function hasAgyTerminalResult(output: { stdout: string; stderr: string }): boolean {
  return output.stdout.split(/\r?\n/).some((rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith("{")) return false;
    try {
      const decoded: unknown = JSON.parse(line);
      return isRecord(decoded) && stringValue(decoded.event) === "result";
    } catch {
      return false;
    }
  });
}

function readUsage(value: unknown): {
  usage: UsageSummary;
  thinkingTokens: number | null;
} | null {
  if (!isRecord(value)) return null;
  const inputTokens = finiteNumber(value.input_tokens) ?? 0;
  const outputTokens = finiteNumber(value.output_tokens) ?? 0;
  const cachedInputTokens = finiteNumber(value.cache_read_tokens);
  const usage: UsageSummary = { inputTokens, outputTokens };
  if (cachedInputTokens !== null) usage.cachedInputTokens = cachedInputTokens;
  return {
    usage,
    thinkingTokens: finiteNumber(value.thinking_tokens),
  };
}

function readError(result: Record<string, unknown>): string | null {
  for (const key of ["error_message", "errorMessage", "message", "detail"] as const) {
    const value = stringValue(result[key]);
    if (value) return value;
  }
  if (typeof result.error === "string") return stringValue(result.error) || null;
  if (isRecord(result.error)) {
    return (
      stringValue(result.error.message) ||
      stringValue(result.error.detail) ||
      null
    );
  }
  return null;
}

export function parseAgyStream(stdout: string): ParsedAgyStream {
  const parsed: ParsedAgyStream = {
    conversationId: null,
    status: null,
    effectiveModel: null,
    response: null,
    assistantText: "",
    thinkingTokens: null,
    numTurns: null,
    durationSeconds: null,
    permissionMode: null,
    availableTools: [],
    tools: [],
    result: null,
    errorMessage: null,
    malformedLines: 0,
    unknownEvents: [],
    unknownStepTypes: [],
    deniedActions: [],
  };
  const tools = new Map<number, ParsedToolCall>();
  let fallbackUsage: ReturnType<typeof readUsage> = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("{")) continue;

    let event: Record<string, unknown>;
    try {
      const decoded: unknown = JSON.parse(line);
      if (!isRecord(decoded)) {
        parsed.malformedLines += 1;
        continue;
      }
      event = decoded;
    } catch {
      parsed.malformedLines += 1;
      continue;
    }

    const eventName = stringValue(event.event);
    if (eventName === "init") {
      parsed.conversationId =
        stringValue(event.conversation_id) || parsed.conversationId;
      if (isRecord(event.init)) {
        parsed.effectiveModel = stringValue(event.init.model) || parsed.effectiveModel;
        parsed.permissionMode =
          stringValue(event.init.permission_mode) || parsed.permissionMode;
        if (Array.isArray(event.init.tools)) {
          parsed.availableTools = event.init.tools.filter(
            (tool): tool is string => typeof tool === "string",
          );
        }
      }
      continue;
    }

    if (eventName === "step_update") {
      if (!isRecord(event.step_update)) continue;
      const step = event.step_update;
      parsed.conversationId =
        stringValue(step.conversation_id) || parsed.conversationId;
      fallbackUsage = readUsage(step.usage) ?? fallbackUsage;

      const stepType = stringValue(step.step_type);
      if (stepType === "agent_response") {
        if (typeof step.text_delta === "string") {
          parsed.assistantText += step.text_delta;
        }
        continue;
      }

      if (stepType === "tool") {
        const stepIndex = finiteNumber(step.step_index);
        if (stepIndex === null) continue;
        const info = isRecord(step.tool_info) ? step.tool_info : null;
        const previous = tools.get(stepIndex);
        const call: ParsedToolCall = previous ?? {
          stepIndex,
          name: "tool",
          parameters: null,
          output: null,
          durationSeconds: null,
          completed: false,
          isError: false,
        };
        call.name =
          stringValue(step.tool_name) ||
          (info ? stringValue(info.name) : "") ||
          call.name;
        if (info && isRecord(info.parameters)) call.parameters = info.parameters;
        if (info && typeof info.output === "string") call.output = info.output;
        if (info && info.error !== undefined && info.error !== null) call.isError = true;
        call.durationSeconds = finiteNumber(step.duration_seconds) ?? call.durationSeconds;
        call.completed = stringValue(step.state).toUpperCase() === "DONE";
        tools.set(stepIndex, call);
        continue;
      }
      if (stepType) parsed.unknownStepTypes.push(stepType);
      continue;
    }

    if (eventName === "result") {
      if (!isRecord(event.result)) continue;
      const result = event.result;
      parsed.result = result;
      parsed.conversationId =
        stringValue(result.conversation_id) || parsed.conversationId;
      parsed.status = stringValue(result.status) || parsed.status;
      parsed.response =
        typeof result.response === "string" ? result.response : parsed.response;
      parsed.numTurns = finiteNumber(result.num_turns) ?? parsed.numTurns;
      parsed.durationSeconds =
        finiteNumber(result.duration_seconds) ?? parsed.durationSeconds;
      const resultUsage = readUsage(result.usage);
      if (resultUsage) {
        parsed.usage = resultUsage.usage;
        parsed.thinkingTokens = resultUsage.thinkingTokens;
      }
      parsed.errorMessage = readError(result) ?? parsed.errorMessage;
      if (Array.isArray(result.denied_actions)) parsed.deniedActions = result.denied_actions;
      continue;
    }

    parsed.unknownEvents.push(eventName || "(sem discriminador)");
  }

  if (!parsed.usage && fallbackUsage) {
    parsed.usage = fallbackUsage.usage;
    parsed.thinkingTokens = fallbackUsage.thinkingTokens;
  }
  parsed.tools = [...tools.values()].sort((left, right) => left.stepIndex - right.stepIndex);
  if (!parsed.response && parsed.assistantText) parsed.response = parsed.assistantText;
  if (!parsed.errorMessage && parsed.status && parsed.status !== "SUCCESS") {
    parsed.errorMessage = `agy encerrou com o status ${parsed.status}`;
  }
  return parsed;
}

export function parseAgyError(stderr: string): ParsedAgyError | null {
  for (const line of stderr.split(/\r?\n/)) {
    const marker = line.indexOf("AGY_ERROR:");
    if (marker < 0) continue;
    try {
      const decoded: unknown = JSON.parse(line.slice(marker + "AGY_ERROR:".length).trim());
      if (!isRecord(decoded)) continue;
      return {
        code: stringValue(decoded.code) || null,
        status: stringValue(decoded.status) || null,
        message: stringValue(decoded.message) || stringValue(decoded.error) || null,
        retryable: typeof decoded.retryable === "boolean" ? decoded.retryable : null,
        errorId: stringValue(decoded.error_id) || stringValue(decoded.errorId) || null,
        retryNotBefore: stringValue(decoded.retry_not_before) || stringValue(decoded.retryNotBefore) || null,
        raw: decoded,
      };
    } catch {
      // Uma linha inválida continua disponível no stderr para diagnóstico.
    }
  }
  return null;
}

const AUTH_PATTERNS = [
  /not\s+(?:logged\s?in|authenticated|signed\s?in)/i,
  /please\s+(?:log|sign)\s?in/i,
  /authentication\s+(?:required|failed|error)/i,
  /\b(?:unauthenticated|unauthorized)\b/i,
  /\b401\b/,
];

const QUOTA_PATTERNS = [
  /quota\s+(?:exceeded|exhausted)/i,
  /rate\s?limit/i,
  /resource[_\s]exhausted/i,
  /too\s+many\s+requests/i,
  /\b429\b/,
];

const SESSION_PATTERNS = [
  /conversation[^\n]{0,80}not\s+found/i,
  /(?:unknown|invalid|missing|expired)\s+conversation/i,
  /failed\s+to\s+(?:load|resume|open)\s+conversation/i,
];

const TRANSIENT_PATTERNS = [
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/,
  /service\s+is\s+currently\s+unavailable/i,
  /temporarily\s+unavailable/i,
  /connection\s+(?:reset|refused|closed|timed\s?out)/i,
  /\b50[234]\b/,
  /\bUNAVAILABLE\b/,
  /\bDEADLINE_EXCEEDED\b/,
];

function matches(patterns: RegExp[], ...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => text && patterns.some((pattern) => pattern.test(text)));
}

export function isAuthenticationError(...texts: Array<string | null | undefined>): boolean {
  return matches(AUTH_PATTERNS, ...texts);
}

export function isQuotaError(...texts: Array<string | null | undefined>): boolean {
  return matches(QUOTA_PATTERNS, ...texts);
}

export function isInvalidSessionError(...texts: Array<string | null | undefined>): boolean {
  return matches(SESSION_PATTERNS, ...texts);
}

export function isTransientError(...texts: Array<string | null | undefined>): boolean {
  return matches(TRANSIENT_PATTERNS, ...texts);
}
