# MaxPaperclipAgyAdapter

[![npm](https://img.shields.io/npm/v/%40maxvue%2Fmaxpaperclipagyadapter?logo=npm&label=npm)](https://www.npmjs.com/package/@maxvue/maxpaperclipagyadapter)
[![downloads](https://img.shields.io/npm/dm/%40maxvue%2Fmaxpaperclipagyadapter?logo=npm&label=downloads)](https://www.npmjs.com/package/@maxvue/maxpaperclipagyadapter)
[![CI](https://github.com/maxvue/MaxPaperclipAgyAdapter/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/maxvue/MaxPaperclipAgyAdapter/actions/workflows/ci.yml)
[![licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](./LICENSE)

Adaptador externo do Antigravity CLI (`agy`) para o Paperclip. Ele usa o protocolo
estruturado `stream-json`, preserva conversas entre execuções e registra tokens,
ferramentas e diagnósticos sem depender da apresentação textual do terminal.

Pacote npm: `@maxvue/maxpaperclipagyadapter`.

> [!IMPORTANT]
> Este é um projeto independente, mantido pela comunidade. Ele não é um
> componente oficial do Paperclip nem do Antigravity.

## Comece rapidamente

Instale o pacote diretamente pelo gerenciador de adaptadores do Paperclip:

```bash
paperclipai adapter install --payload-json '{"packageName":"@maxvue/maxpaperclipagyadapter"}'
```

Depois, crie ou edite um agente, selecione o tipo `maxpaperclip_agy` e use
**Testar ambiente** para validar o executável, a versão e a autenticação do
`agy` antes da primeira execução.

## Recursos implementados

- execução local, SSH e em sandbox remoto pela abstração oficial do Paperclip;
- entrada e saída NDJSON por `stream-json`, com o prompt enviado por `stdin`;
- criação e retomada de conversas;
- invalidação segura da sessão quando o workspace muda;
- tokens de entrada, saída, cache e raciocínio;
- ferramentas e resultados no histórico visual do Paperclip;
- descoberta dinâmica de modelos pelo formato JSON estruturado;
- teste de versão, instalação, autenticação e diretório no ambiente de execução;
- aprovação automática opcional e desabilitada por padrão;
- sandbox de terminal ativado por padrão;
- timeout e período de encerramento configuráveis;
- instruções externas com limite de tamanho;
- parser visual isolado compatível com o contrato `1.0.0`;
- cancelamento cooperativo antes e durante o processo;
- isolamento do ambiente herdado e desativação de comandos slash por padrão;
- modo de planejamento do Paperclip encaminhado ao `agy`;
- redação recursiva de tokens, chaves, cookies e cabeçalhos Bearer em logs e
  resultados estruturados.

## Requisitos

- Node.js 24.11 ou superior;
- Paperclip compatível com adaptadores externos;
- Antigravity CLI 1.1.15 ou superior instalado e autenticado; recomenda-se
  1.2.12 ou superior;
- comando `agy` disponível no `PATH` do processo do Paperclip.

## Compatibilidade de execução

| Alvo | Suporte | Observações |
|---|---|---|
| Host local | Sim | Usa o workspace resolvido pelo Paperclip ou o `cwd` configurado. |
| SSH | Compatível pelo contrato | Executa pela abstração oficial do Paperclip. O `agy` e suas credenciais devem existir no alvo; a matriz automatizada ainda não possui um servidor SSH real. |
| Sandbox gerenciado | Compatível pelo contrato | O runtime precisa disponibilizar o executável `agy`; a matriz automatizada ainda não possui um sandbox real. |

O adaptador declara seu comando por `getRuntimeCommandSpec()`, mas não fornece
`installCommand`. A preparação da imagem ou do host remoto é responsabilidade
do operador.

## Desenvolvimento local

```bash
npm install
npm run verify
```

Depois da compilação, instale o diretório no Paperclip como adaptador externo:

```bash
paperclipai adapter install --payload-json '{"packageName":"/caminho/para/MaxPaperclipAgyAdapter","isLocalPath":true}'
```

Para instalar o pacote publicado:

```bash
paperclipai adapter install --payload-json '{"packageName":"@maxvue/maxpaperclipagyadapter"}'
```

O tipo registrado no Paperclip é `maxpaperclip_agy`.

### Atualização e ciclo de vida

```bash
# Consultar o adaptador registrado
paperclipai adapter get maxpaperclip_agy

# Buscar novamente a versão publicada no npm e recarregar
paperclipai adapter reinstall maxpaperclip_agy

# Recarregar uma instalação por caminho local após recompilar
paperclipai adapter reload maxpaperclip_agy

# Ocultar das telas de criação sem interromper agentes existentes
paperclipai adapter update maxpaperclip_agy --payload-json '{"disabled":true}'

# Remover a instalação externa
paperclipai adapter delete maxpaperclip_agy
```

Instalações e demais mutações de adaptadores exigem um administrador da
instância. Instâncias cloud-managed podem proibir instalação dinâmica por
política da plataforma.

## Configuração mínima

```json
{
  "command": "agy",
  "model": "auto",
  "permissionMode": "sandbox",
  "cwd": "/caminho/absoluto/do/projeto"
}
```

## Campos de configuração

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `command` | string | `agy` | Nome do executável ou caminho absoluto. É iniciado diretamente, sem shell. |
| `agent` | string | — | Agente personalizado do Antigravity. |
| `model` | string | `auto` | Modelo retornado pela descoberta estruturada do `agy`. |
| `effort` | string | automático | `low`, `medium`, `high` ou `max`; só pode ser usado com `model: "auto"`. |
| `persistSession` | boolean | `true` | Retoma a conversa somente quando workspace, alvo e instruções continuam compatíveis. |
| `cwd` | string absoluto | workspace da tarefa | Fallback quando a execução não possui workspace apropriado. |
| `permissionMode` | string | `sandbox` | `sandbox` ou `workspace`; controla somente a contenção dos comandos de terminal. |
| `dangerouslySkipPermissions` | boolean | `false` | Adiciona `--dangerously-skip-permissions`. Autoriza ferramentas sem confirmação e deve ser habilitado conscientemente. |
| `disableSlashCommands` | boolean | `true` | Evita expansão acidental de comandos `/` vindos de tarefas. |
| `instructionsFilePath` | string absoluto | — | Arquivo Markdown/`AGENTS.md` de até 512 KiB, acrescentado ao prompt. |
| `promptTemplate` | string | contrato padrão do Paperclip | Template com dados do agente, tarefa, projeto, empresa, comentário e wake payload. |
| `liveEnvironmentProbe` | boolean | `false` | Faz uma solicitação curta e sem ferramentas no teste do ambiente; pode consumir cota. |
| `terminalResultCleanupGraceMs` | número | `2000` | Espera de 0 a 60.000 ms antes de encerrar um processo que já emitiu o resultado final. |
| `timeoutSec` | número | `3600` | Limite de execução entre 1 e 86.400 segundos. `0` desativa o timeout do adaptador. |
| `graceSec` | número | `15` | Espera entre 1 e 120 segundos antes do encerramento forçado. |

Os campos também são expostos por `getConfigSchema()`, permitindo que versões
compatíveis do Paperclip gerem o formulário sem código de interface específico.

### Modos de permissão

- `sandbox`: padrão recomendado. Comandos de terminal usam o sandbox. Navegador,
  MCP e outras ferramentas do agente não são isolados por essa opção.
- `workspace`: permite alterações diretas no workspace. Use apenas em ambientes
  confiáveis e com versionamento ou backup.

`dangerouslySkipPermissions` é independente desses modos. O padrão seguro é
`false`. Quando `true`, o adaptador acrescenta a opção homônima do `agy`, e as
ferramentas são aprovadas automaticamente. Essa alteração de padrão torna a
versão 2.0 incompatível com configurações antigas que dependiam de aprovação
automática implícita.

## Sessões

O ID da conversa do Antigravity é salvo nos parâmetros de sessão do Paperclip. A
conversa só é retomada quando o diretório e o ambiente de execução salvos
coincidem com o workspace atual e o arquivo de instruções não mudou.
Credenciais, prompts e tokens de autenticação não são persistidos na sessão.

Uma sessão incompatível com o workspace ou o alvo de execução atual é
descartada antes da chamada, e uma conversa nova é iniciada para impedir que o
contexto de um ambiente seja aplicado a outro. Se o provedor rejeitar uma
sessão expirada ou inválida, a execução informa a falha sem repetir
automaticamente a solicitação.

## Identidade e ferramentas do Paperclip

Cada execução recebe identidade e acesso temporários do Paperclip:

- `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID` e `PAPERCLIP_RUN_ID`;
- `PAPERCLIP_API_URL`;
- `PAPERCLIP_API_KEY`, quando o host fornece o token daquela execução;
- variáveis `PAPERCLIP_RUNTIME_TOOLS_*`, quando ferramentas de conexão são
  concedidas.

O adaptador usa entrega de ferramentas por ambiente. Esses valores são
controlados pelo host, não vêm da configuração do agente e não são persistidos
na sessão.

## Métricas

O adaptador informa tokens de entrada, saída e cache nos campos nativos do
Paperclip. O `agy` apresenta totais cumulativos quando uma conversa é retomada;
o adaptador declara essa base para que o Paperclip registre apenas o delta de cada
execução. Tokens de raciocínio são preservados em
`resultJson.antigravity.thinkingTokens`. O Antigravity não informa necessariamente
um custo monetário por execução, portanto o adaptador não fabrica esse valor.

## Teste do ambiente

O botão **Testar ambiente** do Paperclip verifica no mesmo alvo da execução:

1. disponibilidade do diretório de trabalho;
2. execução de `agy --version` e versão mínima 1.1.15;
3. autenticação e descoberta de modelos via saída JSON;
4. disponibilidade do modelo e validade da combinação modelo/esforço;
5. avisos separados para sandbox de terminal desabilitado e aprovação automática;
6. opcionalmente, uma resposta real em `stream-json` quando
   `liveEnvironmentProbe` estiver habilitado.

O teste ativo fica desabilitado por padrão porque consome cota do provedor.

## Solução de problemas

### `agy` não encontrado

Instale o Antigravity CLI no host/SSH/sandbox que executará o agente e confirme
que o binário está no `PATH`. Alternativamente, configure `command` com um
caminho absoluto existente naquele alvo.

### Autenticação ou lista de modelos falhou

Execute `agy` interativamente no mesmo usuário e ambiente, conclua o login e
repita o teste do ambiente. Em SSH ou sandbox, um login existente apenas no
host do Paperclip não autentica automaticamente o alvo remoto.

### Sessão não foi retomada

Isso é esperado quando o diretório ou o alvo mudou, quando a sessão expirou ou
quando o provedor não reconhece mais o identificador. Consulte o log da execução
para distinguir uma rotação segura de uma falha de autenticação.

### A execução expirou

Aumente `timeoutSec` apenas depois de confirmar que o processo continua fazendo
progresso. No cancelamento ou timeout, o adaptador solicita encerramento do
processo e observa `graceSec` antes de forçar a parada.

## Parser visual

O pacote publica `./ui-parser` como CommonJS autocontido e declara o contrato
`paperclip.adapterUiParser: "1.0.0"`. O parser transforma o NDJSON do `agy` em
mensagens, raciocínio, chamadas/resultados de ferramentas e resultado final.
Ele não possui imports em runtime e é executado pelo Paperclip em um Web Worker
isolado.

## Limites conhecidos

- o adaptador ainda não declara o contrato de skills do Paperclip;
- workspaces adicionais são encaminhados em execução local; em alvos remotos,
  somente o workspace principal materializado pelo Paperclip é utilizado;
- SSH e sandbox usam o contrato oficial, mas exigem validação de ponta a ponta
  na infraestrutura específica do operador;
- as opções dinâmicas de modelo do formulário são descobertas no host do
  Paperclip; em alvos remotos, o resultado de **Testar ambiente** é a fonte
  autoritativa de compatibilidade.

## Segurança operacional

Adaptadores externos são código confiável executado no processo do servidor
Paperclip. Revise o pacote e suas dependências antes de instalar. Este adaptador
restringe o ambiente herdado a uma allowlist, envia o prompt por `stdin`, redige
segredos em streaming e não executa o campo `command` através de shell. Consulte
[SECURITY.md](./SECURITY.md) para o modelo de ameaça e o canal de relato.

## Comunidade e contribuição

Contribuições são bem-vindas, inclusive correções de documentação, relatos de
compatibilidade, novos testes e melhorias no suporte a ambientes remotos.

- leia o [guia de contribuição](./CONTRIBUTING.md) antes de abrir um pull request;
- consulte [suporte](./SUPPORT.md) para escolher o canal correto;
- use as [issues](https://github.com/maxvue/MaxPaperclipAgyAdapter/issues) para
  bugs, propostas e dúvidas reproduzíveis;
- veja o [changelog](./CHANGELOG.md) para acompanhar as versões;
- siga o [código de conduta](./CODE_OF_CONDUCT.md) em toda interação.

Se o adaptador foi útil, marque o repositório com uma estrela. Isso ajuda outras
pessoas da comunidade Paperclip a encontrá-lo.

## Licença

MIT.
