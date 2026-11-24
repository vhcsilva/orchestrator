import { useState } from 'react'
import type { Feature } from '@shared/types'
import { CodeView, RunningBox, Spinner } from '../components/ui'
import { lastJob, useFeatureFile } from '../hooks'
import { api, useApp } from '../state'
import { ErrorBox } from './BusinessTab'
import { traceability } from '@shared/trace'

const FILES = ['requirements.md', 'design.md', 'tasks.md'] as const

export function SpecTab({ f }: { f: Feature }): React.JSX.Element {
  const { jobs, act, go } = useApp()
  const job = lastJob(jobs, f.key, ['gerar-spec', 'atualizar-spec'])
  const running = f.spec.status === 'running' || job?.status === 'running'
  const [file, setFile] = useState<(typeof FILES)[number]>('requirements.md')
  const base = `.kiro/specs/${f.spec.name}`
  const version = `${f.spec.lastRunAt}|${job?.status}|${job?.endedAt}`
  const doc = useFeatureFile(f.key, `${base}/${file}`, version)
  const tasks = useFeatureFile(f.key, `${base}/tasks.md`, version)
  const exists = tasks.text !== null

  if (!exists && !running && f.spec.status !== 'done') {
    return (
      <>
        {f.spec.status === 'error' && <ErrorBox msg={f.spec.error} />}
        {job && <RunningBox job={job} />}
        <div className="empty stack" style={{ alignItems: 'center' }}>
          <div>
            O kiro-cli vai criar <span className="m">{base}/</span> (requirements, design e tasks) a partir da história e dos refinamentos.
          </div>
          <button className="btn primary" onClick={() => void act(() => api.generateSpec(f.key))}>
            Gerar spec com kiro-cli
          </button>
        </div>
      </>
    )
  }

  const trace = tasks.text ? traceability(tasks.text) : []

  return (
    <>
      {f.spec.status === 'error' && <ErrorBox msg={f.spec.error} />}
      {job && (running || job.status !== 'ok') && <RunningBox job={job} />}
      <div className="cols">
        <section className="pn col-main" style={{ gap: 0, overflow: 'hidden' }}>
          <div role="tablist" className="tabs">
            {FILES.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={file === name}
                className={`tab m ${file === name ? 'act' : ''}`}
                onClick={() => setFile(name)}
              >
                {name}
              </button>
            ))}
            <button className="tab spacer" style={{ borderLeft: '1px solid var(--border)', borderRight: 0 }} onClick={() => doc.reload()}>
              recarregar
            </button>
          </div>
          <div className="m mu small" style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-soft)' }}>
            {f.dir}/{base}/{file}
          </div>
          {doc.text !== null ? (
            <CodeView text={doc.text} />
          ) : (
            <div className="pb mu">{doc.loading || running ? 'aguardando o kiro-cli…' : 'arquivo não encontrado'}</div>
          )}
        </section>

        <aside className="col-side">
          <section className="pn">
            <div className="ph">Rastreabilidade</div>
            {trace.length ? (
              <div
                className="m"
                style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 12, padding: '10px 12px' }}
              >
                {trace.map((t) => (
                  <div key={t.req} style={{ display: 'contents' }}>
                    <span className="mu">req {t.req}</span>
                    <span>tasks {t.tasks.join(', ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pb mu small">As tarefas não citam requisitos (linhas “_Requisitos: 1.1_”).</div>
            )}
          </section>

          <section className="pn">
            <div className="ph">Aprovação</div>
            <div className="pb stack">
              <label className="check">
                <input
                  type="checkbox"
                  checked={f.spec.executeAfterApprove}
                  onChange={(e) => void act(() => api.updateFeature(f.key, { spec: { executeAfterApprove: e.target.checked } }))}
                />
                Executar tasks no kiro-cli após aprovar
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={f.spec.confirmEachTask}
                  onChange={(e) => void act(() => api.updateFeature(f.key, { spec: { confirmEachTask: e.target.checked } }))}
                />
                Pausar e pedir confirmação a cada task
              </label>
              <button
                className="btn primary"
                disabled={running || !!f.drift || !exists}
                onClick={async () => {
                  await act(() => api.approveSpec(f.key))
                  go({ view: 'feature', key: f.key, tab: 'dev' })
                }}
              >
                {f.spec.approved ? 'Spec aprovada — ir para dev' : 'Aprovar spec'}
              </button>
              {f.drift && <span className="warn small">Resolva a mudança da história antes de aprovar.</span>}
              <span className="mu small">Você também pode editar os arquivos da spec no Kiro antes de aprovar.</span>
            </div>
          </section>

          <section className="pn">
            <div className="ph">Outras ações</div>
            <div className="pb stack">
              <button
                className="btn"
                disabled={running}
                onClick={() => {
                  if (window.confirm('Gerar a spec de novo? O kiro-cli vai reescrever os arquivos.'))
                    void act(() => api.generateSpec(f.key))
                }}
              >
                {running ? <Spinner /> : null} Gerar spec de novo
              </button>
              <button className="btn" onClick={() => void act(() => api.openInIde(f.key))}>
                Editar no Kiro
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
