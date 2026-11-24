import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppConfig, Feature, Job, Stage } from '@shared/types'

export const api = window.api

export type Route = { view: 'board' } | { view: 'new' } | { view: 'settings' } | { view: 'feature'; key: string; tab: Stage }

interface AppState {
  features: Feature[]
  jobs: Job[]
  config: AppConfig | null
  setConfig: (c: AppConfig) => void
  route: Route
  go: (r: Route) => void
  toast: (msg: string, kind?: 'error' | 'info') => void
  /** Executa uma ação da API mostrando erro como toast. */
  act: <T>(fn: () => Promise<T>, okMsg?: string) => Promise<T | undefined>
  /** Como `act`, mas devolve se deu certo. */
  attempt: (fn: () => Promise<unknown>, okMsg?: string) => Promise<boolean>
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [features, setFeatures] = useState<Feature[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [route, setRoute] = useState<Route>({ view: 'board' })
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'error' | 'info' } | null>(null)

  useEffect(() => {
    void api.listFeatures().then(setFeatures)
    void api.listJobs().then(setJobs)
    void api.getConfig().then(setConfig)
    const off1 = api.onFeatures(setFeatures)
    const off2 = api.onJobs((j) => setJobs([...j]))
    return () => {
      off1()
      off2()
    }
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), toastMsg.kind === 'error' ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [toastMsg])

  const toast = useCallback((msg: string, kind: 'error' | 'info' = 'error') => setToastMsg({ msg, kind }), [])

  const act = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      try {
        const r = await fn()
        if (okMsg) toast(okMsg, 'info')
        return r
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        return undefined
      }
    },
    [toast]
  )

  const attempt = useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string): Promise<boolean> => {
      let ok = false
      await act(async () => {
        await fn()
        ok = true
      }, okMsg)
      return ok
    },
    [act]
  )

  const value = useMemo(
    () => ({ features, jobs, config, setConfig, route, go: setRoute, toast, act, attempt }),
    [features, jobs, config, route, toast, act, attempt]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && (
        <div className={`toast ${toastMsg.kind === 'info' ? 'info' : ''}`} role="status" onClick={() => setToastMsg(null)}>
          {toastMsg.msg}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppProvider ausente')
  return v
}

// ------------------------------------------------------------ estado derivado

export type Tone = 'run' | 'warn' | 'err' | 'ok' | 'mu'

export interface FeatureState {
  tone: Tone
  label: string
  detail: string
}

export function openBlockingPoints(f: Feature): number {
  const pts = [...(f.negocio.report?.points ?? []), ...f.negocio.manualPoints]
  return pts.filter((p) => p.blocksDev && (f.negocio.answers[p.id]?.status ?? 'aberta') === 'aberta').length
}

export function openQuestions(f: Feature): number {
  return (f.tecnico.report?.questions ?? []).filter((q) => q.blocking && !f.tecnico.answers[q.id]?.trim()).length
}

export function featureState(f: Feature, jobs: Job[]): FeatureState {
  const running = jobs.find((j) => j.featureKey === f.key && j.status === 'running')
  if (running) return { tone: 'run', label: 'rodando', detail: `${running.engine} · ${running.activity}` }
  if (f.drift) return { tone: 'err', label: 'história mudou', detail: 'a história mudou no Jira' }
  const step = f.stage === 'pronto' ? null : f[f.stage]
  if (step?.status === 'error') return { tone: 'err', label: 'erro', detail: step.error ?? '' }
  switch (f.stage) {
    case 'negocio': {
      if (!f.negocio.report) return { tone: 'mu', label: 'não iniciado', detail: 'refinamento de negócio pendente' }
      const b = openBlockingPoints(f)
      return b
        ? { tone: 'warn', label: 'aguardando você', detail: `${b} ponto(s) travam o dev` }
        : { tone: 'ok', label: 'pronto', detail: 'pode seguir para o técnico' }
    }
    case 'tecnico': {
      const q = openQuestions(f)
      if (q) return { tone: 'warn', label: 'aguardando você', detail: `${q} pergunta(s) do agente` }
      if (!f.tecnico.report) return { tone: 'mu', label: 'não iniciado', detail: '' }
      return { tone: 'ok', label: 'pronto', detail: `${f.tecnico.report.subtasks.length} subtasks` }
    }
    case 'spec':
      if (f.spec.status === 'done' && !f.spec.approved) return { tone: 'warn', label: 'aguardando você', detail: 'revise e aprove a spec' }
      return { tone: 'mu', label: f.spec.status === 'idle' ? 'não iniciado' : f.spec.status, detail: '' }
    case 'dev':
      if (f.dev.status === 'waiting') return { tone: 'warn', label: 'pausado', detail: f.dev.message ?? '' }
      return { tone: 'mu', label: f.dev.status === 'idle' ? 'parado' : f.dev.status, detail: f.dev.currentTask ?? '' }
    case 'pronto':
      return { tone: 'ok', label: 'pronto p/ PR', detail: 'todas as tasks concluídas' }
  }
}

export const toneColor: Record<Tone, string> = {
  run: 'var(--accent)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  ok: 'var(--ok)',
  mu: 'var(--muted)'
}

export function since(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function duration(job: Job): string {
  const end = job.endedAt ? Date.parse(job.endedAt) : Date.now()
  const s = Math.max(0, Math.round((end - Date.parse(job.startedAt)) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
