Implemente a tarefa {{taskId}} da spec `.kiro/specs/{{specName}}/` da feature {{key}}:

> {{taskTitle}}

Você está na pasta da feature `{{featureDir}}`. Os repositórios (worktrees) são:
{{repoList}}

Instruções:

1. Leia requirements.md, design.md e tasks.md da spec, e as decisões em `{{contextDir}}/01-refinamento-negocio.md`.
2. Implemente a tarefa {{taskId}} e todas as suas subtarefas, seguindo os padrões do código existente.
3. Rode os testes e o lint relevantes do repositório alterado e corrija o que falhar.
4. Marque a tarefa {{taskId}} e suas subtarefas como concluídas (`[x]`) em tasks.md.
5. Faça commit em cada repositório que você alterou, dentro do worktree dele, com a mensagem no formato do repositório:
{{commitFormats}}
Use uma descrição curta no imperativo. Não faça push. 6. Não comece a próxima tarefa.

Ao final, responda com uma linha: o que foi feito e os commits criados.
