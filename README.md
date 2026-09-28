# MaxPaperclipAgyAdapter

Adaptador externo do Antigravity CLI (`agy`) para o Paperclip. Ele usa o protocolo
estruturado `stream-json`, preserva conversas entre execuções e registra tokens,
ferramentas e diagnósticos sem depender da apresentação textual do terminal.

Pacote npm: `@maxvue/maxpaperclipagyadapter`.

## Recursos implementados

- execução local do `agy` sem shell intermediário;
- saída NDJSON por `--output-format stream-json`;
- criação e retomada de conversas;
- invalidação segura da sessão quando o workspace muda;
- nova tentativa única quando uma conversa armazenada expirou;
- tokens de entrada, saída, cache e raciocínio;
- ferramentas e resultados no histórico visual do Paperclip;
- descoberta dinâmica de modelos;
- teste de instalação, autenticação e diretório;
- sandbox do Antigravity ativado por padrão;
- timeout e período de encerramento configuráveis;
- instruções externas com limite de tamanho;
- parser visual isolado compatível com o contrato `1.0.0`.
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

- `sandbox`: padrão recomendado. O `agy` recebe aprovações automáticas, mas executa
  dentro do sandbox nativo do Antigravity.
- `workspace`: permite alterações diretas no workspace. Use apenas em ambientes
  confiáveis e com versionamento ou backup.

## Sessões

O ID da conversa do Antigravity é salvo nos parâmetros de sessão do Paperclip. A
conversa só é retomada quando o diretório salvo coincide com o workspace atual.
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
