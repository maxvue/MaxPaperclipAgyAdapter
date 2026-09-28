# Segurança

## Modelo de execução

O adaptador inicia o executável configurado diretamente, sem `shell`, e passa os
argumentos como uma lista. O prompt não é incluído na lista de argumentos exibida
nos metadados de execução.

O modo padrão é `sandbox`. O modo `workspace` remove a contenção nativa do
Antigravity e deve ser habilitado conscientemente pelo operador.

## Dados sensíveis

- credenciais não são armazenadas nos parâmetros de sessão;
- o token temporário do Paperclip é entregue apenas ao processo da execução;
- o adaptador não aceita variáveis de ambiente arbitrárias;
- prompts não são reproduzidos na linha de comando registrada;
- arquivos de instruções possuem limite de 512 KiB.
- valores de ambiente sensíveis, JWTs e cabeçalhos Bearer são redigidos antes
  que logs ou resultados estruturados sejam entregues ao Paperclip.

## Limites conhecidos

- o processo `agy` ainda recebe o prompt em `--print`, como exigido pelo CLI; em
  alguns sistemas, argumentos podem ser visíveis a outros processos do mesmo usuário;
- a segurança final depende das garantias do sandbox implementado pelo Antigravity;
- um caminho personalizado em `command` equivale a autorizar a execução desse binário.

## Relato de vulnerabilidades

Não publique credenciais ou dados de clientes numa issue pública. Use o recurso
**Security advisories** do repositório para enviar um relato privado.
