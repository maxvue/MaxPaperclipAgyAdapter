# Changelog

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

## 2.0.1 — 2026-09-30

- badges e início rápido para facilitar a descoberta e a adoção;
- guia de contribuição, suporte e código de conduta;
- formulários estruturados para bugs, propostas e dúvidas;
- template de pull request com verificações de qualidade e segurança;
- palavras-chave adicionais para descoberta no npm;
- correção da documentação sobre sessões expiradas.

## 2.0.0 — 2026-09-28

- aprovação automática de ferramentas agora explícita e desabilitada por padrão;
- cancelamento com `SIGTERM`, período de graça e encerramento forçado por `SIGKILL`;
- política única de variáveis permitidas para execução e diagnóstico;
- descoberta local de modelos executada com o mesmo ambiente restrito;
- redação de prompt e contexto antes do envio de metadados ao Paperclip;
- descarte seguro de linhas de log excessivas até a próxima quebra de linha;
- identidade de sessão baseada no workspace local estável, inclusive em alvos remotos;
- teste ativo opcional do modelo, separado da verificação de instalação e login;
- suporte ao nível de raciocínio `max` do Antigravity 1.2.12;
- retomada opcional de sessão invalidada quando as instruções mudam;
- limpeza de processos que permanecem abertos depois do resultado terminal;
- validação do modelo e da combinação modelo/esforço no teste de ambiente;
- classificação específica para ações negadas por permissão;
- documentação dos limites de skills, workspaces adicionais e validação remota;
- verificação de instalação e importação do tarball real na integração contínua.

## 1.1.5 — 2026-09-28

- documentação completa dos campos de configuração e respectivos limites;
- esclarecimento da compatibilidade com execução local, SSH e sandbox;
- documentação do contrato de credenciais, ferramentas de runtime e sessões;
- instruções corrigidas de instalação, recarga, atualização e remoção;
- inclusão de diagnóstico e solução de problemas sem expor dados internos.

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
