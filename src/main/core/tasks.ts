import type { SpecTask } from '@shared/types'

// Lê o tasks.md de uma spec do Kiro: "- [ ] 1. Título", "- [x] 1.1 Sub", "- [-] 2. Em andamento", "- [ ]* 3. Opcional"
const TASK_RE = /^(\s*)[-*]\s+\[( |x|X|-|~)\](\*?)\s*(?:(\d+(?:\.\d+)*)\.?\s+)?(.*)$/

export function parseTasks(md: string): SpecTask[] {
  const out: SpecTask[] = []
  const lines = md.split(/\r?\n/)
  let seq = 0
  lines.forEach((line, i) => {
    const m = TASK_RE.exec(line)
    if (!m) return
    const indent = m[1].replace(/\t/g, '  ').length
    const mark = m[2]
    seq++
    out.push({
      id: m[4] ?? String(seq),
      title: m[5].trim(),
      done: mark === 'x' || mark === 'X',
      inProgress: mark === '-' || mark === '~',
      depth: Math.floor(indent / 2),
      line: i + 1
    })
  })
  return out
}

/** Tarefas de primeiro nível ainda não concluídas, na ordem do arquivo. */
export function pendingTopLevel(tasks: SpecTask[]): SpecTask[] {
  return tasks.filter((t) => t.depth === 0 && !t.done)
}

export function progress(tasks: SpecTask[]): { done: number; total: number } {
  const top = tasks.filter((t) => t.depth === 0)
  return { done: top.filter((t) => t.done).length, total: top.length }
}
