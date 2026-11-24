import { useEffect, useState } from 'react'
import type { Feature, SpecTask } from '@shared/types'
import { RunningBox, Spinner, Tag } from '../components/ui'
import { lastJob, useFeatureFile } from '../hooks'
import { api, useApp } from '../state'
import { ErrorBox } from './BusinessTab'

export function DevTab({ f }: { f: Feature }): React.JSX.Element {
  const { jobs, act, config, go } = useApp()
  const job = lastJob(jobs, f.key, [/^task /])
  const running = f.dev.status === 'running'
  const [tasks, setTasks] = useState<SpecTask[]>([])
  const version = `${job?.id}|${job?.status}|${f.updatedAt}`

  useEffect(() => {
    let alive = true
    const load = (): void => {
      void api.specTasks(f.key).then((t) => alive && setTasks(t))
    }
    load()
    const t = running ? setInterval(load, 4000) : undefined
    return () => {
      alive = false
      if (t) clearInterval(t)
    }
  }, [f.key, version, running])

  const top = tasks.filter((t) => t.depth === 0)
  const done = top.filter((t) => t.done).length
  const note = useFeatureFile(f.key, 'contexto/onde-parei.md', lastJob(jobs, f.key, ['onde-parei'])?.endedAt)

  if (!f.spec.approved) {
    return (
      <div className="empty stack" style={{ alignItems: 'center' }}>
        <div>A execução começa depois que a spec for aprovada.</div>
        <button className="btn" onClick={() => go({ view: 'feature', key: f.key, tab: 'spec' })}>
          Ir para a spec
        </button>
      </div>
    )
  }

  return (
    <>
      {f.dev.status === 'error' && <ErrorBox msg={f.dev.error} />}
      {f.dev.status === 'waiting' && f.dev.message && (
        <section className="pn attention">
          <div className="ph">
            <Tag tone="warn">pausado</Tag>
            <span style={{ fontWeight: 400 }}>{f.dev.message}</span>
          </div>
        </section>
      )}
      <div className="cols">
        <div className="col-main">
          <section className="pn">
            <div className="ph">
              <span className="m">tasks.md</span>
              <span className="mu" style={{ fontWeight: 400 }}>
                {done}/{top.length} concluídas
              </span>
              <div className="spacer hstack">
                {running ? (
                  <button className="btn" disabled={f.dev.pauseRequested} onClick={() => void act(() => api.pauseDev(f.key))}>
                    {f.dev.pauseRequested ? 'Pausa solicitada…' : 'Pausar após a task atual'}
                  </button>
                ) : done === top.length && top.length > 0 ? (
                  <span className="ok small">todas concluídas</span>
                ) : (
                  <button className="btn primary" onClick={() => void act(() => api.startDev(f.key))}>
                    {f.dev.status === 'idle' ? 'Iniciar execução' : 'Retomar execução'}
                  </button>
                )}
              </div>
            </div>
            <div style={{ padding: '4px 0' }}>
              {tasks.length === 0 && <div className="pb mu">tasks.md não encontrado.</div>}
              {tasks.map((t) => {
                const current = running && f.dev.currentTask?.startsWith(`${t.id}.`) && t.depth === 0
                return (
                  <div
                    key={t.line}
                    className="m"
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      minHeight: 28,
                      padding: `2px 12px 2px ${12 + t.depth * 22}px`,
                      fontSize: 12,
                      background: current ? '#1f2738' : undefined,
                      boxShadow: current ? 'inset 2px 0 var(--accent)' : undefined,
                      color: t.done ? undefined : current ? '#fff' : 'var(--muted)'
                    }}
                  >
                    <span style={{ color: t.done ? 'var(--ok)' : current ? 'var(--accent)' : undefined }}>
                      {t.done ? '[x]' : current || t.inProgress ? '[~]' : '[ ]'}
                    </span>
                    <span style={{ flex: 1 }}>
                      {t.id}. {t.title}
                    </span>
                    {current && <Spinner />}
                  </div>
                )
              })}
            </div>
          </section>
          {job && <RunningBox job={job} />}
        </div>

        <aside className="col-side">
          <section className="pn">
            <div className="ph">
              Workspace
              <button className="btn spacer" onClick={() => void act(() => api.openInIde(f.key))}>
                Abrir no Kiro
              </button>
            </div>
            <div className="m pb stack" style={{ fontSize: 12 }}>
              <div className="mu" style={{ wordBreak: 'break-all' }}>
                {f.dir}/{f.key}.code-workspace
              </div>
              {f.repos.map((r) => (
                <div key={r.name}>
                  <div>{r.name}</div>
                  <div style={{ color: 'var(--link)', wordBreak: 'break-all' }}>{r.branch}</div>
                  <div className="mu small">base {r.base}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="pn">
            <div className="ph">IDE e CLI no mesmo worktree</div>
            <div className="pb stack small">
              <div>
                {config?.execution.pauseOnUserChanges ? (
                  <>Antes de cada task, se houver alterações não commitadas (suas, pela IDE), a execução pausa.</>
                ) : (
                  <>A verificação de alterações suas está desligada.</>
                )}{' '}
                <a onClick={() => go({ view: 'settings' })}>Configurar</a>
              </div>
            </div>
          </section>

          <section className="pn">
            <div className="ph">
              <span className="m">onde-parei.md</span>
              <button className="btn spacer" onClick={() => void act(() => api.ondeParei(f.key))}>
                Atualizar
              </button>
            </div>
            <div className="pb" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)' }}>
              {note.text ?? <span className="mu">Ainda não gerado.</span>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
