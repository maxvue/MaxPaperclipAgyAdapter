const REDACTED = "***REDACTED***";
const SENSITIVE_SEGMENTS = new Set([
  "key", "token", "secret", "password", "passwd", "authorization", "cookie",
]);
const SENSITIVE_NAMES = new Set([
  "api_key", "access_token", "refresh_token", "private_key", "client_secret",
  "session_token", "auth_token",
]);
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const ENV_ASSIGNMENT_PATTERN = /(^|\n)(\s*([A-Za-z_][A-Za-z0-9_]*)=)[^\r\n]*/g;

export function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (SENSITIVE_NAMES.has(normalized)) return true;
  return normalized.split("_").some((part) => SENSITIVE_SEGMENTS.has(part));
}

export function collectSensitiveValues(environment: Record<string, string>): string[] {
  return Object.entries(environment)
    .filter(([key, value]) => isSensitiveKey(key) && typeof value === "string" && value.length >= 8)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

export function collectSensitiveValuesFromValue(value: unknown): string[] {
  const values = new Set<string>();
  const visit = (current: unknown, seen: WeakSet<object>, depth: number) => {
    if (typeof current !== "object" || current === null || depth >= 64 || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry, seen, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(current)) {
      if (isSensitiveKey(key) && typeof entry === "string" && entry.length >= 4) values.add(entry);
      visit(entry, seen, depth + 1);
    }
  };
  visit(value, new WeakSet<object>(), 0);
  return [...values].sort((left, right) => right.length - left.length);
}

export function redactString(value: string, sensitiveValues: readonly string[] = []): string {
  let redacted = value;
  for (const secret of sensitiveValues) {
    if (secret.length >= 8) redacted = redacted.split(secret).join(REDACTED);
  }
  redacted = redacted
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`);
  return redacted.replace(ENV_ASSIGNMENT_PATTERN, (match, prefix: string, assignment: string, key: string) =>
    isSensitiveKey(key) ? `${prefix}${assignment}${REDACTED}` : match,
  );
}

export function redactValue(
  value: unknown,
  sensitiveValues: readonly string[] = [],
): unknown {
  if (typeof value === "string") return redactString(value, sensitiveValues);
  return redactValueInternal(value, sensitiveValues, new WeakSet<object>(), 0);
}

function redactValueInternal(
  value: unknown,
  sensitiveValues: readonly string[],
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (typeof value === "string") return redactString(value, sensitiveValues);
  if (typeof value !== "object" || value === null) return value;
  if (depth >= 64) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => redactValueInternal(entry, sensitiveValues, seen, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key)
      ? REDACTED
      : redactValueInternal(entry, sensitiveValues, seen, depth + 1);
  }
  return redacted;
}

export function createStreamingRedactor(
  sensitiveValues: readonly string[],
  sink: (stream: "stdout" | "stderr", chunk: string) => Promise<void>,
): {
  write(stream: "stdout" | "stderr", chunk: string): Promise<void>;
  flush(): Promise<void>;
} {
  const pending = { stdout: "", stderr: "" };
  const discarding = { stdout: false, stderr: false };
  const maxPendingCharacters = 1024 * 1024;
  return {
    async write(stream, chunk) {
      if (discarding[stream]) {
        const firstBreak = chunk.search(/[\r\n]/);
        if (firstBreak < 0) return;
        discarding[stream] = false;
        chunk = chunk.slice(firstBreak + 1);
      }
      const combined = pending[stream] + chunk;
      const lastBreak = Math.max(combined.lastIndexOf("\n"), combined.lastIndexOf("\r"));
      if (lastBreak < 0) {
        if (combined.length > maxPendingCharacters) {
          pending[stream] = "";
          discarding[stream] = true;
          await sink(stream, `[paperclip] ${combined.length} caracteres sem quebra de linha foram omitidos por segurança.\n`);
        } else {
          pending[stream] = combined;
        }
        return;
      }
      pending[stream] = combined.slice(lastBreak + 1);
      await sink(stream, redactString(combined.slice(0, lastBreak + 1), sensitiveValues));
    },
    async flush() {
      for (const stream of ["stdout", "stderr"] as const) {
        if (!pending[stream]) continue;
        await sink(stream, redactString(pending[stream], sensitiveValues));
        pending[stream] = "";
        discarding[stream] = false;
      }
    },
  };
}

export function redactRecord(
  value: Record<string, unknown>,
  sensitiveValues: readonly string[] = [],
): Record<string, unknown> {
  return redactValue(value, sensitiveValues) as Record<string, unknown>;
}
