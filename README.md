# Orquestrador

App desktop (Electron + React + TypeScript) para trabalhar em várias features ao mesmo tempo, da história no Jira até o código:

| Etapa | Quem faz | O que sai |
| --- | --- | --- |
| 1. Refinamento de negócio | Claude Code | divergências história × design (protótipo `.html` e Figma) e dúvidas; você registra o que foi combinado com PM/design |
| 2. Refinamento técnico | Claude Code | dependências com outros serviços/squads (código + CODEOWNERS), perguntas quando há dúvida, subtasks (título e descrição) criadas no Jira após sua aprovação |
| 3. Spec | kiro-cli | `.kiro/specs/<feature>/requirements.md`, `design.md`, `tasks.md`; revisão automática quando a história muda no Jira |
| 4. Desenvolvimento | kiro-cli | executa as tasks uma a uma, com commits no padrão Conventional Commits de cada repositório |

Cada feature tem uma pasta própria com um **git worktree por repositório** (cada um na sua branch) e um arquivo `.code-workspace`. Você abre cada feature numa janela do Kiro IDE; como o workspace é separado, o Kiro guarda os arquivos e terminais abertos de cada uma, e trocar de feature é trocar de janela.

## Como funciona

```
Windows                                   WSL (Ubuntu)
┌──────────────────────────────┐          ┌───────────────────────────────────────────┐
│ Orquestrador (Electron)      │ wsl.exe  │ claude -p --output-format stream-json …   │
│  ├ interface React           │ ───────► │ kiro-cli chat --no-interactive …          │
│  ├ estado em ~/.orquestrador │  stdin   │ git worktree …                            │
│  └ abre o Kiro IDE (host)    │          │ ~/features/CHK-123/                       │
└──────────────────────────────┘          │   ├ CHK-123.code-workspace                │
                                          │   ├ .kiro/steering/feature-context.md     │
                                          │   ├ .kiro/specs/chk-123-…/                │
                                          │   ├ checkout-web/   (worktree)            │
                                          │   ├ checkout-bff/   (worktree)            │
                                          │   └ contexto/  historia.md, relatórios…   │
                                          └───────────────────────────────────────────┘
```

- Todo comando roda dentro do WSL: o app manda um script para `wsl.exe -d <distro> --exec bash -l` pelo stdin (sem problemas de aspas do Windows). Os arquivos do WSL são lidos pelo caminho `\\wsl.localhost\<distro>\…`.
- O Claude Code roda em modo headless (`-p`) com `stream-json`: o app mostra cada ferramenta usada em tempo real, guarda o log, o custo e o id da sessão. No refinamento técnico, quando o agente pergunta algo, a sessão é retomada com `--resume` depois que você responde.
- O kiro-cli roda com `chat --no-interactive`, recebendo o prompt pelo stdin.
- Os agentes gravam JSON + Markdown em `contexto/`. O app lê o JSON para montar a tela; o Markdown fica para você e para o Kiro (o steering da feature aponta para eles).
- Mudanças na história são detectadas comparando `contexto/historia.md` (snapshot literal feito no refinamento) com a versão atual do Jira.

## Requisitos

No **Windows**:
- Node.js 22+ (para rodar/compilar o app)
- Kiro IDE instalado, com o comando `kiro` no PATH

No **WSL** (distribuição padrão ou a que você escolher):
- `git`
- Claude Code (`claude`) com login feito e os MCPs do **Atlassian** e do **Figma** configurados (`claude mcp list`)
- `kiro-cli` com login feito (`kiro-cli login`)
- os clones dos repositórios que você usa

## Instalação

```powershell
git clone https://github.com/vhcsilva/orchestrator.git
cd orchestrator
npm install
npm run dev          # roda em modo desenvolvimento
npm run dist:win     # gera o instalador e a versão portátil em dist/
```

## Primeira configuração (tela Configurações)

1. **Integrações** → deixe "usar wsl.exe" ligado e, se quiser, informe a distribuição. Clique em **Testar ambiente**: deve aparecer o `$HOME` do WSL, as versões do git, do claude (com a lista de MCPs) e do kiro-cli.
   - Se o `claude` ou o `kiro-cli` não forem encontrados, ajuste a **Inicialização do shell** (ex.: `export PATH=…`, `nvm use …`) ou informe o caminho completo do comando.
