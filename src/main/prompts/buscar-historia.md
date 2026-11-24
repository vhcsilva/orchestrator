Você está ajudando a cadastrar uma feature no orquestrador. Use as ferramentas do MCP do Atlassian (Jira) para ler a issue {{key}}{{jiraSiteHint}}.

Leia também a lista de issues vinculadas a ela. Para cada vinculada, informe se é a história de design. Critério para identificar a história de design: {{designHint}}.
Para a história de design, liste os nomes dos anexos que combinam com `{{prototypePattern}}` e os links do Figma que aparecem na descrição ou nos comentários.

Não crie nem altere nada. Não escreva arquivos.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, neste formato:

{"key":"{{key}}","title":"<título>","status":"<status atual>","linked":[{"key":"<chave>","title":"<título>","relation":"<tipo do vínculo>","isDesign":true,"attachments":["arquivo.html"],"figma":["https://www.figma.com/..."]}]}
