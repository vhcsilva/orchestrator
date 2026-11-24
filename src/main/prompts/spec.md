Crie a spec do Kiro para a feature {{key}} — {{title}}.

Você está na pasta da feature `{{featureDir}}`. Os repositórios (worktrees) são:
{{repoList}}

Leia antes de escrever:

- `{{contextDir}}/historia.md` (história do Jira)
- `{{contextDir}}/01-refinamento-negocio.md` (divergências, dúvidas e DECISÕES — as decisões prevalecem sobre a história e o protótipo)
- `{{contextDir}}/02-refinamento-tecnico.md` (dependências e subtasks)
- `{{contextDir}}/design/` (protótipos .html) se existir
- o código dos worktrees, para seguir os padrões existentes

Crie a pasta `.kiro/specs/{{specName}}/` com três arquivos:

1. `requirements.md` — introdução e requisitos numerados ("### Requisito 1 — …"), cada um com user story ("Como …, quero …, para …") e critérios de aceite numerados em notação EARS (WHEN … THE SYSTEM SHALL …; IF … THEN THE SYSTEM SHALL …). Cubra todos os critérios de aceite da história e as decisões do refinamento.
2. `design.md` — visão geral, arquitetura por repositório, componentes e interfaces, modelos de dados, contratos com outros serviços (dependências do refinamento técnico), tratamento de erros e estratégia de testes.
3. `tasks.md` — plano de implementação como checklist:
   - tarefas de primeiro nível no formato `- [ ] 1. Título` e subtarefas `  - [ ] 1.1 Título`;
   - cada tarefa começa com o repositório entre colchetes, ex.: `- [ ] 2. [checkout-web] Pré-selecionar endereço favorito`;
   - abaixo de cada tarefa, bullets com o que fazer e `_Requisitos: 1.1, 1.2_`;
   - tarefas pequenas, em ordem de dependência, incluindo testes.

Não implemente código e não faça commits nesta etapa. Ao final, escreva um resumo de uma linha.