2. **Permissões do Claude Code** → a lista de ferramentas liberadas precisa ter os MCPs com o **nome que aparece em `claude mcp list`** (padrão: `mcp__atlassian` e `mcp__figma`).
3. **Repositórios** → cadastre cada clone (caminho no WSL, ex.: `~/repos/checkout-web`), a branch base e o escopo padrão de commit.
4. **Branches e commits** → padrão de branch (`{tipo}/{escopo}/{chave}-{slug}`) e de commit (`{tipo}({escopo}): {descricao} [{chave}]`).
5. **Kiro IDE** → comando para abrir a janela da feature. Padrão: `kiro --new-window "{workspaceHost}"` (o `{workspaceHost}` vira `\\wsl.localhost\Ubuntu\home\…\CHK-123.code-workspace`). Se o seu Kiro abre pastas do WSL de outra forma, troque o comando — ex.: executar dentro do WSL (`runIn: wsl`) com `kiro "{workspace}"`.

A configuração fica em `%USERPROFILE%\.orquestrador\config.json`; o estado das features em `features\*.json` e os logs das execuções em `jobs\`.

## Fluxo de uso

1. **Nova feature** → digite a chave (ex.: `CHK-490`) e clique em **Buscar no Jira**: o Claude Code traz o título e as histórias vinculadas (incluindo a de design). Escolha os repositórios e, para cada um, base, tipo, escopo e branch. Ao criar, o app cria os worktrees, o workspace e o steering, abre o Kiro e inicia o refinamento de negócio.
2. **Negócio** → cada divergência/dúvida tem status, quem respondeu, quando e o que foi combinado; há também as **Notas da conversa** e pontos manuais. **Reanalisar com as respostas** manda tudo de volta ao Claude Code, que trata as respostas como decisões.
3. **Técnico** → dependências com dono e confiança, perguntas do agente (ele pausa quando bloqueia) e subtasks em rascunho. **Criar subtasks no Jira** cria só as marcadas, com título e descrição.
4. **Spec** → o kiro-cli gera a spec; você revisa (no app ou no Kiro) e aprova. Se a história mudar, aparece o diff com **Atualizar spec com kiro-cli**.
5. **Dev** → o kiro-cli executa as tasks em ordem, marcando `tasks.md` e commitando em cada repositório. Antes de cada task, se houver alterações não commitadas (suas, feitas na IDE), a execução pausa. Você pode pausar após a task atual ou cancelar a execução.

A qualquer momento: **Verificar história** (compara com o Jira), **Onde parei** (resumo gerado pelo Claude Code), **Abrir no Kiro**, mover a etapa manualmente.

## Personalizar os prompts

Os prompts ficam em [`src/main/prompts`](src/main/prompts). Para trocar um deles sem recompilar, aponte em **Configurações › Agentes por etapa** para um arquivo `.md` no WSL usando os mesmos placeholders (`{{key}}`, `{{contextDir}}`, `{{repoList}}`, …).

## Desenvolvimento

```bash
npm run typecheck
npm test             # unitários + fluxo completo com Claude Code e kiro-cli falsos (tests/fakes)
xvfb-run -a npm run e2e   # Linux: abre o Electron e percorre a interface (capturas em out/e2e-shots)
```

Estrutura:

```
src/main/            processo principal (Electron)
  core/              executor (WSL/bash), jobs, git, store, config, parsers
  prompts/           prompts de cada etapa
  orchestrator.ts    regras das etapas
src/preload/         ponte IPC
src/renderer/        interface React
src/shared/          tipos e utilitários usados pelos dois lados
tests/               vitest + CLIs falsos
```

## Pontos a validar no seu ambiente

- **Abrir o Kiro em pastas do WSL**: o comando padrão usa o caminho `\\wsl.localhost\…`. Se o seu Kiro tiver suporte a WSL remoto, prefira o modo dele (ajuste em Configurações › Kiro IDE).
- **Anexos `.html` da história de design**: o prompt pede ao Claude Code que baixe os anexos para `contexto/design/`. Isso depende de o MCP do Atlassian da sua empresa expor anexos; se não expuser, o relatório lista a fonte como não lida e você pode salvar o arquivo manualmente nessa pasta antes de reanalisar.
- **Permissões do kiro-cli**: por padrão a spec e as tasks rodam com `--trust-all-tools`. Para restringir, desligue a opção e informe `--trust-tools`.
