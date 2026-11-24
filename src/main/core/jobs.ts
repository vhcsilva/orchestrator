import { promises as fs, createWriteStream, type WriteStream } from 'node:fs'
import { join, posix } from 'node:path'
import type { Engine, Job, JobLogLine, JobStatus } from '@shared/types'
import type { Executor } from './executor'
import { argvToShell, q } from './shell'
import { parseClaudeLine, parseKiroLine, stripAnsi, type ClaudeResult, type ParsedEvent } from './streamJson'

export interface StartJobOptions {
  featureKey: string
  kind: string
  engine: Engine
  /** Diretório Linux onde o comando roda. */
  cwd: string
  argv: string[]
  /** Enviado pelo stdin do comando (prompt). */
  prompt?: string
  parser: 'claude' | 'kiro' | 'plain'
  activity?: string
}

export interface JobOutcome {
  job: Job
  status: JobStatus
  exitCode: number
  claude?: ClaudeResult
  /** Texto completo (stdout) — útil para saídas não-JSON. */
  output: string
}

const MAX_LINES = 4000
const MAX_JOBS = 300

type Listener<T> = (v: T) => void

interface Running {
  child: ReturnType<Executor['spawnScript']>
  pidFile: string
  cancelled: boolean
}

export class JobManager {
  private jobs: Job[] = []
  private logs = new Map<number, JobLogLine[]>()
  private running = new Map<number, Running>()
  private nextId = 1
  private jobsListeners: Listener<Job[]>[] = []
  private logListeners: Listener<JobLogLine>[] = []

  constructor(
    private exec: Executor,
    private dataDir: string
  ) {}

  private get file(): string {
    return join(this.dataDir, 'jobs.json')
  }

  private logFile(id: number): string {
    return join(this.dataDir, 'jobs', `${id}.log`)
  }

  async load(): Promise<void> {
    try {
      const saved = JSON.parse(await fs.readFile(this.file, 'utf8')) as { nextId: number; jobs: Job[] }
      this.nextId = saved.nextId || 1
      this.jobs = (saved.jobs || []).map((j) =>
        j.status === 'running'
          ? { ...j, status: 'error' as const, error: 'interrompido: o app foi fechado', endedAt: j.endedAt ?? j.startedAt }
          : j
      )
    } catch {
      this.jobs = []
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.writeFile(this.file, JSON.stringify({ nextId: this.nextId, jobs: this.jobs.slice(0, MAX_JOBS) }, null, 2))
  }

  list(): Job[] {
    return this.jobs
  }

  get(id: number): Job | undefined {
    return this.jobs.find((j) => j.id === id)
  }

  runningFor(featureKey: string): Job[] {
    return this.jobs.filter((j) => j.featureKey === featureKey && j.status === 'running')
  }

  onJobs(cb: Listener<Job[]>): void {
    this.jobsListeners.push(cb)
  }

  onLog(cb: Listener<JobLogLine>): void {
    this.logListeners.push(cb)
  }

  private emitJobs(): void {
    for (const l of this.jobsListeners) l(this.jobs)
    void this.persist()
  }

  private update(id: number, patch: Partial<Job>): Job {
    const idx = this.jobs.findIndex((j) => j.id === id)
    this.jobs[idx] = { ...this.jobs[idx], ...patch }
    this.emitJobs()
    return this.jobs[idx]
  }

  async log(id: number): Promise<JobLogLine[]> {
    const mem = this.logs.get(id)
    if (mem) return mem
    try {
      const raw = await fs.readFile(this.logFile(id), 'utf8')
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as JobLogLine)
    } catch {
      return []
    }
  }

