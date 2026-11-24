import type { DiffLine } from '@shared/types'

export function normalizeText(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
}

/** Diff de linhas por LCS (textos pequenos: histórias do Jira). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = normalizeText(before)
  const b = normalizeText(after)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: '-', text: a[i++] })
    } else {
      out.push({ op: '+', text: b[j++] })
    }
  }
  while (i < n) out.push({ op: '-', text: a[i++] })
  while (j < m) out.push({ op: '+', text: b[j++] })
  return out
}

export function hasChanges(diff: DiffLine[]): boolean {
  return diff.some((d) => d.op !== ' ' && d.text.trim() !== '')
}

/** Mantém só as mudanças e algumas linhas de contexto. */
export function compactDiff(diff: DiffLine[], context = 2): DiffLine[] {
  const keep = new Set<number>()
  diff.forEach((d, i) => {
    if (d.op === ' ') return
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) keep.add(k)
  })
  const out: DiffLine[] = []
  let last = -1
  ;[...keep]
    .sort((x, y) => x - y)
    .forEach((i) => {
      if (last >= 0 && i > last + 1) out.push({ op: ' ', text: '…' })
      out.push(diff[i])
      last = i
    })
  return out
}

export function diffToText(diff: DiffLine[]): string {
  return diff.map((d) => `${d.op} ${d.text}`).join('\n')
}
