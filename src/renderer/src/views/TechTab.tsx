import { useState } from 'react'
import type { Feature } from '@shared/types'
import { CodeView, RunningBox, Spinner, Tag } from '../components/ui'
import { lastJob, useFeatureFile } from '../hooks'
import { api, useApp, type Tone } from '../state'
import { ErrorBox } from './BusinessTab'

const confTone: Record<string, Tone> = { alta: 'ok', media: 'warn', baixa: 'err' }
const SKIP = 'Sem resposta por enquanto: registre como pendência em aberto e siga sem bloquear.'

export function TechTab({ f }: { f: Feature }): React.JSX.Element {
  const { jobs, act, go } = useApp()
  const job = lastJob(jobs, f.key, ['refinar-tecnico', 'responder-tecnico'])
  const subJob = lastJob(jobs, f.key, ['criar-subtasks'])
  const running = f.tecnico.status === 'running' || job?.status === 'running'
  const creating = subJob?.status === 'running'
  // rascunhos ficam só na tela; vão para o agente ao clicar em "Responder e continuar"
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showMd, setShowMd] = useState(false)
  const md = useFeatureFile(f.key, showMd ? 'contexto/02-refinamento-tecnico.md' : null, f.tecnico.lastRunAt)
  const r = f.tecnico.report

  if (!r && !running) {
    return (
      <>
        {f.tecnico.status === 'error' && <ErrorBox msg={f.tecnico.error} />}
        {job && <RunningBox job={job} />}
        <div className="empty stack" style={{ alignItems: 'center' }}>
          <div>
            O Claude Code vai ler a história, o refinamento de negócio, o código dos worktrees e os CODEOWNERS para achar dependências com
            outros serviços/squads e dividir o trabalho em subtasks. Quando tiver dúvida, ele pausa e pergunta.
          </div>
          <button className="btn primary" onClick={() => void act(() => api.runTechnical(f.key))}>
            Iniciar refinamento técnico
          </button>
        </div>
      </>
    )
  }

  const questions = r?.questions ?? []
  const pendingQ = questions.filter((q) => !(f.tecnico.answers[q.id] ?? '').trim())
  const created = new Map(f.tecnico.createdSubtasks.map((c) => [c.id, c.key]))
  const selectedCount = (r?.subtasks ?? []).filter((s) => f.tecnico.selectedSubtasks[s.id] && !created.has(s.id)).length

  const respond = (): void => {
    const toSend = Object.fromEntries(questions.map((q) => [q.id, answers[q.id] ?? '']).filter(([, v]) => v.trim()))
    if (!Object.keys(toSend).length) return
    void act(() => api.answerTechnical(f.key, toSend)).then(() => setAnswers({}))
  }

  return (
    <>
      {f.tecnico.status === 'error' && <ErrorBox msg={f.tecnico.error} />}
      {job && (running || job.status !== 'ok') && <RunningBox job={job} />}

      {pendingQ.length > 0 && !running && (
        <section className="pn attention">
          <div className="ph">
            <Tag tone="warn">perguntas do agente</Tag>
            <span className="mu" style={{ fontWeight: 400 }}>
              o agente não encontrou a resposta na história, no design, no código nem no CODEOWNERS
            </span>
          </div>
          <div className="pb stack" style={{ gap: 14 }}>
            {pendingQ.map((q) => (
              <div key={q.id} className="stack">
                <div style={{ lineHeight: 1.6 }}>
                  <span className="m mu">{q.id}</span> {q.blocking && <Tag tone="err">bloqueia</Tag>} {q.question}
                </div>
                {q.context && <div className="mu small">{q.context}</div>}
                <label className="lb">
                  Sua resposta
                  <textarea
                    className="in"
                    rows={2}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </label>
                <div>
                  <a className="small" onClick={() => setAnswers({ ...answers, [q.id]: SKIP })}>
                    Não sei · registrar como pendência e seguir
                  </a>
                </div>
              </div>
            ))}
            <div>
              <button className="btn primary" onClick={respond}>
                Responder e continuar
              </button>
            </div>
          </div>
        </section>
      )}

      {r && (
        <div className="cols">
          <div className="col-main" style={{ flex: '1 1 520px' }}>
            {r.summary && (
              <section className="pn">
                <div className="ph">Resumo</div>
                <div className="pb" style={{ lineHeight: 1.6 }}>
                  {r.summary}
                </div>
              </section>
            )}
            <section className="pn">
              <div className="ph">Dependências</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="t" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th className="hd">Dado / necessidade</th>
                      <th className="hd">Origem provável</th>
                      <th className="hd">Dono</th>
                      <th className="hd">Confiança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.dependencies.length === 0 && (
                      <tr>
                        <td colSpan={4} className="mu">
                          Nenhuma dependência externa identificada.
                        </td>
                      </tr>
                    )}
                    {r.dependencies.map((d, i) => (
                      <tr key={i} title={d.notes}>
                        <td>{d.need}</td>
                        <td className="m">{d.origin}</td>
                        <td className="m">{d.owner || <span className="mu">—</span>}</td>
                        <td>
                          <Tag tone={confTone[d.confidence] ?? 'mu'}>{d.confidence}</Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {questions.length > pendingQ.length && (
              <section className="pn">
                <div className="ph">Perguntas respondidas</div>
                <div className="pb stack small">
                  {questions
                    .filter((q) => !pendingQ.includes(q))
                    .map((q) => (
                      <div key={q.id}>
                        <span className="m mu">{q.id}</span> {q.question}
                        <div className="mu">→ {f.tecnico.answers[q.id]}</div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>

          <section className="pn" style={{ flex: '1 1 440px', minWidth: 0 }}>
            <div className="ph">
              Subtasks em rascunho
              <span className="mu" style={{ fontWeight: 400 }}>
                só título e descrição vão para o Jira
              </span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {r.subtasks.map((s) => {
                const key = created.get(s.id)
                return (
                  <label
                    key={s.id}
                    className="check"
                    style={{ padding: '8px 12px', color: s.blockedBy && !key ? 'var(--muted)' : undefined }}
                  >
                    <input
                      type="checkbox"
                      disabled={!!key}
                      checked={!!key || !!f.tecnico.selectedSubtasks[s.id]}
                      onChange={(e) =>
                        void act(() =>
                          api.updateFeature(f.key, {
                            tecnico: { selectedSubtasks: { ...f.tecnico.selectedSubtasks, [s.id]: e.target.checked } }
                          })
                        )
                      }
                    />
                    <span>
                      <span style={{ fontWeight: 500 }}>{s.title}</span> {key && <Tag tone="ok">{key}</Tag>}{' '}
                      {s.blockedBy && !key && <Tag tone="warn">aguarda {s.blockedBy}</Tag>}
                      <br />
                      <span className="mu" style={{ whiteSpace: 'pre-wrap' }}>
                        {s.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="hstack" style={{ padding: '10px 12px', borderTop: '1px solid var(--border-soft)' }}>
              <button
                className="btn primary"
                disabled={!selectedCount || creating || running}
                onClick={() => {
                  if (window.confirm(`Criar ${selectedCount} subtask(s) em ${f.key} no Jira?`)) void act(() => api.createSubtasks(f.key))
                }}
              >
                {creating ? <Spinner /> : null} Criar {selectedCount} subtask(s) no Jira
              </button>
              {subJob?.status === 'error' && <span className="err small">{subJob.error}</span>}
            </div>
          </section>
        </div>
      )}

      <div className="hstack">
        <button className="btn" disabled={running} onClick={() => void act(() => api.runTechnical(f.key))}>
          Refazer análise técnica
        </button>
        <button className="btn" onClick={() => setShowMd(!showMd)}>
          {showMd ? 'Ocultar' : 'Ver'} 02-refinamento-tecnico.md
        </button>
        <button
          className="btn primary spacer"
          disabled={running}
          onClick={async () => {
            await act(() => api.generateSpec(f.key))
            go({ view: 'feature', key: f.key, tab: 'spec' })
          }}
        >
          Gerar spec com kiro-cli
        </button>
      </div>
      {showMd && (
        <section className="pn">
          <div className="ph m">contexto/02-refinamento-tecnico.md</div>
          {md.text ? <CodeView text={md.text} /> : <div className="pb mu">{md.loading ? 'carregando…' : 'arquivo não encontrado'}</div>}
        </section>
      )}
    </>
  )
}
