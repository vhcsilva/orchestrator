import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig } from '@shared/types'

export const DEFAULT_SHELL_INIT = [
  '# Carregado antes de cada comando no WSL/Linux',
  'export PATH="$HOME/.local/bin:$HOME/bin:$PATH"',
  '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1',
  'true'
].join('\n')

export function defaultConfig(platform: NodeJS.Platform = process.platform): AppConfig {
  return {
    wsl: { enabled: platform === 'win32', distro: '', shellInit: DEFAULT_SHELL_INIT },
    claude: {
      command: 'claude',
      model: '',
      quickModel: '',
      allowedTools: [
        'Read',
        'Glob',
        'Grep',
        'Write',
        'Edit',
        'WebFetch',
        'Bash(git log:*)',
        'Bash(git diff:*)',
        'Bash(git status:*)',
        'Bash(git show:*)',
        'Bash(ls:*)',
        'Bash(cat:*)',
        'Bash(mkdir:*)',
        'Bash(curl:*)',
        'mcp__atlassian',
        'mcp__figma'
      ],
      permissionMode: 'acceptEdits',
      extraArgs: '',
      maxBudgetUsd: 0
    },
    kiro: { command: 'kiro-cli', trustAllTools: true, trustTools: '', extraArgs: '' },
    jira: {
      siteUrl: '',
      projects: '',
      designHint: 'história vinculada cujo título começa com "Design" ou com label design',
      prototypePattern: '*.html',
      subtaskType: 'Sub-task'
    },
    repos: [],
    featuresRoot: '~/features',
    branches: {
      branchPattern: '{tipo}/{escopo}/{chave}-{slug}',
      commitPattern: '{tipo}({escopo}): {descricao} [{chave}]',
      types: 'feat, fix, refactor, chore, test, docs, perf, build, ci',
      slugMaxLength: 40
    },
    ide: {
      openCommand: 'kiro --new-window "{workspaceHost}"',
      runIn: 'host',
      generateSteering: true
    },
    prompts: {},
    execution: {
      notifications: true,
      pauseOnUserChanges: true,
      storyCheckMinutes: 0,
      autoOndeParei: true
    }
  }
}

/** Mescla recursivamente a configuração salva sobre os padrões (campos novos ganham padrão). */
export function mergeConfig<T>(base: T, saved: unknown): T {
  if (saved === undefined || saved === null) return base
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T
  if (typeof base === 'object' && base !== null) {
    if (typeof saved !== 'object' || Array.isArray(saved)) return base
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
      out[k] = k in out ? mergeConfig(out[k], v) : v
    }
    return out as T
  }
  return (typeof saved === typeof base ? saved : base) as T
}

export class ConfigStore {
  readonly file: string
  private current: AppConfig

  constructor(readonly dir: string) {
    this.file = join(dir, 'config.json')
    this.current = defaultConfig()
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'))
      this.current = mergeConfig(defaultConfig(), raw)
    } catch {
      await this.save(this.current)
    }
    return this.current
  }

  get(): AppConfig {
    return this.current
  }

  async save(cfg: AppConfig): Promise<AppConfig> {
    this.current = mergeConfig(defaultConfig(), cfg)
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(this.current, null, 2), 'utf8')
    return this.current
  }
}
