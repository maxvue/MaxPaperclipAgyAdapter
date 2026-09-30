import path from "node:path";

export type PermissionMode = "sandbox" | "workspace";
export type AgyMode = "default" | "plan";

export interface BuildAgyArgsInput {
  /** @deprecated O prompt agora é enviado exclusivamente por stdin. */
  prompt?: string;
  conversationId: string | null;
  model: string;
  effort: string;
  cwd: string;
  permissionMode: PermissionMode;
  dangerouslySkipPermissions?: boolean;
  mode?: AgyMode;
  agent?: string;
  disableSlashCommands?: boolean;
  /** @deprecated O timeout interno do agy foi removido; o Paperclip é autoritativo. */
  timeoutSec?: number;
  additionalDirectories?: string[];
}

export function modelIncludesEffort(model: string): boolean {
  return /-(?:low|medium|high|max)$/i.test(model.trim());
}

/** @deprecated O timeout interno do agy não deve ser utilizado. */
export function resolvePrintTimeoutSec(_timeoutSec: number): number {
  return 0;
}

export function buildAgyArgs(input: BuildAgyArgsInput): string[] {
  const args = ["--input-format", "stream-json", "--output-format", "stream-json"];

  if (input.conversationId) args.push("--conversation", input.conversationId);

  const model = input.model.trim();
  if (model && model !== "auto") args.push("--model", model);

  const effort = input.effort.trim().toLowerCase();
  if (model === "auto" && ["low", "medium", "high", "max"].includes(effort)) {
    args.push("--effort", effort);
  }

  if (input.mode === "plan") args.push("--mode", "plan");
  const agent = input.agent?.trim();
  if (agent) args.push("--agent", agent);
  if (input.disableSlashCommands !== false) args.push("--disable-slash-commands");

  if (input.dangerouslySkipPermissions === true) args.push("--dangerously-skip-permissions");
  if (input.permissionMode === "sandbox") args.push("--sandbox");

  args.push("--add-dir", path.resolve(input.cwd));
  for (const directory of input.additionalDirectories ?? []) {
    const resolved = path.resolve(directory);
    if (resolved !== path.resolve(input.cwd)) args.push("--add-dir", resolved);
  }

  return args;
}

export function buildAgyStdin(prompt: string): string {
  return `${JSON.stringify({ event: "user", message: { content: prompt } })}\n`;
}

export function redactPromptArgument(args: string[]): string[] {
  return [...args];
}
