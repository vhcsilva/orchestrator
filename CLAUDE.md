# Orquestrador — guia para agentes

App Electron + React + TypeScript (electron-vite). Interface e textos em português do Brasil.

- `src/main/orchestrator.ts` concentra as regras das etapas (negócio → técnico → spec → dev). Serviços em `src/main/core/`.
- Todo comando externo passa por `Executor` (bash local ou `wsl.exe … bash -l` via stdin). Nunca monte linha de comando do Windows com aspas; use `argvToShell`/`q`.
- Execuções longas (Claude Code / kiro-cli) passam por `JobManager.start`, que grava o prompt em `~/.orquestrador/runs/<id>.prompt.md` (lado Linux) e o envia pelo stdin.
- Os agentes gravam JSON em `contexto/`; normalize sempre com `core/normalize.ts` antes de usar.
- Tipos compartilhados e a API IPC ficam em `src/shared/types.ts`; ao criar um método novo, atualize `OrchestratorApi`, `src/preload/index.ts` e os handlers em `src/main/index.ts`.

Antes de concluir uma mudança: `npm run typecheck && npm test`. Para mudanças de interface no Linux: `xvfb-run -a npm run e2e` e confira as capturas em `out/e2e-shots`.
