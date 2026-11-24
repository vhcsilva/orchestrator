A história {{key}} mudou no Jira depois que a spec foi criada. Atualize a spec em `.kiro/specs/{{specName}}/` (requirements.md, design.md e tasks.md) para refletir a mudança.

Diferença entre a versão anterior e a atual da história (linhas com "-" saíram, "+" entraram):

```diff
{{diff}}
```

Versão atual completa: `{{contextDir}}/historia-atual.md`.
Decisões do refinamento: `{{contextDir}}/01-refinamento-negocio.md` (continuam valendo, a menos que a mudança da história as contradiga — nesse caso, siga a história e registre a contradição no design.md, seção "Pendências").

Regras:
- Altere apenas o que a mudança afeta; preserve numeração e texto do resto.
- Em tasks.md, tarefas já concluídas (`[x]`) que precisam ser refeitas devem voltar para `[ ]` com uma nota "(revisar: história alterada)". Crie novas tarefas se necessário.
- Não altere código nesta etapa.

Ao final, liste em uma linha os requisitos e tarefas afetados.
