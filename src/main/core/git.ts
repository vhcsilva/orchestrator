import type { Executor } from './executor'

export class GitService {
  constructor(private exec: Executor) {}

  private async git(args: string[], cwd?: string, timeoutMs = 180_000): Promise<string> {
    const r = await this.exec.run(['git', ...args], cwd, timeoutMs)
    if (r.code !== 0) {
      throw new Error(`git ${args.join(' ')} falhou: ${(r.stderr || r.stdout).trim()}`)
    }
    return r.stdout
  }

  async isRepo(path: string): Promise<boolean> {
    const r = await this.exec.run(['git', 'rev-parse', '--is-inside-work-tree'], path, 30_000)
    return r.code === 0 && r.stdout.includes('true')
  }

  async fetch(repo: string, base: string): Promise<boolean> {
    const r = await this.exec.run(['git', 'fetch', 'origin', base], repo, 180_000)
    return r.code === 0
  }

  async refExists(repo: string, ref: string): Promise<boolean> {
    const r = await this.exec.run(['git', 'rev-parse', '--verify', '--quiet', ref], repo, 30_000)
    return r.code === 0
  }

  /** Cria (ou reaproveita) o worktree da branch da feature a partir da base. */
  async addWorktree(repo: string, branch: string, base: string, target: string, log: (t: string) => void): Promise<void> {
    const fetched = await this.fetch(repo, base)
    log(fetched ? `fetch origin ${base}` : `fetch origin ${base} falhou; usando a base local`)
    if (await this.refExists(repo, `refs/heads/${branch}`)) {
      log(`branch ${branch} já existe; criando worktree a partir dela`)
      await this.git(['worktree', 'add', target, branch], repo)
      return
    }
    const startPoint = fetched && (await this.refExists(repo, `origin/${base}`)) ? `origin/${base}` : base
    await this.git(['worktree', 'add', '--no-track', '-b', branch, target, startPoint], repo)
    log(`worktree ${target} criado em ${branch} (de ${startPoint})`)
  }

  async removeWorktree(repo: string, target: string): Promise<void> {
    await this.exec.run(['git', 'worktree', 'remove', '--force', target], repo, 60_000)
    await this.exec.run(['git', 'worktree', 'prune'], repo, 60_000)
  }

  /** Linhas de `git status --porcelain` (mudanças não commitadas). */
  async dirtyFiles(dir: string): Promise<string[]> {
    const out = await this.git(['status', '--porcelain'], dir, 60_000)
    return out
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => /^[ MADRCU?!]{2} /.test(l))
  }

  async head(dir: string): Promise<string> {
    return (await this.git(['rev-parse', 'HEAD'], dir, 30_000)).trim().split('\n').pop() ?? ''
  }

  async diffStat(dir: string, base: string): Promise<{ added: number; removed: number }> {
    const r = await this.exec.run(['git', 'diff', '--shortstat', `${base}...HEAD`], dir, 60_000)
    const added = Number(/(\d+) insertion/.exec(r.stdout)?.[1] ?? 0)
    const removed = Number(/(\d+) deletion/.exec(r.stdout)?.[1] ?? 0)
    return { added, removed }
  }
}
