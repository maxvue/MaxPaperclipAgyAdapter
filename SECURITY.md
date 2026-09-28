# Segurança

## Modelo de execução

O adaptador inicia o executável configurado diretamente, sem `shell`, e passa os
argumentos como uma lista. O prompt não é incluído na lista de argumentos exibida
nos metadados de execução.

O modo padrão habilita aprovação automática e `--sandbox`. Essa contenção cobre
comandos de terminal, não todas as ferramentas que um agente Antigravity possa
ter (por exemplo, navegador e MCP). O modo `workspace` também remove essa
contenção de terminal e deve ser habilitado conscientemente pelo operador.

## Dados sensíveis

- credenciais não são armazenadas nos parâmetros de sessão;
- o token temporário do Paperclip é entregue apenas ao processo da execução;
- o adaptador não aceita variáveis de ambiente arbitrárias;
- o prompt é enviado por `stdin` e não aparece na linha de comando do processo;
- arquivos de instruções possuem limite de 512 KiB.
- valores de ambiente sensíveis, JWTs e cabeçalhos Bearer são redigidos antes
  que logs ou resultados estruturados sejam entregues ao Paperclip.

## Limites conhecidos

- o adaptador herda somente uma lista explícita de variáveis de sistema,
  autenticação e proxy; as demais são removidas do processo filho;
- o sandbox do Antigravity não é uma contenção geral de navegador, MCP ou rede;
- um caminho personalizado em `command` equivale a autorizar a execução desse binário.

## Relato de vulnerabilidades

Não publique credenciais ou dados de clientes numa issue pública. Use o recurso
**Security advisories** do repositório para enviar um relato privado.
