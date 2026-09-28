import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import {
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE,
  joinPromptSections,
  renderPaperclipWakePrompt,
  renderTemplate,
  selectPaperclipTaskMarkdown,
} from "@paperclipai/adapter-utils/server-utils";
import { MAX_INSTRUCTIONS_BYTES } from "./constants.js";
import { stringValue } from "./value-utils.js";

async function readInstructions(config: Record<string, unknown>): Promise<string> {
  const filename = stringValue(config.instructionsFilePath);
  if (!filename) return "";
  if (!path.isAbsolute(filename)) {
    throw new Error(`O caminho do arquivo de instruções deve ser absoluto: ${filename}`);
  }
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new Error(`O arquivo de instruções não é um arquivo regular: ${filename}`);
  if (stat.size > MAX_INSTRUCTIONS_BYTES) {
    throw new Error(`O arquivo de instruções excede ${MAX_INSTRUCTIONS_BYTES} bytes: ${filename}`);
  }
  return fs.readFile(filename, "utf8");
}

export async function buildPrompt(
  ctx: AdapterExecutionContext,
  resumedSession = false,
): Promise<string> {
  const conversationMode = ctx.context.conversationMode === true;
  const template =
    stringValue(ctx.config.promptTemplate) ||
    (conversationMode
      ? DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE
      : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const values = {
    agentId: ctx.agent.id,
    agentName: ctx.agent.name,
    companyId: ctx.agent.companyId,
    runId: ctx.runId,
    taskId: stringValue(ctx.context.taskId),
    taskTitle: stringValue(ctx.context.taskTitle),
    taskDescription:
      stringValue(ctx.context.taskDescription) || stringValue(ctx.context.description),
    wakeReason: stringValue(ctx.context.wakeReason),
    company: { id: ctx.agent.companyId },
    agent: ctx.agent,
    run: { id: ctx.runId, source: "on_demand" },
    context: ctx.context,
  };
  const instructions = (await readInstructions(ctx.config)).trim();
  const taskContext = conversationMode
    ? selectPaperclipTaskMarkdown(ctx.context, {
        resumedSession,
      })
    : "";
  const wakePrompt = renderPaperclipWakePrompt(ctx.context.paperclipWake, {
    conversationMode,
    resumedSession,
    suppressIssueDescription: Boolean(taskContext),
  });
  const shouldSendFullTemplate = !resumedSession || !wakePrompt;
  const renderedTemplate = shouldSendFullTemplate
    ? renderTemplate(template, values)
    : "";
  const handoff = stringValue(ctx.context.paperclipSessionHandoffMarkdown);
  const fallbackTask = !wakePrompt && !taskContext && stringValue(ctx.context.taskTitle)
    ? [
        `Tarefa: ${stringValue(ctx.context.taskTitle)}`,
        stringValue(ctx.context.taskDescription) || stringValue(ctx.context.description),
      ].filter(Boolean).join("\n")
    : "";
  const runtimeNote = [
    "Acesso ao Paperclip:",
    "- PAPERCLIP_API_URL aponta para a API desta instância.",
    "- Quando disponível, PAPERCLIP_API_KEY contém a credencial temporária desta execução.",
    "- Nunca exiba nem persista essa credencial.",
  ].join("\n");

  return joinPromptSections([
    instructions,
    wakePrompt,
    taskContext,
    fallbackTask,
    handoff,
    runtimeNote,
    renderedTemplate,
  ]);
}
