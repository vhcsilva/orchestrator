import { describe, expect, it } from 'vitest'
import { branchName, commitMessage, isValidBranch, slugify } from '@shared/branches'
import { traceability } from '@shared/trace'
import { defaultConfig, mergeConfig } from '../src/main/core/config'
import { compactDiff, diffLines, hasChanges } from '../src/main/core/diff'
import { extractJson } from '../src/main/core/json'
import { normalizeBusinessReport, normalizeTechReport } from '../src/main/core/normalize'
import { toHostPath, expandHome } from '../src/main/core/paths'
import { render } from '../src/main/core/prompts'
import { argvToShell, q, splitArgs } from '../src/main/core/shell'
import { parseClaudeLine, stripAnsi } from '../src/main/core/streamJson'
import { parseTasks, pendingTopLevel, progress } from '../src/main/core/tasks'

describe('shell', () => {
  it('quotes safely', () => {
    expect(q('abc')).toBe('abc')
    expect(q("it's")).toBe(`'it'\\''s'`)
    expect(q('a b')).toBe("'a b'")
    expect(q('')).toBe("''")
    expect(argvToShell(['git', '-C', '~/repos/x y'])).toBe(`git -C "$HOME"/'repos/x y'`)
  })
  it('splits extra args', () => {
    expect(splitArgs(`--model opus --x "a b" 'c d' e`)).toEqual(['--model', 'opus', '--x', 'a b', 'c d', 'e'])
    expect(splitArgs('  ')).toEqual([])
  })
})

describe('paths', () => {
  it('converts to UNC when via WSL', () => {
    expect(toHostPath('/home/u/features/CHK-1', { viaWsl: true, distro: 'Ubuntu' })).toBe(
      '\\\\wsl.localhost\\Ubuntu\\home\\u\\features\\CHK-1'
    )
    expect(toHostPath('/home/u/x', { viaWsl: false, distro: '' })).toBe('/home/u/x')
    expect(expandHome('~/features', '/home/u')).toBe('/home/u/features')
  })
})

describe('branches', () => {
  it('slugifies portuguese text', () => {
    expect(slugify('Troca de forma de pagamento — cartão', 40)).toBe('troca-de-forma-de-pagamento-cartao')
    expect(slugify('Histórico de pedidos com filtros por período e vendedor', 30)).toBe('historico-de-pedidos-com')
  })
  it('renders branch with and without scope', () => {
    const p = '{tipo}/{escopo}/{chave}-{slug}'
    expect(branchName(p, { tipo: 'feat', escopo: 'payments', chave: 'CHK-490', slug: 'troca' })).toBe('feat/payments/CHK-490-troca')
    expect(branchName(p, { tipo: 'fix', escopo: '', chave: 'CHK-1', slug: 'x' })).toBe('fix/CHK-1-x')
    expect(isValidBranch('feat/payments/CHK-490-troca')).toBe(true)
    expect(isValidBranch('feat//x')).toBe(false)
    expect(isValidBranch('feat/x.lock')).toBe(false)
  })
  it('renders commit messages', () => {
    const p = '{tipo}({escopo}): {descricao} [{chave}]'
    expect(commitMessage(p, { tipo: 'feat', escopo: 'address', chave: 'CHK-451', descricao: 'pre-select favorite' })).toBe(
      'feat(address): pre-select favorite [CHK-451]'
    )
    expect(commitMessage(p, { tipo: 'chore', escopo: '', chave: 'CHK-1', descricao: 'x' })).toBe('chore: x [CHK-1]')
  })
})

describe('tasks.md', () => {
  const md = `# Plano

- [x] 1. [address-api] Modelo e migração
  - [x] 1.1 Migração
  - _Requisitos: 1.1, 1.2_
- [-] 2. [checkout-web] Pré-selecionar favorito
  - [ ] 2.1 Componente
  - _Requisitos: 2.1_
- [ ]* 3. Testes opcionais
- [ ] 4 Documentação
`
  it('parses checkboxes, depth and states', () => {
    const t = parseTasks(md)
    expect(t.map((x) => [x.id, x.depth, x.done, x.inProgress])).toEqual([
      ['1', 0, true, false],
      ['1.1', 1, true, false],
      ['2', 0, false, true],
      ['2.1', 1, false, false],
      ['3', 0, false, false],
      ['4', 0, false, false]
    ])
    expect(pendingTopLevel(t).map((x) => x.id)).toEqual(['2', '3', '4'])
    expect(progress(t)).toEqual({ done: 1, total: 4 })
  })
  it('builds traceability', () => {
    expect(traceability(md)).toEqual([
      { req: '1.1', tasks: ['1'] },
      { req: '1.2', tasks: ['1'] },
      { req: '2.1', tasks: ['2'] }
    ])
  })
})

