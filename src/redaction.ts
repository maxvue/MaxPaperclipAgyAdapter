const REDACTED = "***REDACTED***";
const SENSITIVE_KEY = /(key|token|secret|password|passwd|authorization|cookie)/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const ENV_SECRET_PATTERN = /(^|\n)(\s*[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTHORIZATION|COOKIE)[A-Z0-9_]*=)[^\r\n]*/gi;

export function collectSensitiveValues(environment: Record<string, string>): string[] {
  return Object.entries(environment)
    .filter(([key, value]) => SENSITIVE_KEY.test(key) && value.length >= 8)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

export function redactString(value: string, sensitiveValues: readonly string[] = []): string {
  let redacted = value;
  for (const secret of sensitiveValues) {
    if (secret.length >= 8) redacted = redacted.split(secret).join(REDACTED);
  }
  return redacted
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(ENV_SECRET_PATTERN, `$1$2${REDACTED}`);
}

export function redactValue(
  value: unknown,
  sensitiveValues: readonly string[] = [],
): unknown {
  if (typeof value === "string") return redactString(value, sensitiveValues);
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, sensitiveValues));
  }
  if (typeof value !== "object" || value === null) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY.test(key) && typeof entry === "string"
      ? REDACTED
      : redactValue(entry, sensitiveValues);
  }
  return redacted;
}

export function redactRecord(
  value: Record<string, unknown>,
  sensitiveValues: readonly string[] = [],
): Record<string, unknown> {
  return redactValue(value, sensitiveValues) as Record<string, unknown>;
}
