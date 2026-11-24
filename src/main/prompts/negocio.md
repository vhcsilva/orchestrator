# Refinamento de negócio — {{key}}

Você é o responsável pelo refinamento de negócio da história {{key}} ("{{title}}"). Seu trabalho é encontrar divergências entre a história e o design e as dúvidas que possam travar o desenvolvimento. Não escreva código e não altere nada no Jira ou no Figma.

Pasta da feature: `{{featureDir}}` (você está nela). Grave tudo em `{{contextDir}}/`.

## 1. Leia as fontes

1. Use o MCP do Atlassian para ler a história {{key}}{{jiraSiteHint}}: descrição, critérios de aceite, comentários e anexos.
2. Leia as issues vinculadas. Histórias vinculadas conhecidas:
{{linkedList}}
3. Identifique a história de design ({{designHint}}). Dela, obtenha:
   - os anexos `{{prototypePattern}}` (protótipos). Baixe cada um para `{{contextDir}}/design/` e leia o HTML: textos, estados, regras visíveis, validações, limites e fluxos;
   - os links do Figma. Use o MCP do Figma para ler os frames relevantes (contexto de design, metadados e, se ajudar, captura de tela).
4. Se não conseguir ler alguma fonte, siga com as demais e registre isso em `sources` com `"label"` explicando o problema.

## 2. Grave o snapshot da história

Grave `{{contextDir}}/historia.md` com a história principal.

{{historiaFormato}}

## 3. Analise

Compare história × protótipo × Figma × vinculadas e registre:

- **Divergências** (`kind: "divergencia"`): pontos onde as fontes dizem coisas diferentes (regras, limites, textos, campos, estados, fluxos, mensagens de erro). Para cada uma diga o que a história diz (`story`), o que o design mostra (`design`) e de onde veio (`designSource`, ex.: "prototipo.html" ou "Figma · Checkout / Parcelas").
- **Dúvidas** (`kind: "duvida"`): informações que faltam para desenvolver (regras não definidas, origem de dados, comportamento em erro, permissões, casos de borda).

Classifique `severity` (alta, media, baixa) e marque `blocksDev: true` só quando sem a resposta não dá para começar ou terminar o desenvolvimento. Seja específico e acionável; não liste obviedades. Use ids `D1, D2…` para divergências e `Q1, Q2…` para dúvidas. Use `relatedTo` para ligar pontos relacionados.

{{reanalysis}}

## 4. Grave os resultados

1. `{{contextDir}}/01-refinamento-negocio.json` — exatamente neste formato (JSON válido, sem comentários):

```json
{
  "summary": "resumo de 2 a 4 frases do que a feature entrega e dos principais riscos",
  "sources": [{ "kind": "jira|html|figma", "ref": "CHK-1 ou nome do arquivo ou frame", "label": "o que é / problema ao ler" }],
  "points": [
    {
      "id": "D1",
      "kind": "divergencia",
      "severity": "alta",
      "blocksDev": true,
      "title": "frase curta",
      "story": "o que a história diz",
      "design": "o que o design mostra",
      "designSource": "prototipo.html",
      "context": "por que importa / o que observar",
      "relatedTo": ["Q1"]
    }
  ]
}
```

2. `{{contextDir}}/01-refinamento-negocio.md` — relatório para leitura humana em português: resumo, fontes lidas, divergências, dúvidas (separando as que travam o dev) e, se houver, uma seção "Decisões" com o que já foi combinado.

Ao terminar, responda com uma linha: quantas divergências e dúvidas encontrou e quantas travam o dev.
