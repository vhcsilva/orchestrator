import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import type { AppConfig, EnvStatus, Feature, FeaturePatch, NewFeatureInput, SpecTask, Stage, StoryLookup } from '@shared/types'
import { commitMessage, slugify } from '@shared/branches'
import type { ConfigStore } from './core/config'
import { compactDiff, diffLines, diffToText, hasChanges } from './core/diff'
import type { Executor } from './core/executor'
import type { GitService } from './core/git'
import type { JobManager, JobOutcome } from './core/jobs'
import { extractJson } from './core/json'
import { normalizeBusinessReport, normalizeLookup, normalizeTechReport } from './core/normalize'
import { expandHome } from './core/paths'
import { render, type PromptLibrary, type PromptName } from './core/prompts'
import { splitArgs } from './core/shell'
import type { FeatureStore } from './core/store'
import { parseTasks, pendingTopLevel } from './core/tasks'
import { buildSteering, buildWorkspace, CONTEXT_DIR, contextPath, specDir, workspaceFile } from './core/workspace'

export interface OrchestratorDeps {
  config: ConfigStore
  exec: Executor
  jobs: JobManager
  store: FeatureStore
  git: GitService
  prompts: PromptLibrary
  notify: (title: string, body: string) => void
  openPath: (hostPath: string) => Promise<void>
}

type StepName = 'negocio' | 'tecnico' | 'spec' | 'dev' | 'subtasks' | 'historia' | 'ondeParei'

const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/

/** Monta o comando que abre o Kiro. Placeholders: {workspace} {workspaceHost} {dir} {dirHost} {distro}. */
export function buildOpenCommand(template: string, vars: Record<string, string>): string {
  if (template.includes('{distro}') && !vars.distro) {
    throw new Error('Distribuição WSL desconhecida: informe-a em Configurações › Integrações e teste o ambiente')
  }
  return template.replace(/\{(workspace|workspaceHost|dir|dirHost|distro)\}/g, (_, k: string) => vars[k] ?? '')
}

export class Orchestrator {
  private busy = new Set<string>()
  private timer?: NodeJS.Timeout

  constructor(private d: OrchestratorDeps) {}

  // ------------------------------------------------------------ utilidades

  private get cfg(): AppConfig {
    return this.d.config.get()
  }

  private home(): string {
    return this.d.exec.env.home
  }

  featuresRoot(): string {
    return expandHome(this.cfg.featuresRoot, this.home())
  }

  private guard(key: string, step: StepName): () => void {
    const id = `${key}:${step}`
    if (this.busy.has(id)) throw new Error(`Já existe uma execução de "${step}" em andamento para ${key}`)
    this.busy.add(id)
    return () => this.busy.delete(id)
  }

  private jiraSiteHint(): string {
    return this.cfg.jira.siteUrl ? ` (site ${this.cfg.jira.siteUrl})` : ''
  }

  private commitFor(f: Feature, r: Feature['repos'][number], descricao = '<descrição>'): string {
    return commitMessage(this.cfg.branches.commitPattern, { tipo: r.type, escopo: r.scope, chave: f.key, descricao })
  }

  private repoList(f: Feature): string {
    return f.repos.map((r) => `- \`${r.name}/\` (${r.worktree}) — branch \`${r.branch}\``).join('\n') || '- (nenhum)'
  }

  private baseVars(f: Feature): Record<string, string> {
    return {
      key: f.key,
      title: f.title,
      featureDir: f.dir,
      contextDir: posix.join(f.dir, CONTEXT_DIR),
      specName: f.spec.name,
      jiraSiteHint: this.jiraSiteHint(),
      designHint: this.cfg.jira.designHint,
      prototypePattern: this.cfg.jira.prototypePattern,
      subtaskType: this.cfg.jira.subtaskType,
      repoList: this.repoList(f),
      repoNames: f.repos.map((r) => r.name).join(', ')
    }
  }

  private async prompt(name: PromptName, vars: Record<string, string>): Promise<string> {
    const tpl = await this.d.prompts.get(name, this.cfg.prompts)
    const fmt = render(await this.d.prompts.get('historiaFormato', this.cfg.prompts), vars)
    return render(tpl, { historiaFormato: fmt, ...vars })
  }

