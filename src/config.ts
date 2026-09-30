import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { DEFAULT_GRACE_SEC, DEFAULT_MODEL, DEFAULT_TERMINAL_RESULT_CLEANUP_GRACE_MS, DEFAULT_TIMEOUT_SEC } from "./constants.js";
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
        key: "agent",
        label: "Agente personalizado do agy",
        type: "text",
        hint: "Nome opcional de um agente Antigravity com ferramentas e regras restritas.",
        group: "Execução",
      },
      {
        key: "model",
        label: "Modelo",
        type: "combobox",
        default: DEFAULT_MODEL,
        options: models.map((model) => ({ label: model.label, value: model.id })),
        hint: "Aplicável somente ao modelo automático; modelos explícitos já incorporam sua configuração.",
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
          { label: "Máximo", value: "max" },
        ],
        group: "Execução",
      },
      {
        key: "persistSession",
        label: "Persistir conversa",
        type: "toggle",
        default: true,
        hint: "Retoma conversas compatíveis entre execuções do mesmo agente e workspace.",
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
          { label: "Sandbox de terminal (recomendado)", value: "sandbox" },
          { label: "Workspace sem sandbox", value: "workspace" },
        ],
        hint: "O sandbox limita comandos de terminal; navegador, MCP e outras ferramentas do agente não são isolados por esta opção.",
        group: "Segurança",
      },
      {
        key: "dangerouslySkipPermissions",
        label: "Aprovar ferramentas automaticamente",
        type: "toggle",
        default: false,
        hint: "Adiciona --dangerously-skip-permissions. Habilite somente para agentes e ambientes confiáveis.",
        group: "Segurança",
      },
      {
        key: "disableSlashCommands",
        label: "Desabilitar comandos / no prompt",
        type: "toggle",
        default: true,
        hint: "Impede expansão acidental de comandos slash recebidos em tarefas.",
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
        hint: "Aceita os campos do agente, tarefa, projeto, empresa, comentário e wake payload.",
        group: "Prompt",
      },
      {
        key: "liveEnvironmentProbe",
        label: "Teste ativo do modelo",
        type: "toggle",
        default: false,
        hint: "Envia uma solicitação curta ao modelo durante o teste do ambiente; pode consumir cota.",
        group: "Avançado",
      },
      {
        key: "terminalResultCleanupGraceMs",
        label: "Espera após resultado final (ms)",
        type: "number",
        default: DEFAULT_TERMINAL_RESULT_CLEANUP_GRACE_MS,
        hint: "Encerra o processo se ele permanecer aberto depois de emitir o resultado final.",
        group: "Avançado",
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
