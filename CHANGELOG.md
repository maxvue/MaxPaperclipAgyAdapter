# Changelog

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

## 1.1.0 — 2026-09-28

- prompt transferido de argumentos para `stdin` em NDJSON;
- compatibilidade com alvos locais, SSH e sandboxes do Paperclip;
- cancelamento sem corrida antes do despacho e encerramento durante a execução;
- remoção do timeout interno do `agy`, evitando sucessos parciais;
- retomada de sessão vinculada ao diretório e ao ambiente de execução;
- isolamento de variáveis herdadas e redação segura entre chunks de log;
- correção de falsos positivos e redação de subárvores sensíveis;
- modelos consultados via JSON e modelo efetivo obtido do evento `init`;
- suporte a erros `AGY_ERROR`, etapas futuras, ações negadas e planejamento;
- validação de versão, limites e combinações de modelo/effort.

## 1.0.0 — 2026-09-28

- primeira versão pública do MaxPaperclipAgyAdapter;
- integração estruturada com o protocolo `stream-json` do Antigravity CLI;
- persistência e retomada segura de conversas;
- contabilização incremental de tokens cumulativos;
- descoberta dinâmica de modelos e diagnóstico do ambiente;
- sandbox por padrão, timeout e recuperação de sessão inválida;
- redação recursiva de credenciais em logs e resultados estruturados.
