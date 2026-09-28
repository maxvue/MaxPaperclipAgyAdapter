import type {
  AdapterSessionCodec,
  AdapterSessionManagement,
} from "@paperclipai/adapter-utils";
import { isRecord, stringValue } from "./value-utils.js";

const SESSION_VERSION = 1;

function normalize(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    const conversationId = raw.trim();
    return conversationId ? { version: SESSION_VERSION, conversationId } : null;
  }
  if (!isRecord(raw)) return null;

  const conversationId =
    stringValue(raw.conversationId) || stringValue(raw.sessionId);
  if (!conversationId) return null;

  const result: Record<string, unknown> = {
    version: SESSION_VERSION,
    conversationId,
  };
  for (const key of ["cwd", "model", "workspaceId"] as const) {
    const value = stringValue(raw[key]);
    if (value) result[key] = value;
  }
  return result;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize: normalize,
  serialize: normalize,
  getDisplayId(params) {
    return params ? stringValue(params.conversationId) || null : null;
  },
};

export const sessionManagement: AdapterSessionManagement = {
  supportsSessionResume: true,
  nativeContextManagement: "unknown",
  defaultSessionCompaction: {
    enabled: true,
    maxSessionRuns: 200,
    maxRawInputTokens: 2_000_000,
    maxSessionAgeHours: 72,
  },
};

