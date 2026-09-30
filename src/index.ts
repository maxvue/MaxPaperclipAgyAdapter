import type {
  AdapterRuntimeCommandSpec,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { stringValue } from "./value-utils.js";
import { getConfigSchema } from "./config.js";
import { ADAPTER_LABEL, ADAPTER_TYPE } from "./constants.js";
import { execute } from "./execute.js";
import { listModels, models } from "./models.js";
import { sessionCodec, sessionManagement } from "./session.js";
import { testEnvironment } from "./test-environment.js";

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

export const agentConfigurationDoc = `# Adaptador Antigravity local

Use quando:
- o Antigravity CLI (agy) estiver instalado e autenticado na máquina do Paperclip;
- a tarefa precisar de conversa persistente, ferramentas e métricas estruturadas;
- o agente precisar trabalhar num workspace local.

Não use quando:
- o agy não estiver instalado no ambiente de execução;
- a tarefa exigir uma API remota sem acesso ao sistema de arquivos local;
- uma execução simples de processo for suficiente.

Campos principais:
- command: comando ou caminho absoluto do agy;
- cwd: diretório absoluto alternativo para a execução;
- model: modelo do Antigravity, ou auto;
- effort: low, medium, high ou max;
- permissionMode: sandbox apenas de terminal, ou workspace;
- dangerouslySkipPermissions: aprovação automática explícita de ferramentas;
- persistSession: retomada de conversas compatíveis;
- timeoutSec e graceSec: limites de execução e encerramento.
`;

function getRuntimeCommandSpec(config: Record<string, unknown>): AdapterRuntimeCommandSpec {
  const command = stringValue(config.command) || "agy";
  return { command, detectCommand: command, installCommand: null };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: ADAPTER_TYPE,
    execute,
    testEnvironment,
    sessionCodec,
    sessionManagement,
    models,
    listModels,
    refreshModels: listModels,
    getConfigSchema,
    getRuntimeCommandSpec,
    agentConfigurationDoc,
    supportsLocalAgentJwt: true,
    runtimeToolDelivery: "environment",
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
    requiresMaterializedRuntimeSkills: false,
  };
}

export default createServerAdapter;

export { ADAPTER_LABEL, ADAPTER_TYPE } from "./constants.js";
export { buildAgyArgs, buildAgyStdin, redactPromptArgument, resolvePrintTimeoutSec } from "./args.js";
export { inferProvider } from "./models.js";
export { allowedEnvironment, inheritedEnvironmentForRedaction, isolatedLocalEnvironment } from "./environment.js";
export { buildPrompt, loadInstructions } from "./prompt.js";
export { hasAgyTerminalResult, isTransientError, parseAgyError, parseAgyStream } from "./parser.js";
export { collectSensitiveValues, collectSensitiveValuesFromValue, createStreamingRedactor, isSensitiveKey, redactRecord, redactString, redactValue } from "./redaction.js";
export { sessionCodec, sessionManagement } from "./session.js";