  private claudeArgv(o: { quick?: boolean; sessionId?: string; resume?: string; addDirs?: string[] } = {}): string[] {
    const c = this.cfg.claude
    const argv = [c.command, '-p', '--output-format', 'stream-json', '--verbose']
    if (c.permissionMode === 'bypassPermissions') argv.push('--dangerously-skip-permissions')
    else argv.push('--permission-mode', c.permissionMode)
    const model = o.quick && c.quickModel ? c.quickModel : c.model
    if (model) argv.push('--model', model)
    if (c.maxBudgetUsd > 0) argv.push('--max-budget-usd', String(c.maxBudgetUsd))
    if (o.resume) argv.push('--resume', o.resume)
    else if (o.sessionId) argv.push('--session-id', o.sessionId)
    for (const dir of o.addDirs ?? []) argv.push('--add-dir', dir)
    argv.push(...splitArgs(c.extraArgs))
    // lista variádica por último: tudo que vier depois seria lido como ferramenta
    if (c.allowedTools.length && c.permissionMode !== 'bypassPermissions') argv.push('--allowedTools', ...c.allowedTools)
    return argv
  }

  private kiroArgv(): string[] {
    const k = this.cfg.kiro
    const argv = [k.command, 'chat', '--no-interactive']
    if (k.trustAllTools) argv.push('--trust-all-tools')
    else if (k.trustTools.trim()) argv.push(`--trust-tools=${k.trustTools.trim()}`)
    argv.push(...splitArgs(k.extraArgs))
    return argv
  }

  private runClaude(
    f: Pick<Feature, 'key' | 'dir'>,
    kind: string,
    prompt: string,
    o: { quick?: boolean; sessionId?: string; resume?: string; cwd?: string; addDirs?: string[] } = {}
  ): Promise<JobOutcome> {
    return this.d.jobs.start({
      featureKey: f.key,
      kind,
      engine: 'claude',
      cwd: o.cwd ?? f.dir,
      argv: this.claudeArgv(o),
      prompt,
      parser: 'claude'
    })
  }

  private runKiro(f: Feature, kind: string, prompt: string): Promise<JobOutcome> {
    return this.d.jobs.start({ featureKey: f.key, kind, engine: 'kiro-cli', cwd: f.dir, argv: this.kiroArgv(), prompt, parser: 'kiro' })
  }

  private failMsg(o: JobOutcome): string {
    if (o.status === 'cancelled') return 'cancelado'
    return o.job.error || 'falhou'
  }

  private notify(f: Pick<Feature, 'key'>, body: string): void {
    if (this.cfg.execution.notifications) this.d.notify(`${f.key}`, body)
  }

  private get(key: string): Feature {
    return this.d.store.get(key)
  }

  private async readJson<T>(path: string): Promise<T | null> {
    const raw = await this.d.exec.readText(path)
    return raw ? extractJson<T>(raw) : null
  }

  // ------------------------------------------------------------ ambiente

  /** `full` inclui `claude mcp list` (mais lento: testa a conexão de cada MCP). */
  async checkEnv(full = false): Promise<EnvStatus> {
    const env = await this.d.exec.detectEnv()
    const check = async (script: string, timeout = 60_000): Promise<{ ok: boolean; output: string }> => {
      const r = await this.d.exec.runScript(script, timeout)
      return { ok: r.code === 0, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() }
    }
    const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
    const [claude, kiro, git] = await Promise.all([
      check(`${q(this.cfg.claude.command)} --version${full ? ` && ${q(this.cfg.claude.command)} mcp list` : ''}`, 120_000),
      check(`${q(this.cfg.kiro.command)} --version`),
      check('git --version')
    ])
    return {
      platform: process.platform,
      wsl: { ok: env.ok, output: env.error ?? '', distro: env.distro, home: env.home },
      claude,
      kiro,
      git
    }
  }

  // ------------------------------------------------------------ criação

