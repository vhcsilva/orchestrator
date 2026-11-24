Crie subtasks no Jira para a história {{key}}{{jiraSiteHint}} usando o MCP do Atlassian.

- Tipo de issue: "{{subtaskType}}" (subtask da história {{key}}, no mesmo projeto).
- Preencha SOMENTE o título (summary) e a descrição. Não preencha responsável, estimativa, sprint, labels ou outros campos.
- Crie exatamente as subtasks abaixo, nesta ordem, com o texto como está:

{{subtasks}}

Se alguma criação falhar, continue com as demais.

Responda APENAS com JSON válido, sem texto antes ou depois:
{"created":[{"id":"S1","key":"CHK-123"}],"failed":[{"id":"S2","error":"motivo"}]}
