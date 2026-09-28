import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { DEFAULT_GRACE_SEC, DEFAULT_MODEL, DEFAULT_TIMEOUT_SEC } from "./constants.js";
import { listModels } from "./models.js";

export async function getConfigSchema(): Promise<AdapterConfigSchema> {
  const models = await listModels();
  return {
    fields: [
      {
        key: "command",
        label: "Comando agy",
        type: "text",
        default: "agy",
        hint: "Nome do executável ou caminho absoluto do Antigravity CLI.",
        group: "Execução",
      },
      {
        key: "model",
        label: "Modelo",
        type: "combobox",
        default: DEFAULT_MODEL,
        options: models.map((model) => ({ label: model.label, value: model.id })),
        group: "Execução",
      },
      {
        key: "effort",
        label: "Nível de raciocínio",
        type: "select",
        default: "",
        options: [
          { label: "Automático", value: "" },
          { label: "Baixo", value: "low" },
          { label: "Médio", value: "medium" },
          { label: "Alto", value: "high" },
        ],
        group: "Execução",
      },
      {
        key: "cwd",
        label: "Diretório de trabalho",
        type: "text",
        hint: "Diretório absoluto usado quando a tarefa não possui workspace associado.",
        group: "Execução",
      },
      {
        key: "permissionMode",
        label: "Isolamento de permissões",
        type: "select",
        default: "sandbox",
        options: [
          { label: "Sandbox do Antigravity (recomendado)", value: "sandbox" },
          { label: "Workspace sem sandbox", value: "workspace" },
        ],
        hint: "O modo workspace permite que o agy altere diretamente o diretório de trabalho.",
        group: "Segurança",
      },
      {
        key: "instructionsFilePath",
        label: "Arquivo de instruções",
        type: "text",
        hint: "Caminho absoluto de um AGENTS.md ou arquivo Markdown equivalente.",
        group: "Prompt",
      },
      {
        key: "promptTemplate",
        label: "Modelo de prompt",
        type: "textarea",
        hint: "Aceita {{agentName}}, {{taskTitle}}, {{taskDescription}} e {{wakeReason}}.",
        group: "Prompt",
      },
      {
        key: "timeoutSec",
        label: "Tempo limite (segundos)",
        type: "number",
        default: DEFAULT_TIMEOUT_SEC,
        group: "Avançado",
      },
      {
        key: "graceSec",
        label: "Espera para encerramento (segundos)",
        type: "number",
        default: DEFAULT_GRACE_SEC,
        group: "Avançado",
      },
    ],
  };
}

