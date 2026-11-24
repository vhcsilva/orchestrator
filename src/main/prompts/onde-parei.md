Escreva o arquivo `{{contextDir}}/onde-parei.md` com um resumo curto (até 15 linhas) do estado atual da feature {{key}} — {{title}}, para o desenvolvedor retomar o trabalho depois de alternar entre features.

Consulte:

- `.kiro/specs/{{specName}}/tasks.md` (o que está feito e pendente), se existir
- `git log --oneline -15` e `git status --short` em cada worktree: {{repoNames}}
- `{{contextDir}}/01-refinamento-negocio.md` e `{{contextDir}}/02-refinamento-tecnico.md` (pendências em aberto)

Inclua: o que já está pronto, o que está em andamento, a próxima ação recomendada, alterações manuais não commitadas e dúvidas em aberto. Seja direto, em português.

Responda apenas "ok" ao terminar.
