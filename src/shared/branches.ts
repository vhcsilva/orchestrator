// Nomes de branch e mensagens de commit no padrão Conventional Commits.

export function slugify(text: string, maxLength = 40): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length <= maxLength) return base
  const cut = base.slice(0, maxLength)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

export interface PatternVars {
  tipo: string
  escopo: string
  chave: string
  slug?: string
  descricao?: string
}

export function renderPattern(pattern: string, vars: PatternVars): string {
  return pattern.replace(/\{(tipo|escopo|chave|slug|descricao)\}/g, (_, k: keyof PatternVars) => vars[k] ?? '')
}

/** Gera o nome da branch, limpando separadores vazios quando não há escopo. */
export function branchName(pattern: string, vars: PatternVars): string {
  return renderPattern(pattern, vars)
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/\/-|-\//g, '/')
    .replace(/^[/-]+|[/-]+$/g, '')
}

/** Mensagem de commit; sem escopo vira `tipo: descrição`. */
export function commitMessage(pattern: string, vars: PatternVars): string {
  return renderPattern(pattern, vars)
    .replace(/\(\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseTypes(types: string): string[] {
  return types
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

const VALID_BRANCH = /^(?!\/)(?!.*\/\/)(?!.*\.\.)(?!.*@\{)[^\s~^:?*[\\]+(?<![/.])$/

export function isValidBranch(name: string): boolean {
  return VALID_BRANCH.test(name) && !name.endsWith('.lock')
}