  private pushLog(id: number, text: string, stream: JobLogLine['stream'], file: WriteStream): void {
    for (const t of text.split('\n')) {
      if (!t.trim()) continue
      const line: JobLogLine = { jobId: id, at: new Date().toISOString(), text: t, stream }
      const arr = this.logs.get(id) ?? []
      arr.push(line)
      if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES)
      this.logs.set(id, arr)
      file.write(JSON.stringify(line) + '\n')
      for (const l of this.logListeners) l(line)
    }
  }

  /** Registra uma tarefa que não executa comando (ex.: git feito pelo app). */
  async record(featureKey: string, kind: string, engine: Engine, fn: (log: (t: string) => void) => Promise<string | void>): Promise<void> {
    const job = this.create({ featureKey, kind, engine, activity: kind })
    await fs.mkdir(join(this.dataDir, 'jobs'), { recursive: true })
    const file = createWriteStream(this.logFile(job.id), { flags: 'a' })
    try {
      const summary = await fn((t) => {
        this.pushLog(job.id, t, 'info', file)
        this.update(job.id, { activity: t.slice(0, 160) })
      })
      this.update(job.id, { status: 'ok', endedAt: new Date().toISOString(), activity: summary || 'concluído' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.pushLog(job.id, msg, 'err', file)
      this.update(job.id, { status: 'error', endedAt: new Date().toISOString(), error: msg, activity: msg.slice(0, 160) })
      throw err
    } finally {
      file.end()
    }
  }

  private create(o: { featureKey: string; kind: string; engine: Engine; activity?: string }): Job {
    const job: Job = {
      id: this.nextId++,
      featureKey: o.featureKey,
      kind: o.kind,
      engine: o.engine,
      status: 'running',
      startedAt: new Date().toISOString(),
      activity: o.activity ?? 'iniciando'
    }
    this.jobs.unshift(job)
    this.emitJobs()
    return job
  }

  async start(opts: StartJobOptions): Promise<JobOutcome> {
    const job = this.create(opts)
    const runDir = posix.join(this.exec.env.home || '/tmp', '.orquestrador', 'runs')
    const pidFile = posix.join(runDir, `${job.id}.pid`)
    const promptFile = posix.join(runDir, `${job.id}.prompt.md`)
    await fs.mkdir(join(this.dataDir, 'jobs'), { recursive: true })
    const file = createWriteStream(this.logFile(job.id), { flags: 'a' })

    try {
      await this.exec.mkdir(runDir)
      if (opts.prompt !== undefined) await this.exec.writeText(promptFile, opts.prompt)
    } catch (err) {
      const msg = `não foi possível preparar a execução: ${String(err)}`
      this.pushLog(job.id, msg, 'err', file)
      file.end()
      const done = this.update(job.id, { status: 'error', error: msg, endedAt: new Date().toISOString(), activity: msg })
      return { job: done, status: 'error', exitCode: -1, output: '' }
    }

    const script = [
      `echo $$ > ${q(pidFile)}`,
      `cd ${q(opts.cwd)} || { echo "diretório não encontrado: ${opts.cwd.replace(/"/g, '')}" >&2; exit 97; }`,
      `${argvToShell(opts.argv)}${opts.prompt !== undefined ? ` < ${q(promptFile)}` : ' < /dev/null'}`
    ].join('\n')

    this.pushLog(job.id, `$ ${argvToShell(opts.argv)}`, 'info', file)
    this.pushLog(job.id, `cwd ${opts.cwd}`, 'info', file)

    const parse = (l: string): ParsedEvent =>
      opts.parser === 'claude' ? parseClaudeLine(l) : opts.parser === 'kiro' ? parseKiroLine(l) : { log: stripAnsi(l) }

    return new Promise<JobOutcome>((resolve) => {
      let child: Running['child']
      try {
        child = this.exec.spawnScript(script)
      } catch (err) {
        const msg = String(err)
        this.pushLog(job.id, msg, 'err', file)
        file.end()
        const done = this.update(job.id, { status: 'error', error: msg, endedAt: new Date().toISOString() })
        resolve({ job: done, status: 'error', exitCode: -1, output: '' })
        return
      }
      const state: Running = { child, pidFile, cancelled: false }
      this.running.set(job.id, state)
      let output = ''
      let buffer = ''
      let errBuffer = ''
      let claude: ClaudeResult | undefined
      let lastActivityAt = 0

      const handleLine = (line: string): void => {
        output += line + '\n'
        const ev = parse(line)
        if (ev.log) this.pushLog(job.id, ev.log, 'out', file)
        if (ev.result) claude = ev.result
        const patch: Partial<Job> = {}
        if (ev.sessionId) patch.sessionId = ev.sessionId
        if (ev.result?.costUsd !== undefined) patch.costUsd = ev.result.costUsd
        const now = Date.now()
        if (ev.activity && (now - lastActivityAt > 400 || ev.result)) {
          patch.activity = ev.activity
          lastActivityAt = now
        }
        if (Object.keys(patch).length) this.update(job.id, patch)
      }

      child.stdout.on('data', (d: Buffer) => {
        buffer += d.toString()
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          handleLine(buffer.slice(0, idx).replace(/\r$/, ''))
          buffer = buffer.slice(idx + 1)
        }
      })
      child.stderr.on('data', (d: Buffer) => {
        errBuffer += d.toString().replace(/\u0000/g, '')
        let idx: number
        while ((idx = errBuffer.indexOf('\n')) >= 0) {
          const l = stripAnsi(errBuffer.slice(0, idx))
          errBuffer = errBuffer.slice(idx + 1)
          if (l.trim()) this.pushLog(job.id, l, 'err', file)
        }
      })
      const finish = (code: number, spawnError?: string): void => {
        if (buffer.trim()) handleLine(buffer)
        if (errBuffer.trim()) this.pushLog(job.id, stripAnsi(errBuffer), 'err', file)
        this.running.delete(job.id)
        let status: JobStatus = code === 0 ? 'ok' : 'error'
        if (claude?.isError) status = 'error'
        if (state.cancelled) status = 'cancelled'
        const error =
          status === 'error'
            ? (spawnError ?? (claude?.isError ? claude.text || 'o Claude Code retornou erro' : `saiu com código ${code}`))
            : undefined
        if (error) this.pushLog(job.id, error, 'err', file)
        file.end()
        const done = this.update(job.id, {
          status,
          error,
          endedAt: new Date().toISOString(),
          activity:
            status === 'ok'
              ? (this.get(job.id)?.activity ?? 'concluído')
              : status === 'cancelled'
                ? 'cancelado'
                : (error ?? 'falhou').slice(0, 160)
        })
        resolve({ job: done, status, exitCode: code, claude, output })
      }
      child.on('error', (err) => finish(-1, `falha ao iniciar: ${err.message}`))
      child.on('close', (code) => finish(code ?? -1))
    })
  }

  async cancel(id: number): Promise<void> {
    const r = this.running.get(id)
    if (!r) return
    r.cancelled = true
    const pid = Number((await this.exec.readText(r.pidFile))?.trim())
    if (pid > 0) await this.exec.killTree(pid)
    r.child.kill()
  }

  async cancelFeature(featureKey: string): Promise<void> {
    for (const j of this.runningFor(featureKey)) await this.cancel(j.id)
  }
}
