import { useState } from 'react'
import type { BusinessPoint, Feature, PointAnswer, PointKind } from '@shared/types'
import { CodeView, RunningBox, Spinner, Tag } from '../components/ui'
import { lastJob, useDebouncedSave, useFeatureFile } from '../hooks'
import { api, openBlockingPoints, useApp, type Tone } from '../state'

const WHO = ['PM', 'Design', 'Tech lead', 'QA', 'Outro']
const EMPTY: PointAnswer = { status: 'aberta', who: '', when: '', text: '' }
const sevTone: Record<BusinessPoint['severity'], Tone> = { alta: 'err', media: 'warn', baixa: 'mu' }
const statusTone: Record<PointAnswer['status'], Tone> = { aberta: 'warn', respondida: 'ok', descartada: 'mu' }

type Filter = 'all' | 'open' | 'blocking'

export function BusinessTab({ f }: { f: Feature }): React.JSX.Element {
  const { jobs, act, go } = useApp()
  const job = lastJob(jobs, f.key, ['refinar-negocio', 'reanalisar-negocio'])
  const running = f.negocio.status === 'running' || job?.status === 'running'
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [showMd, setShowMd] = useState(false)
  const md = useFeatureFile(f.key, showMd ? 'contexto/01-refinamento-negocio.md' : null, f.negocio.lastRunAt)

  const [answers, setAnswers] = useDebouncedSave(
    f.negocio.answers,
    (a) => void act(() => api.updateFeature(f.key, { negocio: { answers: a } }))
  )
  const [notes, setNotes] = useDebouncedSave(f.negocio.notes, (n) => void act(() => api.updateFeature(f.key, { negocio: { notes: n } })))

  const points = [...(f.negocio.report?.points ?? []), ...f.negocio.manualPoints]
  const answerOf = (id: string): PointAnswer => answers[id] ?? EMPTY
  const open = points.filter((p) => answerOf(p.id).status === 'aberta')
  const blocking = open.filter((p) => p.blocksDev)
  const visible = filter === 'open' ? open : filter === 'blocking' ? blocking : points

  if (!f.negocio.report && !running) {
    return (
      <>
        {f.negocio.status === 'error' && <ErrorBox msg={f.negocio.error} />}
        {job && <RunningBox job={job} />}
        <div className="empty stack" style={{ alignItems: 'center' }}>
          <div>
            O Claude Code vai ler a história, as vinculadas, a história de design (protótipos .html e Figma) e listar divergências e
            dúvidas.
          </div>
          <button className="btn primary" onClick={() => void act(() => api.runBusiness(f.key))}>
            Iniciar refinamento de negócio
          </button>
        </div>
      </>
    )
  }

  const addPoint = async (p: BusinessPoint): Promise<void> => {
    await act(() => api.updateFeature(f.key, { negocio: { manualPoints: [...f.negocio.manualPoints, p] } }))
    setAnswers({ ...answers, [p.id]: EMPTY })
    setAdding(false)
  }

  const removeManual = (id: string): void => {
    void act(() => api.updateFeature(f.key, { negocio: { manualPoints: f.negocio.manualPoints.filter((m) => m.id !== id) } }))
  }

  return (
    <>
      {f.negocio.status === 'error' && <ErrorBox msg={f.negocio.error} />}
      {job && (running || job.status !== 'ok') && <RunningBox job={job} />}
      <div className="cols">
        <div className="col-main">
          {f.negocio.report?.summary && (
            <section className="pn">
              <div className="ph">Resumo</div>
              <div className="pb" style={{ lineHeight: 1.6 }}>
                {f.negocio.report.summary}
              </div>
            </section>
          )}
          <div className="hstack">
            <span className="hd">Pontos em aberto</span>
            <div className="seg">
              <button className={`btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
                Todos {points.length}
              </button>
              <button className={`btn ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>
                Abertos {open.length}
              </button>
              <button className={`btn ${filter === 'blocking' ? 'on' : ''}`} onClick={() => setFilter('blocking')}>
                Travam dev {blocking.length}
              </button>
            </div>
            <button className="btn spacer" onClick={() => setAdding(true)}>
              + Adicionar ponto
            </button>
          </div>
          {adding && <NewPoint existing={points} onCancel={() => setAdding(false)} onAdd={(p) => void addPoint(p)} />}
          {visible.length === 0 && <div className="empty">Nada aqui.</div>}
          {visible.map((p) => (
            <PointCard
              key={p.id}
              point={p}
              answer={answerOf(p.id)}
              defaultOpen={answerOf(p.id).status === 'aberta' && (p.blocksDev || p.severity === 'alta')}
              onChange={(a) => setAnswers({ ...answers, [p.id]: a })}
              onRemove={p.manual ? () => removeManual(p.id) : undefined}
            />
          ))}
        </div>

        <aside className="col-side">
          <section className="pn">
            <div className="ph">Notas da conversa</div>
            <div className="pb stack">
              <label className="lb">
                Alinhamentos com PM, design, tech lead…
                <textarea
                  className="in"
                  rows={8}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="- PM confirmou que…"
                />
              </label>
              <span className="mu small">O agente lê estas notas e as respostas ao reanalisar.</span>
            </div>
          </section>

          {f.negocio.report && f.negocio.report.sources.length > 0 && (
            <section className="pn">
              <div className="ph">Fontes lidas</div>
              <div className="m" style={{ fontSize: 12, lineHeight: '24px', padding: '6px 12px' }}>
                {f.negocio.report.sources.map((s, i) => (
                  <div key={i} title={s.label}>
                    <span className="mu">{s.kind.padEnd(6, ' ')}</span>
                    {s.ref}
                    {s.label ? <span className="mu"> — {s.label}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="pn">
            <div className="ph">Ações</div>
            <div className="pb stack">
              <button
                className="btn primary"
                disabled={running}
                onClick={() =>
                  void act(async () => {
                    await api.updateFeature(f.key, { negocio: { answers, notes } })
                    await api.runBusiness(f.key)
                  })
                }
              >
                {running ? <Spinner /> : null} Reanalisar com as respostas
              </button>
              <button
                className="btn"
                disabled={running}
                onClick={async () => {
                  await act(() => api.runTechnical(f.key))
                  go({ view: 'feature', key: f.key, tab: 'tecnico' })
                }}
              >
                Seguir para refinamento técnico
              </button>
              {openBlockingPoints(f) > 0 && <span className="warn small">{openBlockingPoints(f)} ponto(s) ainda travam o dev.</span>}
              <button className="btn" onClick={() => setShowMd(!showMd)}>
                {showMd ? 'Ocultar' : 'Ver'} 01-refinamento-negocio.md
              </button>
            </div>
          </section>
        </aside>
      </div>
      {showMd && (
        <section className="pn">
          <div className="ph m">contexto/01-refinamento-negocio.md</div>
          {md.text ? <CodeView text={md.text} /> : <div className="pb mu">{md.loading ? 'carregando…' : 'arquivo não encontrado'}</div>}
        </section>
      )}
    </>
  )
}

export function ErrorBox({ msg }: { msg?: string }): React.JSX.Element {
  return (
    <section className="pn alert">
      <div className="ph">
        <Tag tone="err">erro</Tag>
        <span style={{ fontWeight: 400, whiteSpace: 'pre-wrap' }}>{msg || 'falhou'}</span>
      </div>
    </section>
  )
}

function PointCard(props: {
  point: BusinessPoint
  answer: PointAnswer
  defaultOpen: boolean
  onChange: (a: PointAnswer) => void
  onRemove?: () => void
}): React.JSX.Element {
  const { point: p, answer: a, onChange } = props
  const [open, setOpen] = useState(props.defaultOpen)
  const kindLabel = p.kind === 'divergencia' ? 'divergência' : 'dúvida'
  return (
    <article className="pn">
      <button
        className="ph"
        style={{
          width: '100%',
          background: 'none',
          border: 0,
          borderBottom: open ? undefined : 0,
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left'
        }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="m mu">{p.id}</span>
        <Tag tone={p.blocksDev ? 'err' : sevTone[p.severity]}>
          {kindLabel} · {p.blocksDev ? 'trava dev' : p.severity}
        </Tag>
        {p.manual && <Tag>manual</Tag>}
        <span style={{ fontWeight: 500, flex: 1, minWidth: 200 }}>{p.title}</span>
        {p.relatedTo && p.relatedTo.length > 0 && <span className="mu small m">↔ {p.relatedTo.join(', ')}</span>}
        <Tag tone={statusTone[a.status]}>{a.status}</Tag>
      </button>
      {open && (
        <>
          {(p.story || p.design) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                borderBottom: '1px solid var(--border-soft)',
                fontSize: 12
              }}
            >
              <div style={{ padding: '10px 12px', borderRight: '1px solid var(--border-soft)' }}>
                <div className="hd" style={{ marginBottom: 4 }}>
                  História
                </div>
                {p.story || <span className="mu">—</span>}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div className="hd" style={{ marginBottom: 4 }}>
                  {p.designSource || 'Design'}
                </div>
                {p.design || <span className="mu">—</span>}
              </div>
            </div>
          )}
          <div className="pb stack">
            {p.context && (
              <div className="mu" style={{ fontSize: 12 }}>
                {p.context}
              </div>
            )}
            <div className="hstack">
              <label className="lb">
                Status
                <select
                  className="in"
                  value={a.status}
                  onChange={(e) => onChange({ ...a, status: e.target.value as PointAnswer['status'] })}
                >
                  <option value="aberta">aberta</option>
                  <option value="respondida">respondida</option>
                  <option value="descartada">descartada</option>
                </select>
              </label>
              <label className="lb">
                Quem respondeu
                <select className="in" value={a.who} onChange={(e) => onChange({ ...a, who: e.target.value })}>
                  <option value="">—</option>
                  {WHO.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label className="lb">
                Quando / onde
                <input
                  className="in"
                  style={{ width: 160 }}
                  placeholder="24/11 · daily"
                  value={a.when}
                  onChange={(e) => onChange({ ...a, when: e.target.value })}
                />
              </label>
              {props.onRemove && (
                <button className="btn danger spacer" onClick={props.onRemove}>
                  Remover ponto
                </button>
              )}
            </div>
            <label className="lb">
              Resposta / o que foi combinado
              <textarea
                className="in"
                rows={3}
                value={a.text}
                placeholder="Escreva o que foi falado pelo PM, design ou tech lead"
                onChange={(e) => {
                  const text = e.target.value
                  onChange({ ...a, text, status: a.status === 'aberta' && text.trim() ? 'respondida' : a.status })
                }}
              />
            </label>
          </div>
        </>
      )}
    </article>
  )
}

function NewPoint({
  existing,
  onAdd,
  onCancel
}: {
  existing: BusinessPoint[]
  onAdd: (p: BusinessPoint) => void
  onCancel: () => void
}): React.JSX.Element {
  const [kind, setKind] = useState<PointKind>('duvida')
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState(false)
  const [context, setContext] = useState('')
  const nextId = (): string => {
    const prefix = kind === 'divergencia' ? 'D' : 'Q'
    const nums = existing.filter((p) => p.id.startsWith(prefix)).map((p) => Number(p.id.slice(1)) || 0)
    return `${prefix}${Math.max(0, ...nums) + 1}`
  }
  return (
    <section className="pn attention">
      <div className="ph">Novo ponto</div>
      <div className="pb stack">
        <div className="hstack">
          <label className="lb">
            Tipo
            <select className="in" value={kind} onChange={(e) => setKind(e.target.value as PointKind)}>
              <option value="duvida">dúvida</option>
              <option value="divergencia">divergência</option>
            </select>
          </label>
          <label className="lb" style={{ flex: 1 }}>
            Título
            <input
              className="in"
              style={{ fontFamily: 'var(--sans)' }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <label className="check" style={{ marginTop: 18 }}>
            <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} /> trava o dev
          </label>
        </div>
        <label className="lb">
          Contexto
          <textarea className="in" rows={2} value={context} onChange={(e) => setContext(e.target.value)} />
        </label>
        <div className="hstack">
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!title.trim()}
            onClick={() =>
              onAdd({
                id: nextId(),
                kind,
                severity: blocks ? 'alta' : 'media',
                blocksDev: blocks,
                title: title.trim(),
                context: context.trim() || undefined,
                manual: true
              })
            }
          >
            Adicionar
          </button>
        </div>
      </div>
    </section>
  )
}