  async lookupStory(rawKey: string): Promise<StoryLookup> {
    const key = rawKey.trim().toUpperCase()
    if (!KEY_RE.test(key)) throw new Error(`Chave inválida: ${rawKey}`)
    const root = this.featuresRoot()
    await this.d.exec.mkdir(root)
    const prompt = await this.prompt('buscarHistoria', {
      key,
      jiraSiteHint: this.jiraSiteHint(),
      designHint: this.cfg.jira.designHint,
      prototypePattern: this.cfg.jira.prototypePattern
    })
    const out = await this.runClaude({ key, dir: root }, 'buscar-historia', prompt, { quick: true })
    if (out.status !== 'ok') throw new Error(`Não foi possível ler ${key}: ${this.failMsg(out)}`)
    const json = extractJson(out.claude?.text ?? out.output)
    if (!json) throw new Error('O Claude Code não devolveu o JSON esperado. Veja o log da execução.')
    return normalizeLookup(json, key)
  }

  async createFeature(input: NewFeatureInput): Promise<Feature> {
    const key = input.key.trim().toUpperCase()
    if (!KEY_RE.test(key)) throw new Error(`Chave inválida: ${input.key}`)
    if (this.d.store.has(key)) throw new Error(`A feature ${key} já existe`)
    if (!input.repos.length) throw new Error('Selecione pelo menos um repositório')
    const title = input.title.trim() || key
    const dir = posix.join(this.featuresRoot(), key)
    const now = new Date().toISOString()
    const repos = input.repos.map((r) => {
      const cfgRepo = this.cfg.repos.find((c) => c.name === r.name)
      if (!cfgRepo) throw new Error(`Repositório ${r.name} não está nas configurações`)
      if (!r.branch.trim()) throw new Error(`Informe a branch de ${r.name}`)
      return {
        name: r.name,
        sourcePath: expandHome(cfgRepo.path, this.home()),
        base: r.base || cfgRepo.baseBranch,
        type: r.type,
        scope: r.scope,
        branch: r.branch.trim(),
        worktree: posix.join(dir, r.name)
      }
    })
    const feature: Feature = {
      key,
      title,
      createdAt: now,
      updatedAt: now,
      stage: 'negocio',
      dir,
      repos,
      linked: input.linked,
      negocio: { status: 'idle', answers: {}, manualPoints: [], notes: '' },
      tecnico: { status: 'idle', answers: {}, selectedSubtasks: {}, createdSubtasks: [] },
      spec: {
        status: 'idle',
        name: slugify(`${key}-${title}`, 50),
        approved: false,
        executeAfterApprove: true,
        confirmEachTask: false
      },
      dev: { status: 'idle', pauseRequested: false }
    }

    await this.d.jobs.record(key, 'criar-feature', 'git', async (log) => {
      if (await this.d.exec.exists(dir)) log(`pasta ${dir} já existe; reaproveitando`)
      await this.d.exec.mkdir(posix.join(dir, CONTEXT_DIR, 'design'))
      for (const r of repos) {
        if (await this.d.exec.exists(r.worktree)) {
          log(`${r.worktree} já existe; mantendo`)
          continue
        }
        if (!(await this.d.git.isRepo(r.sourcePath))) throw new Error(`${r.sourcePath} não é um repositório git`)
        await this.d.git.addWorktree(r.sourcePath, r.branch, r.base, r.worktree, log)
      }
      await this.writeWorkspaceFiles(feature)
      log(`workspace ${workspaceFile(feature)}`)
      return `feature criada em ${dir}`
    })

    await this.d.store.put(feature)
    if (input.openIde) this.openInIde(key).catch((e) => this.notify(feature, `Erro ao abrir o Kiro: ${e.message}`))
    if (input.startBusiness) this.runBusiness(key).catch(() => undefined)
    return feature
  }

  private async writeWorkspaceFiles(f: Feature): Promise<void> {
    await this.d.exec.writeText(workspaceFile(f), buildWorkspace(f))
    if (this.cfg.ide.generateSteering) {
      await this.d.exec.writeText(
        posix.join(f.dir, '.kiro', 'steering', 'feature-context.md'),
        buildSteering(f, (r) => this.commitFor(f, r))
      )
    }
  }

