import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DiffLine, Job, JobLogLine } from '@shared/types'
import { api, duration, toneColor, type Tone } from '../state'

export function Icon({ name }: { name: 'board' | 'plus' | 'gear' }): React.JSX.Element {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    'aria-hidden': true
  }
  if (name === 'board')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    )
  if (name === 'plus')
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  )
}

export function Dot({ tone }: { tone: Tone }): React.JSX.Element {
  return (
    <span style={{ color: toneColor[tone] }} aria-hidden>
      ●
    </span>
  )
}

export function Tag({ tone = 'mu', children }: { tone?: Tone; children: ReactNode }): React.JSX.Element {
  return (
    <span className="tg" style={{ color: toneColor[tone] }}>
      {children}
    </span>
  )
}

export function Spinner(): React.JSX.Element {
  return <span className="spin" aria-label="carregando" />
}

const jobTone = (j: Job): Tone => (j.status === 'running' ? 'run' : j.status === 'ok' ? 'ok' : j.status === 'error' ? 'err' : 'mu')

/** Log ao vivo de uma execução. */
export function JobLog({ jobId, height }: { jobId: number; height?: number | string }): React.JSX.Element {
  const [lines, setLines] = useState<JobLogLine[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    let alive = true
    setLines([])
    void api.jobLog(jobId).then((l) => alive && setLines(l))
    const off = api.onJobLog((line) => {
      if (line.jobId === jobId) setLines((prev) => [...prev.slice(-3999), line])
    })
    return () => {
      alive = false
      off()
    }
  }, [jobId])

  useEffect(() => {
    if (stick.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <div
      ref={ref}
      className="log"
      style={{ overflow: 'auto', height: height ?? '100%', background: 'var(--bg-input)' }}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
      }}
    >
      {lines.length === 0 && <span className="mu">sem saída ainda…</span>}
      {lines.map((l, i) => (
        <div key={i} className={l.stream === 'err' ? 'err' : l.stream === 'info' ? 'info' : ''}>
          <span className="mu">{new Date(l.at).toLocaleTimeString('pt-BR')} </span>
          {l.text}
        </div>
      ))}
    </div>
  )
}

/** Lista de execuções com log da selecionada (painel inferior). */
export function JobsPanel({ jobs, featureKey, height = 260 }: { jobs: Job[]; featureKey?: string; height?: number }): React.JSX.Element {
  const list = (featureKey ? jobs.filter((j) => j.featureKey === featureKey) : jobs).slice(0, 60)
  const [sel, setSel] = useState<number | null>(null)
  const [tab, setTab] = useState<'list' | 'log'>('list')
  const selected = sel ?? list[0]?.id ?? null
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="bottom-panel" style={{ height }}>
      <div className="tabs" style={{ background: 'var(--bg-side)' }}>
        <button className={`tab hd ${tab === 'list' ? 'act' : ''}`} onClick={() => setTab('list')}>
          Execuções
        </button>
        <button className={`tab hd ${tab === 'log' ? 'act' : ''}`} onClick={() => setTab('log')} disabled={selected === null}>
          Saída {selected !== null ? `#${selected}` : ''}
        </button>
      </div>
      {tab === 'list' ? (
        <div className="scroll">
          {list.length === 0 && (
            <div className="mu small" style={{ padding: 12 }}>
              Nenhuma execução ainda.
            </div>
          )}
          <div
            className="m"
            style={{ display: 'grid', gridTemplateColumns: '48px 84px 76px 150px minmax(0,1fr) 90px 70px 70px', fontSize: 12 }}
          >
            {list.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                selected={j.id === selected}
                onOpen={() => {
                  setSel(j.id)
                  setTab('log')
                }}
              />
            ))}
          </div>
        </div>
      ) : selected !== null ? (
        <JobLog jobId={selected} />
      ) : null}
    </section>
  )
}

function JobRow({ job, selected, onOpen }: { job: Job; selected: boolean; onOpen: () => void }): React.JSX.Element {
  const cells = [
    <span className="mu">#{job.id}</span>,
    <span>{job.featureKey}</span>,
    <span>{job.engine}</span>,
    <span className="ellipsis">{job.kind}</span>,
    <span className="ellipsis" title={job.error ?? job.activity}>
      {job.activity}
    </span>,
    <span style={{ color: toneColor[jobTone(job)] }}>{job.status === 'running' ? 'rodando' : job.status}</span>,
    <span className="mu">{duration(job)}</span>,
    job.status === 'running' ? (
      <a
        onClick={(e) => {
          e.stopPropagation()
          void api.cancelJob(job.id)
        }}
      >
        cancelar
      </a>
    ) : (
      <span className="mu">{job.costUsd ? `$${job.costUsd.toFixed(2)}` : ''}</span>
    )
  ]
  return (
    <>
      {cells.map((c, i) => (
        <div
          key={i}
          onClick={onOpen}
          style={{
            padding: '0 8px',
            lineHeight: '28px',
            minWidth: 0,
            cursor: 'pointer',
            background: selected ? 'var(--sel)' : undefined,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            paddingLeft: i === 0 ? 16 : 8
          }}
        >
          {c}
        </div>
      ))}
    </>
  )
}

/** Texto com números de linha (markdown dos agentes, specs). */
export function CodeView({ text }: { text: string }): React.JSX.Element {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  return (
    <div className="code">
      {lines.map((l, i) => (
        <Line key={i} n={i + 1} text={l} />
      ))}
    </div>
  )
}

function Line({ n, text }: { n: number; text: string }): React.JSX.Element {
  const cls = /^#{1,6}\s/.test(text) ? 'tx h' : /^\s*[-*] \[x\]/i.test(text) ? 'tx ok' : 'tx'
  return (
    <>
      <span className="ln">{n}</span>
      <span className={cls}>{text || ' '}</span>
    </>
  )
}

export function DiffView({ diff }: { diff: DiffLine[] }): React.JSX.Element {
  return (
    <div className="diff">
      {diff.map((d, i) => (
        <div key={i} className={d.op === '+' ? 'add' : d.op === '-' ? 'del' : 'mu'}>
          {d.op === ' ' ? '  ' : d.op + ' '}
          {d.text}
        </div>
      ))}
    </div>
  )
}

/** Painel de execução atual de uma etapa: atividade + log recolhível. */
export function RunningBox({ job }: { job?: Job }): React.JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (!job) return null
  return (
    <section className="pn">
      <div className="ph">
        {job.status === 'running' ? <Spinner /> : <Tag tone={jobTone(job)}>{job.status}</Tag>}
        <span className="m">
          {job.engine} · {job.kind}
        </span>
        <span className="mu ellipsis" style={{ fontWeight: 400 }}>
          {job.activity}
        </span>
        <span className="spacer m mu small">{duration(job)}</span>
        {job.status === 'running' && (
          <button className="btn" onClick={() => void api.cancelJob(job.id)}>
            Cancelar
          </button>
        )}
        <button className="btn" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar log' : 'Ver log'}
        </button>
      </div>
      {open && <JobLog jobId={job.id} height={220} />}
    </section>
  )
}
