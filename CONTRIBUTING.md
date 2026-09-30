# Como contribuir

Obrigado por considerar uma contribuição. Correções pequenas, documentação,
testes de compatibilidade e propostas de segurança são tão valiosos quanto
novos recursos.

Ao participar, siga o [código de conduta](./CODE_OF_CONDUCT.md).

## Antes de começar

1. Pesquise as [issues existentes](https://github.com/maxvue/MaxPaperclipAgyAdapter/issues)
   para evitar trabalho duplicado.
2. Para mudanças relevantes de comportamento ou de contrato, abra primeiro uma
   proposta descrevendo o problema, os casos de uso e os riscos.
3. Vulnerabilidades não devem ser discutidas publicamente. Siga o processo em
   [SECURITY.md](./SECURITY.md).

## Ambiente de desenvolvimento

Requisitos:

- Node.js 24.11 ou superior;
- npm compatível com o `package-lock.json`;
- Antigravity CLI para testes manuais de integração.

Prepare o projeto:

```bash
git clone https://github.com/maxvue/MaxPaperclipAgyAdapter.git
cd MaxPaperclipAgyAdapter
npm ci
npm run verify
```

`npm run verify` executa a checagem de tipos, compila o pacote, roda os testes e
valida o conteúdo que seria publicado no npm.

## Fluxo recomendado

1. Crie uma branch curta a partir de `main`.
2. Faça uma mudança focada, acompanhada de testes quando houver alteração de
   comportamento.
3. Execute `npm run verify` e `npm audit --omit=dev`.
4. Atualize o README ou o changelog quando a mudança afetar usuários.
5. Abra um pull request e preencha contexto, riscos e evidências de validação.

Não inclua credenciais, tokens, prompts privados, logs de clientes ou dados de
sessão em commits, fixtures, issues ou pull requests.

## Convenções

- código, documentação e mensagens voltadas à comunidade podem ser escritos em
  português do Brasil;
- nomes de APIs, tipos e identificadores seguem as convenções existentes em
  TypeScript;
- prefira mudanças pequenas e fáceis de revisar;
- preserve compatibilidade com o contrato público do Paperclip;
- novas dependências precisam de justificativa, licença compatível e auditoria.

## Testes

Os testes usam o executor nativo do Node.js e fixtures locais. Uma correção de
bug deve incluir, sempre que possível, um teste que falhe antes da correção e
passe depois dela.

Para integrações que dependem do `agy`, descreva no pull request:

- versão do Node.js e do Antigravity CLI;
- sistema operacional e tipo de alvo: local, SSH ou sandbox;
- configuração relevante, sem segredos;
- resultado esperado e resultado observado.

## Processo de revisão

Mantenedores podem solicitar ajustes de segurança, compatibilidade,
documentação ou testes antes da integração. Aprovação de um pull request não
garante inclusão imediata em uma versão publicada.