  async updateFeature(key: string, patch: FeaturePatch): Promise<Feature> {
    return this.d.store.mutate(key, (f) => {
      if (patch.title !== undefined) f.title = patch.title
      if (patch.negocio) Object.assign(f.negocio, patch.negocio)
      if (patch.tecnico) Object.assign(f.tecnico, patch.tecnico)
      if (patch.spec) Object.assign(f.spec, patch.spec)
    })
  }

  async deleteFeature(key: string, removeWorktrees: boolean): Promise<void> {
    const f = this.get(key)
    await this.d.jobs.cancelFeature(key)
    if (removeWorktrees) {
      await this.d.jobs.record(key, 'remover-feature', 'git', async (log) => {
        for (const r of f.repos) {
          await this.d.git.removeWorktree(r.sourcePath, r.worktree)
          log(`worktree removido: ${r.worktree} (a branch ${r.branch} foi mantida)`)
        }
        await this.d.exec.run(['rm', '-rf', f.dir])
        return `pasta ${f.dir} removida`
      })
    }
    await this.d.store.remove(key)
  }

  async setStage(key: string, stage: Stage): Promise<void> {
    await this.d.store.mutate(key, (f) => {
      f.stage = stage
    })
  }

  // ------------------------------------------------------------ 1. negócio

  async runBusiness(key: string): Promise<void> {
    const release = this.guard(key, 'negocio')
    try {
      let f = await this.d.store.mutate(key, (x) => {
        x.negocio.status = 'running'
        x.negocio.error = undefined
      })
      const vars = this.baseVars(f)
      const linkedList =
        f.linked.map((l) => `   - ${l.key} — ${l.title} (${l.relation}${l.isDesign ? ', design' : ''})`).join('\n') ||
        '   - (descubra pelo Jira)'
      let reanalysis = ''
      if (f.negocio.report) {
        const answers = Object.entries(f.negocio.answers)
          .filter(([, a]) => a.text.trim() || a.status !== 'aberta')
          .map(
            ([id, a]) =>
              `- ${id} [${a.status}]${a.who ? ` — ${a.who}` : ''}${a.when ? `, ${a.when}` : ''}: ${a.text.trim() || '(sem texto)'}`
          )
          .join('\n')
        reanalysis = render(await this.d.prompts.get('negocioReanalise', this.cfg.prompts), {
          previousReport: JSON.stringify(f.negocio.report, null, 2),
          answers: answers || '(nenhuma)',
          manualPoints: f.negocio.manualPoints.length ? JSON.stringify(f.negocio.manualPoints, null, 2) : '(nenhum)',
          notes: f.negocio.notes.trim() || '(sem notas)'
        })
      }
      const prompt = await this.prompt('negocio', { ...vars, linkedList, reanalysis })
      const out = await this.runClaude(f, f.negocio.report ? 'reanalisar-negocio' : 'refinar-negocio', prompt)
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      const json = await this.readJson(contextPath(f, '01-refinamento-negocio.json'))
      if (!json) throw new Error('O agente terminou, mas 01-refinamento-negocio.json não foi gravado ou é inválido')
      const report = normalizeBusinessReport(json)
      f = await this.d.store.mutate(key, (x) => {
        x.negocio.report = report
        x.negocio.status = 'done'
        x.negocio.lastRunAt = new Date().toISOString()
        // pontos manuais incorporados pelo agente deixam de ser duplicados
        x.negocio.manualPoints = x.negocio.manualPoints.filter((m) => !report.points.some((p) => p.id === m.id))
        for (const p of report.points) {
          if (!x.negocio.answers[p.id]) x.negocio.answers[p.id] = { status: 'aberta', who: '', when: '', text: '' }
        }
      })
      const blocking = report.points.filter((p) => p.blocksDev && f.negocio.answers[p.id]?.status === 'aberta').length
      this.notify(f, `Refinamento de negócio pronto: ${report.points.length} pontos, ${blocking} travam o dev`)
    } catch (err) {
      await this.failStep(key, 'negocio', err)
    } finally {
      release()
    }
  }

