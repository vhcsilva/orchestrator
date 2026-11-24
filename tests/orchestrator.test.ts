// Fluxo completo com Claude Code e kiro-cli falsos, git real e bash local (sem WSL).
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConfigStore } from '../src/main/core/config'
import { Executor } from '../src/main/core/executor'
import { GitService } from '../src/main/core/git'
import { JobManager } from '../src/main/core/jobs'
import { expandHome } from '../src/main/core/paths'
import { PromptLibrary } from '../src/main/core/prompts'
import { FeatureStore } from '../src/main/core/store'
import { Orchestrator } from '../src/main/orchestrator'

const tmp = mkdtempSync(join(tmpdir(), 'orq-'))
const home = join(tmp, 'home')
const data = join(tmp, 'data')
const fakeLog = join(tmp, 'calls.jsonl')
const fakes = resolve(__dirname, 'fakes')
const notes: string[] = []

let orch: Orchestrator
let store: FeatureStore
let jobs: JobManager

async function waitFor(cond: () => boolean, ms = 15000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout esperando condição')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const calls = (): { args: string[]; kiro?: boolean; head: string }[] =>
  readFileSync(fakeLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  writeFileSync(fakeLog, '')
  Object.assign(process.env, {
    HOME: home,
    FAKE_LOG: fakeLog,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t'
  })
  // repositório com origin
  const origin = join(tmp, 'origin.git')
  const src = join(home, 'repos', 'repo-a')
  execSync(`git init -q --bare -b main ${origin} && git init -q -b main ${src}`)
  execSync(`echo hi > README.md && git add . && git commit -q -m init && git remote add origin ${origin} && git push -q origin main`, {
    cwd: src
  })

  const config = new ConfigStore(data)
  const cfg = await config.load()
  await config.save({
    ...cfg,
    wsl: { enabled: false, distro: '', shellInit: `export PATH="${fakes}:$PATH"` },
    repos: [{ name: 'repo-a', path: '~/repos/repo-a', baseBranch: 'main', defaultScope: 'a' }],
    execution: { ...cfg.execution, autoOndeParei: false }
  })
  const exec = new Executor({ viaWsl: false, distro: '', shellInit: config.get().wsl.shellInit })
  const env = await exec.detectEnv()
  expect(env.home).toBe(home)
  jobs = new JobManager(exec, data)
  await jobs.load()
  store = new FeatureStore(join(data, 'features'))
  await store.load()
  orch = new Orchestrator({
    config,
    exec,
    jobs,
    store,
    git: new GitService(exec),
    prompts: new PromptLibrary((p) => exec.readText(expandHome(p, home))),
    notify: (t, b) => notes.push(`${t}: ${b}`),
    openPath: async () => undefined
  })
}, 60000)

afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('orquestrador (fluxo completo)', () => {
  const key = 'CHK-9'
  const f = () => store.get(key)

  it('verifica o ambiente', async () => {
    const env = await orch.checkEnv(true)
    expect(env.wsl.ok).toBe(true)
    expect(env.claude.output).toContain('fake claude')
    expect(env.claude.output).toContain('atlassian')
    expect(env.kiro.ok).toBe(true)
    expect(env.git.ok).toBe(true)
  })

  it('busca a história no Jira', async () => {
    const s = await orch.lookupStory('chk-9')
    expect(s.title).toBe('Cupom por categoria')
    expect(s.linked[0]).toMatchObject({ key: 'CHK-10', isDesign: true, attachments: ['proto.html'] })
    const args = calls().at(-1)!.args
    expect(args.slice(0, 5)).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode'])
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read')
  })

  it('cria a feature com worktree, workspace e steering', async () => {
    await orch.createFeature({
      key,
      title: 'Cupom por categoria',
      linked: [],
      repos: [{ name: 'repo-a', base: 'main', type: 'feat', scope: 'coupon', branch: 'feat/coupon/CHK-9-cupom' }],
      startBusiness: false,
      openIde: false
    })
    const dir = join(home, 'features', key)
    expect(f().dir).toBe(dir)
    expect(
      execSync('git branch --show-current', { cwd: join(dir, 'repo-a') })
        .toString()
        .trim()
    ).toBe('feat/coupon/CHK-9-cupom')
    expect(JSON.parse(readFileSync(join(dir, `${key}.code-workspace`), 'utf8')).folders[0].path).toBe('.')
    expect(readFileSync(join(dir, '.kiro/steering/feature-context.md'), 'utf8')).toContain('feat(coupon): <descrição> [CHK-9]')
    await expect(
      orch.createFeature({
        key,
        title: '',
        linked: [],
        repos: [{ name: 'repo-a', base: 'main', type: 'feat', scope: '', branch: 'x' }],
        startBusiness: false,
        openIde: false
      })
    ).rejects.toThrow('já existe')
  })

  it('faz o refinamento de negócio e a reanálise com respostas', async () => {
    await orch.runBusiness(key)
    expect(f().negocio.status).toBe('done')
    expect(f().negocio.report!.points.map((p) => p.id)).toEqual(['D1', 'Q1'])
    expect(f().negocio.answers.D1.status).toBe('aberta')

    await orch.updateFeature(key, {
      negocio: {
        answers: { ...f().negocio.answers, D1: { status: 'respondida', who: 'PM', when: 'daily', text: 'vale 3 categorias' } },
        manualPoints: [{ id: 'Q9', kind: 'duvida', severity: 'media', blocksDev: false, title: 'manual', manual: true }],
        notes: 'PM confirmou'
      }
    })
    await orch.runBusiness(key)
    const last = calls().at(-1)!
    expect(last.head).toContain('Refinamento de negócio')
    const prompt = readFileSync(join(home, '.orquestrador', 'runs', `${jobs.list()[0].id}.prompt.md`), 'utf8')
    expect(prompt).toContain('D1 [respondida] — PM, daily: vale 3 categorias')
    expect(prompt).toContain('PM confirmou')
    expect(f().negocio.report!.summary).toBe('reanalisado')
    expect(f().negocio.report!.points.find((p) => p.id === 'D1')!.blocksDev).toBe(false)
    expect(f().negocio.manualPoints).toEqual([]) // incorporado pelo agente
  })

  it('refinamento técnico pausa com pergunta e retoma a sessão com a resposta', async () => {
    await orch.runTechnical(key)
    expect(f().stage).toBe('tecnico')
    expect(f().tecnico.status).toBe('waiting')
    expect(f().tecnico.selectedSubtasks.S1).toBe(false)
    const sid = f().tecnico.sessionId!
    expect(calls().at(-1)!.args).toContain(sid)

    await orch.answerTechnical(key, { P1: 'pricing-api' })
    const args = calls().at(-1)!.args
    expect(args[args.indexOf('--resume') + 1]).toBe(sid)
    expect(f().tecnico.status).toBe('done')
    expect(f().tecnico.report!.subtasks.map((s) => s.id)).toEqual(['S1', 'S2'])
  })

  it('cria as subtasks selecionadas no Jira uma única vez', async () => {
    await orch.updateFeature(key, { tecnico: { selectedSubtasks: { S1: true, S2: true } } })
    await orch.createSubtasks(key)
    expect(f().tecnico.createdSubtasks).toEqual([
      { id: 'S1', key: 'CHK-100' },
      { id: 'S2', key: 'CHK-101' }
    ])
    await expect(orch.createSubtasks(key)).rejects.toThrow('Nenhuma subtask')
  })

  it('gera a spec com kiro-cli', async () => {
    await orch.generateSpec(key)
    expect(f().spec.status).toBe('done')
    expect(f().stage).toBe('spec')
    const tasks = await orch.specTasks(key)
    expect(tasks.filter((t) => t.depth === 0).map((t) => t.id)).toEqual(['1', '2'])
    expect(calls().at(-1)).toMatchObject({ kiro: true, args: ['chat', '--no-interactive', '--trust-all-tools'] })
  })

  it('detecta mudança na história e atualiza a spec', async () => {
    await orch.checkStory(key)
    expect(f().drift).toBeUndefined()
    process.env.FAKE_STORY_CHANGED = '1'
    await orch.checkStory(key)
    expect(f().drift!.diff.some((d) => d.op === '+' && d.text.includes('3 categorias'))).toBe(true)
    await orch.updateSpecFromDrift(key)
    expect(f().drift).toBeUndefined()
    expect(readFileSync(join(f().dir, 'contexto/historia.md'), 'utf8')).toContain('3 categorias')
    await orch.checkStory(key)
    expect(f().drift).toBeUndefined()
    delete process.env.FAKE_STORY_CHANGED
  })

  it('pausa se houver alterações suas e executa todas as tasks depois', async () => {
    const dirty = join(f().dir, 'repo-a', 'meu-rascunho.txt')
    writeFileSync(dirty, 'x')
    await orch.approveSpec(key)
    await waitFor(() => f().dev.status === 'waiting')
    expect(f().dev.message).toContain('meu-rascunho.txt')
    rmSync(dirty)

    await orch.startDev(key)
    expect(f().dev.status).toBe('done')
    expect(f().stage).toBe('pronto')
    const log = execSync('git log --oneline', { cwd: join(f().dir, 'repo-a') }).toString()
    expect(log).toContain('task 1')
    expect(log).toContain('task 2')
    const kiroPrompt = calls()
      .filter((c) => c.kiro)
      .at(-1)!.head
    expect(kiroPrompt).toContain('Implemente a tarefa 2')
    expect(notes.some((n) => n.includes('Todas as tarefas'))).toBe(true)
  })

  it('para com erro se o kiro-cli não marcar a task', async () => {
    const tasksFile = join(f().dir, '.kiro/specs', f().spec.name, 'tasks.md')
    writeFileSync(tasksFile, readFileSync(tasksFile, 'utf8') + '- [ ] 3. [repo-a] Terceira\n')
    process.env.FAKE_KIRO_SKIP_MARK = '3'
    await orch.startDev(key)
    expect(f().dev.status).toBe('error')
    expect(f().dev.error).toContain('não foi marcada')
    delete process.env.FAKE_KIRO_SKIP_MARK
  })

  it('gera o onde-parei e guarda o log das execuções', async () => {
    await orch.ondeParei(key)
    expect(await orch.readFeatureFile(key, 'contexto/onde-parei.md')).toBe('Tudo certo.\n')
    await expect(orch.readFeatureFile(key, '../../etc/passwd')).rejects.toThrow('Caminho inválido')
    const job = jobs.list().find((j) => j.kind === 'onde-parei')!
    expect(job.status).toBe('ok')
    expect(job.costUsd).toBe(0.01)
    const log = await jobs.log(job.id)
    expect(log.some((l) => l.text.includes('concluído'))).toBe(true)
  })

  it('cancela uma execução em andamento', async () => {
    const out = jobs.start({ featureKey: key, kind: 'teste', engine: 'sistema', cwd: home, argv: ['sleep', '30'], parser: 'plain' })
    await waitFor(() => jobs.list()[0].kind === 'teste')
    await new Promise((r) => setTimeout(r, 300))
    await jobs.cancel(jobs.list()[0].id)
    const res = await out
    expect(res.status).toBe('cancelled')
  })

  it('exclui a feature removendo os worktrees', async () => {
    const dir = f().dir
    await orch.deleteFeature(key, true)
    expect(store.has(key)).toBe(false)
    expect(existsSync(dir)).toBe(false)
    const wt = execSync('git worktree list', { cwd: join(home, 'repos', 'repo-a') }).toString()
    expect(wt).not.toContain('features')
    // a branch continua no repositório
    expect(execSync('git branch', { cwd: join(home, 'repos', 'repo-a') }).toString()).toContain('feat/coupon/CHK-9-cupom')
  })
})
