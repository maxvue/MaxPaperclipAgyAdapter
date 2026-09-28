# MaxPaperclipAgyAdapter

Adaptador externo do Antigravity CLI (`agy`) para o Paperclip. Ele usa o protocolo
estruturado `stream-json`, preserva conversas entre execuções e registra tokens,
ferramentas e diagnósticos sem depender da apresentação textual do terminal.

Pacote npm: `@maxvue/maxpaperclipagyadapter`.

## Recursos implementados

- execução local, SSH e em sandbox remoto pela abstração oficial do Paperclip;
- entrada e saída NDJSON por `stream-json`, com o prompt enviado por `stdin`;
- criação e retomada de conversas;
- invalidação segura da sessão quando o workspace muda;
- recuperação nativa de conversas expiradas sem repetir a tarefa;
- tokens de entrada, saída, cache e raciocínio;
- ferramentas e resultados no histórico visual do Paperclip;
- descoberta dinâmica de modelos pelo formato JSON estruturado;
- teste de versão, instalação, autenticação e diretório no ambiente de execução;
- aprovação automática com sandbox de terminal ativado por padrão;
- timeout e período de encerramento configuráveis;
- instruções externas com limite de tamanho;
- parser visual isolado compatível com o contrato `1.0.0`;
- cancelamento cooperativo antes e durante o processo;
- isolamento do ambiente herdado e desativação de comandos slash por padrão;
- modo de planejamento do Paperclip encaminhado ao `agy`.
- redação recursiva de tokens, chaves, cookies e cabeçalhos Bearer em logs e
  resultados estruturados.

## Requisitos

- Node.js 24.11 ou superior;
- Paperclip compatível com adaptadores externos;
- Antigravity CLI instalado e autenticado;
- comando `agy` disponível no `PATH` do processo do Paperclip.

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

## Configuração mínima

```json
{
  "command": "agy",
  "model": "auto",
  "permissionMode": "sandbox",
  "cwd": "/caminho/absoluto/do/projeto"
}
```

### Modos de permissão

- `sandbox`: padrão recomendado. O `agy` recebe aprovações automáticas e seus
  comandos de terminal usam o sandbox. Navegador, MCP e outras ferramentas do
  agente não são isolados por essa opção.
- `workspace`: permite alterações diretas no workspace. Use apenas em ambientes
  confiáveis e com versionamento ou backup.

## Sessões

O ID da conversa do Antigravity é salvo nos parâmetros de sessão do Paperclip. A
conversa só é retomada quando o diretório e o ambiente de execução salvos
coincidem com o workspace atual.
Credenciais, prompts e tokens de autenticação não são persistidos na sessão.

## Métricas

O adaptador informa tokens de entrada, saída e cache nos campos nativos do
Paperclip. O `agy` apresenta totais cumulativos quando uma conversa é retomada;
o adaptador declara essa base para que o Paperclip registre apenas o delta de cada
execução. Tokens de raciocínio são preservados em
`resultJson.antigravity.thinkingTokens`. O Antigravity não informa necessariamente
um custo monetário por execução, portanto o adaptador não fabrica esse valor.

## Licença

MIT.