describe('diff', () => {
  it('detects changed acceptance criteria', () => {
    const a = '# CHK-1 — X\n\n## Critérios de aceite\n- O cupom se aplica a uma categoria.\n- Mostra o desconto.\n'
    const b = '# CHK-1 — X\n\n## Critérios de aceite\n- O cupom se aplica a até 3 categorias.\n- Mostra o desconto.\n'
    const d = diffLines(a, b)
    expect(hasChanges(d)).toBe(true)
    expect(d.filter((x) => x.op !== ' ')).toEqual([
      { op: '-', text: '- O cupom se aplica a uma categoria.' },
      { op: '+', text: '- O cupom se aplica a até 3 categorias.' }
    ])
    expect(hasChanges(diffLines(a, a + '\n\n'))).toBe(false)
    expect(compactDiff(d, 1).length).toBeLessThan(d.length)
  })
})

describe('json & normalize', () => {
  it('extracts JSON from noisy text', () => {
    expect(extractJson('Aqui está:\n```json\n{"a":1}\n```\nfim')).toEqual({ a: 1 })
    expect(extractJson('{"key":"X-1","linked":[]}')).toEqual({ key: 'X-1', linked: [] })
    expect(extractJson('nada')).toBeNull()
  })
  it('normalizes agent reports', () => {
    const r = normalizeBusinessReport({ points: [{ kind: 'Divergência', severity: 'High', title: 'x', blocksDev: 1 }, { title: 'y' }] })
    expect(r.points[0]).toMatchObject({ id: 'D1', kind: 'divergencia', severity: 'alta', blocksDev: true })
    expect(r.points[1]).toMatchObject({ id: 'Q2', kind: 'duvida', severity: 'media', blocksDev: false })
    const t = normalizeTechReport({ questions: [{ question: 'q', blocking: true }], subtasks: [{ title: 's' }] })
    expect(t.questions[0].id).toBe('P1')
    expect(t.subtasks[0].id).toBe('S1')
    expect(t.dependencies).toEqual([])
  })
})

describe('config', () => {
  it('merges saved config over defaults', () => {
    const base = defaultConfig('win32')
    const merged = mergeConfig(base, { claude: { model: 'opus', unknown: 1 }, repos: [{ name: 'a' }], wsl: { enabled: 'yes' } })
    expect(merged.claude.model).toBe('opus')
    expect(merged.claude.command).toBe('claude')
    expect(merged.repos).toEqual([{ name: 'a' }])
    expect(merged.wsl.enabled).toBe(true) // tipo inválido mantém o padrão
  })
})

describe('prompts', () => {
  it('renders placeholders', () => {
    expect(render('Olá {{ key }} {{x}}!', { key: 'CHK-1' })).toBe('Olá CHK-1 !')
  })
})

describe('claude stream-json', () => {
  it('parses init, tool use and result', () => {
    const init = parseClaudeLine(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 's1',
        model: 'm',
        mcp_servers: [{ name: 'atlassian', status: 'connected' }]
      })
    )
    expect(init.sessionId).toBe('s1')
    expect(init.log).toContain('atlassian:connected')
    const tool = parseClaudeLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'mcp__atlassian__getJiraIssue', input: { issueIdOrKey: 'CHK-1' } }] }
      })
    )
    expect(tool.activity).toBe('atlassian · getJiraIssue CHK-1')
    const res = parseClaudeLine(
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 's1', total_cost_usd: 0.12 })
    )
    expect(res.result).toMatchObject({ isError: false, text: 'ok', costUsd: 0.12 })
    expect(parseClaudeLine('texto solto').log).toBe('texto solto')
    expect(stripAnsi('\x1b[32mverde\x1b[0m')).toBe('verde')
  })
})
