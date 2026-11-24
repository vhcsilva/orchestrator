/** Requisito -> tarefas, a partir das linhas "_Requisitos: 1.1, 2.3_" do tasks.md. */
export function traceability(tasksMd: string): { req: string; tasks: string[] }[] {
  const map = new Map<string, Set<string>>()
  let current: string | null = null
  for (const line of tasksMd.split(/\r?\n/)) {
    const t = /^[-*]\s+\[.\]\*?\s*(\d+)\.?\s/.exec(line)
    if (t) current = t[1]
    const r = /(?:Requisitos?|Requirements?)\s*:\s*([^_\n]+)/i.exec(line)
    if (r && current) {
      for (const id of r[1]
        .split(/[,;\s]+/)
        .map((x) => x.trim().replace(/\.$/, ''))
        .filter((x) => /^\d+(\.\d+)*$/.test(x))) {
        if (!map.has(id)) map.set(id, new Set())
        map.get(id)!.add(current)
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([req, tasks]) => ({ req, tasks: [...tasks] }))
}