  private async failStep(key: string, step: 'negocio' | 'tecnico' | 'spec' | 'dev', err: unknown): Promise<void> {
    const msg = err instanceof Error ? err.message : String(err)
    if (!this.d.store.has(key)) return
    await this.d.store.mutate(key, (x) => {
      x[step].status = 'error'
      x[step].error = msg
    })
    this.notify({ key }, `Erro em ${step}: ${msg}`)
  }

  // ------------------------------------------------------------ 2. técnico

  async runTechnical(key: string): Promise<void> {
    const release = this.guard(key, 'tecnico')
    try {
      const sessionId = randomUUID()
      const f = await this.d.store.mutate(key, (x) => {
        x.tecnico.status = 'running'
        x.tecnico.error = undefined
        x.tecnico.sessionId = sessionId
        if (x.stage === 'negocio') x.stage = 'tecnico'
      })
      const answered = Object.entries(f.tecnico.answers).filter(([, v]) => v.trim())
      const answersSection = answered.length
        ? `## Respostas já dadas pelo desenvolvedor\n\n${answered.map(([id, v]) => `- ${id}: ${v}`).join('\n')}\n\nConsidere-as como verdade.`
        : ''
      const others = this.cfg.repos
        .filter((r) => !f.repos.some((fr) => fr.name === r.name))
        .map((r) => `- ${r.name}: ${expandHome(r.path, this.home())}`)
        .join('\n')
      const prompt = await this.prompt('tecnico', { ...this.baseVars(f), otherRepos: others || '- (nenhum)', answersSection })
      const addDirs = this.cfg.repos.map((r) => expandHome(r.path, this.home()))
      const out = await this.runClaude(f, 'refinar-tecnico', prompt, { sessionId, addDirs })
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      await this.loadTechReport(key)
    } catch (err) {
      await this.failStep(key, 'tecnico', err)
    } finally {
      release()
    }
  }

  private async loadTechReport(key: string): Promise<void> {
    const f = this.get(key)
    const json = await this.readJson(contextPath(f, '02-refinamento-tecnico.json'))
    if (!json) throw new Error('O agente terminou, mas 02-refinamento-tecnico.json não foi gravado ou é inválido')
    const report = normalizeTechReport(json)
    const updated = await this.d.store.mutate(key, (x) => {
      x.tecnico.report = report
      x.tecnico.lastRunAt = new Date().toISOString()
      for (const s of report.subtasks) {
        if (x.tecnico.selectedSubtasks[s.id] === undefined) x.tecnico.selectedSubtasks[s.id] = !s.blockedBy
      }
      const open = report.questions.filter((q) => q.blocking && !x.tecnico.answers[q.id]?.trim())
      x.tecnico.status = open.length ? 'waiting' : 'done'
    })
    const open = report.questions.filter((q) => q.blocking && !updated.tecnico.answers[q.id]?.trim()).length
    this.notify(
      updated,
      open
        ? `Refinamento técnico pausado: ${open} pergunta(s) precisam de você`
        : `Refinamento técnico pronto: ${report.dependencies.length} dependências, ${report.subtasks.length} subtasks`
    )
  }

