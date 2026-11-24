import { posix } from 'node:path'

/** Expande ~ para o home do Linux (WSL). */
export function expandHome(p: string, home: string): string {
  if (p === '~') return home
  if (p.startsWith('~/')) return posix.join(home, p.slice(2))
  return p
}

export interface HostPathOptions {
  /** true quando o app roda no Windows e os arquivos estão no WSL. */
  viaWsl: boolean
  distro: string
}

/**
 * Converte um caminho Linux para um caminho acessível pelo Node do app.
 * No Windows com WSL: /home/u/x -> \\wsl.localhost\Ubuntu\home\u\x
 */
export function toHostPath(linuxPath: string, opts: HostPathOptions): string {
  if (!opts.viaWsl) return linuxPath
  if (!opts.distro) throw new Error('Distribuição WSL desconhecida para converter caminho')
  return `\\\\wsl.localhost\\${opts.distro}${linuxPath.replace(/\//g, '\\')}`
}

export function featureDirFor(root: string, key: string): string {
  return posix.join(root, key)
}
