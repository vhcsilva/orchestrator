// Utilitários para montar scripts bash com segurança (aspas simples POSIX).

/** Coloca um valor entre aspas simples para o bash, escapando aspas internas. */
export function q(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_\-./=:@%+,]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Converte um argv em uma linha de comando bash. `~/` no início é expandido pelo bash. */
export function argvToShell(argv: string[]): string {
  return argv.map((a) => (a.startsWith('~/') ? `"$HOME"/${q(a.slice(2))}` : q(a))).join(' ')
}

/**
 * Divide uma string de argumentos extras (ex.: `--model opus --foo "a b"`) em argv.
 * Suporta aspas simples e duplas, sem expansão de variáveis.
 */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let has = false
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
    }
  }
  if (has || cur) out.push(cur)
  return out
}