  async answerTechnical(key: string, answers: Record<string, string>): Promise<void> {
    const release = this.guard(key, 'tecnico')
    try {
      const f = await this.d.store.mutate(key, (x) => {
        x.tecnico.answers = { ...x.tecnico.answers, ...answers }
        x.tecnico.status = 'running'
        x.tecnico.error = undefined
      })
      const text = Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([id, v]) => {
          const q = f.tecnico.report?.questions.find((qq) => qq.id === id)
          return `- ${id}${q ? ` ("${q.question}")` : ''}: ${v.trim()}`
        })
        .join('\n')
      const prompt = await this.prompt('tecnicoRespostas', { ...this.baseVars(f), answers: text || '(sem respostas)' })
      let out: JobOutcome | null = null
      if (f.tecnico.sessionId) {
        out = await this.runClaude(f, 'responder-tecnico', prompt, { resume: f.tecnico.sessionId })
      }
      if (!out || out.status === 'error') {
        // sessão indisponível: refaz a análise completa com as respostas
        release()
        return this.runTechnical(key)
      }
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      await this.loadTechReport(key)
    } catch (err) {
      await this.failStep(key, 'tecnico', err)
    } finally {
      release()
    }
  }

  async createSubtasks(key: string): Promise<void> {
    const release = this.guard(key, 'subtasks')
    try {
      const f = this.get(key)
      const created = new Set(f.tecnico.createdSubtasks.map((c) => c.id))
      const chosen = (f.tecnico.report?.subtasks ?? []).filter((s) => f.tecnico.selectedSubtasks[s.id] && !created.has(s.id))
      if (!chosen.length) throw new Error('Nenhuma subtask selecionada (ou todas já foram criadas)')
      const list = chosen.map((s) => `### ${s.id}\nTítulo: ${s.title}\nDescrição:\n${s.description}`).join('\n\n')
      const prompt = await this.prompt('subtasks', { ...this.baseVars(f), subtasks: list })
      const out = await this.runClaude(f, 'criar-subtasks', prompt, { quick: true })
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      const json = extractJson<{ created?: { id: string; key: string }[]; failed?: { id: string; error: string }[] }>(
        out.claude?.text ?? out.output
      )
      const ok = (json?.created ?? []).filter((c) => c?.id && c?.key)
      await this.d.store.mutate(key, (x) => {
        x.tecnico.createdSubtasks = [...x.tecnico.createdSubtasks, ...ok]
      })
      const failed = json?.failed?.length ?? 0
      this.notify(f, `${ok.length} subtask(s) criada(s) no Jira${failed ? `, ${failed} falharam` : ''}`)
    } catch (err) {
      this.notify({ key }, `Erro ao criar subtasks: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    } finally {
      release()
    }
  }

  // ------------------------------------------------------------ 3. spec

  async generateSpec(key: string): Promise<void> {
    const release = this.guard(key, 'spec')
    try {
      const f = await this.d.store.mutate(key, (x) => {
        x.spec.status = 'running'
        x.spec.error = undefined
        x.spec.approved = false
        if (x.stage === 'negocio' || x.stage === 'tecnico') x.stage = 'spec'
      })
      const out = await this.runKiro(f, 'gerar-spec', await this.prompt('spec', this.baseVars(f)))
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      if (!(await this.d.exec.exists(posix.join(specDir(f), 'tasks.md')))) {
        throw new Error(`O kiro-cli terminou, mas ${specDir(f)}/tasks.md não foi criado`)
      }
      await this.d.store.mutate(key, (x) => {
        x.spec.status = 'done'
        x.spec.lastRunAt = new Date().toISOString()
      })
      this.notify(f, 'Spec gerada pelo kiro-cli: revise e aprove')
    } catch (err) {
      await this.failStep(key, 'spec', err)
    } finally {
      release()
    }
  }

  async specTasks(key: string): Promise<SpecTask[]> {
    const f = this.get(key)
    const md = await this.d.exec.readText(posix.join(specDir(f), 'tasks.md'))
    return md ? parseTasks(md) : []
  }

  async approveSpec(key: string): Promise<void> {
    const f = await this.d.store.mutate(key, (x) => {
      x.spec.approved = true
      x.stage = 'dev'
      x.dev.status = 'idle'
      x.dev.message = undefined
    })
    if (f.spec.executeAfterApprove) this.startDev(key).catch(() => undefined)
  }

  // ------------------------------------------------------------ mudanças na história

  async checkStory(key: string): Promise<void> {
    const release = this.guard(key, 'historia')
    try {
      const f = this.get(key)
      const target = contextPath(f, 'historia-atual.md')
      const prompt = await this.prompt('historia', { ...this.baseVars(f), target })
      const out = await this.runClaude(f, 'verificar-historia', prompt, { quick: true })
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      const current = await this.d.exec.readText(target)
      if (!current) throw new Error('historia-atual.md não foi gravado')
      const baseline = await this.d.exec.readText(contextPath(f, 'historia.md'))
      const now = new Date().toISOString()
      if (!baseline) {
        await this.d.exec.writeText(contextPath(f, 'historia.md'), current)
        await this.d.store.mutate(key, (x) => {
          x.storyCheckedAt = now
        })
        return
      }
      const diff = diffLines(baseline, current)
      const changed = hasChanges(diff)
      await this.d.store.mutate(key, (x) => {
        x.storyCheckedAt = now
        x.drift = changed ? { detectedAt: now, diff: compactDiff(diff) } : undefined
      })
      if (changed) this.notify(f, 'A história mudou no Jira desde o refinamento')
    } finally {
      release()
    }
  }

  async acceptDrift(key: string): Promise<void> {
    const f = this.get(key)
    const current = await this.d.exec.readText(contextPath(f, 'historia-atual.md'))
    if (current) await this.d.exec.writeText(contextPath(f, 'historia.md'), current)
    await this.d.store.mutate(key, (x) => {
      x.drift = undefined
    })
  }

  async updateSpecFromDrift(key: string): Promise<void> {
    const release = this.guard(key, 'spec')
    try {
      const f = await this.d.store.mutate(key, (x) => {
        x.spec.status = 'running'
        x.spec.error = undefined
      })
      if (!f.drift) throw new Error('Nenhuma mudança pendente na história')
      const prompt = await this.prompt('specUpdate', { ...this.baseVars(f), diff: diffToText(f.drift.diff) })
      const out = await this.runKiro(f, 'atualizar-spec', prompt)
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
      await this.d.store.mutate(key, (x) => {
        x.spec.status = 'done'
        x.spec.approved = false
        x.spec.lastRunAt = new Date().toISOString()
        if (x.stage === 'dev' || x.stage === 'pronto') x.stage = 'spec'
      })
      await this.acceptDrift(key)
      this.notify(f, 'Spec atualizada com a mudança da história: revise e aprove de novo')
    } catch (err) {
      await this.failStep(key, 'spec', err)
    } finally {
      release()
    }
  }

  /** Verificação periódica (Configurações › Execução). */
  startStoryWatcher(): void {
    this.timer = setInterval(() => {
      const minutes = this.cfg.execution.storyCheckMinutes
      if (!minutes) return
      for (const f of this.d.store.list()) {
        if (!['spec', 'dev'].includes(f.stage) || f.drift) continue
        const last = f.storyCheckedAt ? Date.parse(f.storyCheckedAt) : 0
        if (Date.now() - last < minutes * 60_000) continue
        this.checkStory(f.key).catch(() => undefined)
      }
    }, 60_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  // ------------------------------------------------------------ 4. desenvolvimento

  async startDev(key: string): Promise<void> {
    const release = this.guard(key, 'dev')
    try {
      await this.d.store.mutate(key, (x) => {
        x.dev.status = 'running'
        x.dev.pauseRequested = false
        x.dev.error = undefined
        x.dev.message = undefined
        if (x.stage !== 'pronto') x.stage = 'dev'
      })
      for (;;) {
        let f = this.get(key)
        const tasks = await this.specTasks(key)
        if (!tasks.length) throw new Error('tasks.md da spec não encontrado ou vazio')
        const pending = pendingTopLevel(tasks)
        if (!pending.length) {
          await this.d.store.mutate(key, (x) => {
            x.dev.status = 'done'
            x.dev.currentTask = undefined
            x.dev.message = 'todas as tarefas concluídas'
            x.stage = 'pronto'
          })
          this.notify(f, 'Todas as tarefas da spec foram concluídas')
          break
        }
        if (f.dev.pauseRequested) {
          await this.pauseWith(key, 'pausado a seu pedido')
          break
        }
        if (this.cfg.execution.pauseOnUserChanges) {
          const dirty: string[] = []
          for (const r of f.repos) {
            for (const line of await this.d.git.dirtyFiles(r.worktree)) dirty.push(`${r.name}: ${line.slice(3)}`)
          }
          if (dirty.length) {
            await this.pauseWith(
              key,
              `há alterações não commitadas (suas?) — commit ou descarte e retome: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? '…' : ''}`
            )
            this.notify(f, 'Execução pausada: há alterações não commitadas no worktree')
            break
          }
        }
        const task = pending[0]
        f = await this.d.store.mutate(key, (x) => {
          x.dev.currentTask = `${task.id}. ${task.title}`
        })
        const commitFormats = f.repos.map((r) => `   - ${r.name}: \`${this.commitFor(f, r)}\``).join('\n')
        const prompt = await this.prompt('task', {
          ...this.baseVars(f),
          taskId: task.id,
          taskTitle: task.title,
          commitFormats
        })
        const out = await this.runKiro(f, `task ${task.id}`, prompt)
        if (out.status === 'cancelled') {
          await this.pauseWith(key, `task ${task.id} cancelada`)
          break
        }
        if (out.status !== 'ok') throw new Error(`task ${task.id}: ${this.failMsg(out)}`)
        const after = (await this.specTasks(key)).find((t) => t.line === task.line || (t.id === task.id && t.depth === 0))
        if (!after?.done) {
          throw new Error(`o kiro-cli terminou a task ${task.id}, mas ela não foi marcada como concluída em tasks.md — confira e retome`)
        }
        if (this.get(key).spec.confirmEachTask) {
          await this.pauseWith(key, `task ${task.id} concluída — aguardando sua confirmação para seguir`)
          this.notify(f, `Task ${task.id} concluída`)
          break
        }
      }
    } catch (err) {
      await this.failStep(key, 'dev', err)
    } finally {
      release()
      if (this.cfg.execution.autoOndeParei && this.d.store.has(key)) this.ondeParei(key).catch(() => undefined)
    }
  }

  private async pauseWith(key: string, message: string): Promise<void> {
    await this.d.store.mutate(key, (x) => {
      x.dev.status = 'waiting'
      x.dev.pauseRequested = false
      x.dev.message = message
    })
  }

  async pauseDev(key: string): Promise<void> {
    await this.d.store.mutate(key, (x) => {
      x.dev.pauseRequested = true
      x.dev.message = 'pausa solicitada: para ao terminar a task atual'
    })
  }

  async ondeParei(key: string): Promise<void> {
    const release = this.guard(key, 'ondeParei')
    try {
      const f = this.get(key)
      const out = await this.runClaude(f, 'onde-parei', await this.prompt('ondeParei', this.baseVars(f)), { quick: true })
      if (out.status !== 'ok') throw new Error(this.failMsg(out))
    } finally {
      release()
    }
  }

  // ------------------------------------------------------------ arquivos e IDE

  async readFeatureFile(key: string, rel: string): Promise<string | null> {
    const f = this.get(key)
    const norm = posix.normalize(rel)
    if (norm.startsWith('..') || posix.isAbsolute(norm)) throw new Error('Caminho inválido')
    return this.d.exec.readText(posix.join(f.dir, norm))
  }

  async openInIde(key: string): Promise<void> {
    const f = this.get(key)
    const ws = workspaceFile(f)
    if (!(await this.d.exec.exists(ws))) await this.writeWorkspaceFiles(f)
    const vars: Record<string, string> = {
      workspace: ws,
      workspaceHost: this.d.exec.host(ws),
      dir: f.dir,
      dirHost: this.d.exec.host(f.dir),
      distro: this.d.exec.env.distro
    }
    const cmd = buildOpenCommand(this.cfg.ide.openCommand, vars)
    if (this.cfg.ide.runIn === 'wsl') {
      const r = await this.d.exec.runScript(`${cmd} >/dev/null 2>&1 &\ndisown 2>/dev/null; true`, 30_000)
      if (r.code !== 0) throw new Error(r.stderr || `falhou: ${cmd}`)
      return
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', reject)
      child.on('spawn', () => {
        child.unref()
        resolve()
      })
    })
  }

  async openFolder(key: string): Promise<void> {
    await this.d.openPath(this.d.exec.host(this.get(key).dir))
  }
}
