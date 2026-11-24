# Refinamento técnico — {{key}}

Você é o responsável pelo refinamento técnico da história {{key}} ("{{title}}"). Não escreva código de produção e não crie nada no Jira.

Pasta da feature: `{{featureDir}}` (você está nela). Worktrees dos repositórios da feature:
{{repoList}}

Outros repositórios conhecidos (consulte código e CODEOWNERS se ajudar):
{{otherRepos}}

## Fontes

1. `{{contextDir}}/historia.md` e `{{contextDir}}/01-refinamento-negocio.md` (inclui decisões com PM/design).
2. A história {{key}} e as vinculadas no Jira (MCP do Atlassian), incluindo a história de design e os protótipos em `{{contextDir}}/design/`; Figma via MCP se necessário.
3. O código dos worktrees: como as telas/endpoints atuais funcionam, de onde vêm os dados, contratos, clientes HTTP, filas, feature flags.
4. Arquivos CODEOWNERS (`CODEOWNERS`, `.github/CODEOWNERS`, `docs/CODEOWNERS`) para descobrir os donos.

## O que identificar

- **Dependências técnicas** com outros serviços e squads. Regra importante: quando uma tela ou resposta junta dados de naturezas diferentes (ex.: pedido + entrega + vendedor), é provável que esses dados venham de serviços diferentes. Para cada dado, indique a origem provável, o dono (CODEOWNERS) e sua confiança.
- **Perguntas**: na dúvida sobre origem de dado, contrato, dono ou comportamento, NÃO suponha. Registre uma pergunta. Marque `blocking: true` quando a resposta muda as subtasks ou cria dependência externa.
- **Subtasks**: divida o desenvolvimento em subtasks pequenas e entregáveis (prefixe o título com o repositório ou camada, ex.: "[BFF] …", "[Web] …"). Só título e descrição. Se uma subtask depende de uma pergunta em aberto, preencha `blockedBy` com o id da pergunta.

## Grave os resultados

1. `{{contextDir}}/02-refinamento-tecnico.json` — exatamente neste formato:

```json
{
  "summary": "visão técnica em 2 a 4 frases",
  "dependencies": [{ "need": "dado ou necessidade", "origin": "serviço provável", "owner": "@time (CODEOWNERS) ou vazio", "confidence": "alta|media|baixa", "notes": "evidência" }],
  "questions": [{ "id": "P1", "question": "pergunta objetiva", "context": "o que você já verificou", "blocking": true }],
  "subtasks": [{ "id": "S1", "title": "[BFF] …", "description": "o que fazer e critério de pronto", "repo": "nome-do-repo", "blockedBy": "P1" }]
}
```

2. `{{contextDir}}/02-refinamento-tecnico.md` — relatório legível com as mesmas informações e as evidências (arquivos e trechos de código consultados).

{{answersSection}}

Ao terminar, responda com uma linha: número de dependências, perguntas (quantas bloqueiam) e subtasks.
