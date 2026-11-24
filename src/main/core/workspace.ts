import { posix } from 'node:path'
import type { Feature } from '@shared/types'

export const CONTEXT_DIR = 'contexto'

export function contextPath(f: Pick<Feature, 'dir'>, file: string): string {
  return posix.join(f.dir, CONTEXT_DIR, file)
}

export function workspaceFile(f: Pick<Feature, 'dir' | 'key'>): string {
  return posix.join(f.dir, `${f.key}.code-workspace`)
}

export function specDir(f: Pick<Feature, 'dir' | 'spec'>): string {
  return posix.join(f.dir, '.kiro', 'specs', f.spec.name)
}

/**
 * Workspace do Kiro (formato VS Code). Abre a pasta da feature inteira: os worktrees ficam
 * como subpastas (o Git de cada um é detectado), junto com contexto/ e .kiro/.
 * Como cada feature tem seu próprio arquivo de workspace, o Kiro guarda separadamente
 * os arquivos e terminais abertos de cada uma.
 */
export function buildWorkspace(f: Pick<Feature, 'key' | 'title' | 'repos'>): string {
  const ws = {
    folders: [{ path: '.', name: `${f.key} · ${f.title}` }],
    settings: {
      'window.title': `${f.key} — \${activeEditorShort}\${separator}\${rootName}`,
      'git.autoRepositoryDetection': 'subFolders',
      'git.repositoryScanMaxDepth': 1,
      'git.openRepositoryInParentFolders': 'never',
      'files.exclude': { '**/.git': true },
      'search.exclude': f.repos.reduce<Record<string, boolean>>((acc, r) => {
        acc[`${r.name}/node_modules`] = true
        return acc
      }, {})
    }
  }
  return JSON.stringify(ws, null, 2) + '\n'
}

/** Steering lido pelo Kiro (IDE e CLI) em toda interação dentro da pasta da feature. */
export function buildSteering(f: Feature, commitFor: (repo: Feature['repos'][number]) => string): string {
  const repos = f.repos
    .map((r) => `- \`${r.name}/\` — branch \`${r.branch}\` (base \`${r.base}\`), commits: \`${commitFor(r)}\``)
    .join('\n')
  return `---
inclusion: always
---

# Contexto da feature ${f.key} — ${f.title}

Esta pasta reúne tudo da feature. Cada subpasta abaixo é um worktree git independente:

${repos}

## Onde está o contexto

- \`${CONTEXT_DIR}/historia.md\` — snapshot da história e das vinculadas no Jira
- \`${CONTEXT_DIR}/01-refinamento-negocio.md\` — divergências, dúvidas e o que foi combinado com PM/design
- \`${CONTEXT_DIR}/02-refinamento-tecnico.md\` — dependências com outros serviços/squads e subtasks
- \`${CONTEXT_DIR}/onde-parei.md\` — resumo do estado atual
- \`.kiro/specs/${f.spec.name}/\` — spec da feature (requirements, design, tasks)

## Regras

- Use Conventional Commits no formato de cada repositório acima, sempre com a chave ${f.key}.
- Faça commit apenas no repositório que você alterou, dentro do worktree correspondente.
- Respostas registradas no refinamento de negócio prevalecem sobre a história original e o protótipo.
`
}
