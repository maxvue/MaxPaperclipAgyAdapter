import path from "node:path";

export type PermissionMode = "sandbox" | "workspace";

export interface BuildAgyArgsInput {
  prompt: string;
  conversationId: string | null;
  model: string;
  effort: string;
  cwd: string;
  permissionMode: PermissionMode;
  timeoutSec: number;
  additionalDirectories?: string[];
}

export function modelIncludesEffort(model: string): boolean {
  return /-(?:low|medium|high)$/i.test(model.trim());
}

export function resolvePrintTimeoutSec(timeoutSec: number): number {
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) return 0;
  const margin = Math.max(10, Math.floor(timeoutSec * 0.05));
  return Math.max(30, Math.floor(timeoutSec - margin));
}

export function buildAgyArgs(input: BuildAgyArgsInput): string[] {
  const args = ["--output-format", "stream-json"];

  if (input.conversationId) args.push("--conversation", input.conversationId);

  const model = input.model.trim();
  if (model && model !== "auto") args.push("--model", model);

  const effort = input.effort.trim().toLowerCase();
  if (["low", "medium", "high"].includes(effort) && !modelIncludesEffort(model)) {
    args.push("--effort", effort);
  }

  // Execuções do Paperclip são não interativas. No modo padrão, as aprovações
  // automáticas permanecem contidas pelo sandbox nativo do Antigravity.
  args.push("--dangerously-skip-permissions");
  if (input.permissionMode === "sandbox") args.push("--sandbox");

  args.push("--add-dir", path.resolve(input.cwd));
  for (const directory of input.additionalDirectories ?? []) {
    const resolved = path.resolve(directory);
    if (resolved !== path.resolve(input.cwd)) args.push("--add-dir", resolved);
  }

  const printTimeoutSec = resolvePrintTimeoutSec(input.timeoutSec);
  if (printTimeoutSec > 0) args.push("--print-timeout", `${printTimeoutSec}s`);

  args.push("--print", input.prompt);
  return args;
}

export function redactPromptArgument(args: string[]): string[] {
  const redacted = [...args];
  const printIndex = redacted.lastIndexOf("--print");
  if (printIndex >= 0 && printIndex + 1 < redacted.length) {
    const prompt = redacted[printIndex + 1] ?? "";
    redacted[printIndex + 1] = `<prompt ${prompt.length} caracteres>`;
  }
  return redacted;
}

