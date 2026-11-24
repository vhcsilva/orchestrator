import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { argvToShell, q } from './shell'
import { toHostPath } from './paths'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface ExecutorEnv {
  home: string
  distro: string
}

export interface ExecutorOptions {
  /** Executar via wsl.exe (Windows). */
  viaWsl: boolean
  distro: string
  /** Trecho bash executado antes de cada comando (PATH, nvm…). */
  shellInit: string
}

const MARK = '__ORQ_ENV__'

/**
 * Executa comandos no Linux: diretamente (Linux/macOS) ou dentro do WSL (Windows).
 * O script é enviado pelo stdin de um `bash -l`, assim nada passa pelas regras de
 * aspas da linha de comando do Windows.
 */
export class Executor {
  env: ExecutorEnv = { home: '', distro: '' }

  constructor(private opts: ExecutorOptions) {}

  get viaWsl(): boolean {
    return this.opts.viaWsl
  }

  update(opts: Partial<ExecutorOptions>): void {
    this.opts = { ...this.opts, ...opts }
  }

  private shellCommand(): [string, string[]] {
    if (this.opts.viaWsl) {
      const args = this.opts.distro ? ['-d', this.opts.distro] : []
      return ['wsl.exe', [...args, '--exec', 'bash', '-l']]
    }
    return ['bash', ['-l']]
  }

  private prelude(): string {
    return `${this.opts.shellInit || ''}\n`
  }

  /** Inicia um script bash longo. O chamador consome stdout/stderr. */
  spawnScript(script: string): ChildProcessWithoutNullStreams {
    const [cmd, args] = this.shellCommand()
    const child = spawn(cmd, args, { windowsHide: true })
    child.stdin.write(this.prelude() + script + '\n')
    child.stdin.end()
    return child
  }

  /** Executa um script curto e devolve a saída. */
  runScript(script: string, timeoutMs = 120_000): Promise<RunResult> {
    return new Promise((resolve) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = this.spawnScript(script)
      } catch (err) {
        resolve({ code: -1, stdout: '', stderr: String(err) })
        return
      }
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => child.kill(), timeoutMs)
      child.stdout.on('data', (d) => (stdout += d.toString()))
      child.stderr.on('data', (d) => (stderr += d.toString()))
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ code: -1, stdout, stderr: stderr + String(err) })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        // mensagens do próprio wsl.exe vêm em UTF-16
        resolve({ code: code ?? -1, stdout: stdout.replace(/\u0000/g, ''), stderr: stderr.replace(/\u0000/g, '') })
      })
    })
  }

  /** Executa um comando (argv) opcionalmente em um diretório. */
  run(argv: string[], cwd?: string, timeoutMs?: number): Promise<RunResult> {
    const cd = cwd ? `cd ${q(cwd)} || exit 97\n` : ''
    return this.runScript(cd + argvToShell(argv), timeoutMs)
  }

  /** Descobre $HOME e o nome da distribuição WSL. */
  async detectEnv(): Promise<ExecutorEnv & { ok: boolean; error?: string }> {
    const r = await this.runScript(`printf '${MARK}%s|%s\\n' "$HOME" "\${WSL_DISTRO_NAME:-}"`, 60_000)
    const line = r.stdout.split(/\r?\n/).find((l) => l.startsWith(MARK))
    if (!line) {
      return { ok: false, home: '', distro: '', error: (r.stderr || r.stdout || 'sem resposta').trim() }
    }
    const [home, distro] = line.slice(MARK.length).split('|')
    this.env = { home: home.trim(), distro: (distro || this.opts.distro || '').trim() }
    return { ok: true, ...this.env }
  }

  /** Caminho Linux -> caminho que o Node do app consegue abrir. */
  host(linuxPath: string): string {
    return toHostPath(linuxPath, { viaWsl: this.opts.viaWsl, distro: this.env.distro || this.opts.distro })
  }

  async readText(linuxPath: string): Promise<string | null> {
    try {
      return await fs.readFile(this.host(linuxPath), 'utf8')
    } catch {
      return null
    }
  }

  async writeText(linuxPath: string, content: string): Promise<void> {
    const p = this.host(linuxPath)
    await fs.mkdir(dirname(p), { recursive: true })
    await fs.writeFile(p, content, 'utf8')
  }

  async exists(linuxPath: string): Promise<boolean> {
    try {
      await fs.access(this.host(linuxPath))
      return true
    } catch {
      return false
    }
  }

  async mkdir(linuxPath: string): Promise<void> {
    await fs.mkdir(this.host(linuxPath), { recursive: true })
  }

  /** Encerra um processo Linux e seus filhos diretos. */
  async killTree(pid: number): Promise<void> {
    await this.runScript(`pkill -TERM -P ${pid} 2>/dev/null; kill -TERM ${pid} 2>/dev/null; true`, 20_000)
  }
}
