import { useState } from 'react'
import { STAGES } from '@shared/types'
import { JobsPanel, Tag } from '../components/ui'
import { api, featureState, since, useApp } from '../state'

type Filter = 'all' | 'waiting' | 'running'

export function Board(): React.JSX.Element {
  const { features, jobs, go, act } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const rows = features.map((f) => ({ f, st: featureState(f, jobs) }))
  const waiting = rows.filter((r) => r.st.tone === 'warn' || r.st.tone === 'err').length
  const running = rows.filter((r) => r.st.tone === 'run').length
  const visible = rows.filter(({ f, st }) => {
    if (filter === 'waiting' && !(st.tone === 'warn' || st.tone === 'err')) return false
    if (filter === 'running' && st.tone !== 'run') return false
    const q = query.trim().toLowerCase()
    return !q || f.key.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)
  })

  return (
    <>
      <div className="titlebar">
        <span className="title">Board</span>
        <div className="seg">
          <button className={`btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            Todas {features.length}
          </button>
          <button className={`btn ${filter === 'waiting' ? 'on' : ''}`} onClick={() => setFilter('waiting')}>
            Aguardando você {waiting}
          </button>
          <button className={`btn ${filter === 'running' ? 'on' : ''}`} onClick={() => setFilter('running')}>
            Rodando {running}
          </button>
        </div>
        <input
          className="in spacer"
          style={{ width: 240 }}
          placeholder="filtrar por chave ou título"
          aria-label="Filtrar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn primary" onClick={() => go({ view: 'new' })}>
          Nova feature
        </button>
      </div>
      <div className="scroll">
        {features.length === 0 ? (
          <div className="content">
            <div className="empty">
              Nenhuma feature ainda. Configure os repositórios em <a onClick={() => go({ view: 'settings' })}>Configurações</a> e crie a
              primeira em <a onClick={() => go({ view: 'new' })}>Nova feature</a>.
            </div>
          </div>
        ) : (
          <table className="t" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="hd">Chave</th>
                <th className="hd">Título</th>
                <th className="hd">Etapa</th>
                <th className="hd">Estado</th>
                <th className="hd">Repos</th>
                <th className="hd">Atualizado</th>
                <th>
                  <span className="sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ f, st }) => {
                const stageIdx = STAGES.findIndex((s) => s.id === f.stage)
                return (
                  <tr key={f.key} className="click" onClick={() => go({ view: 'feature', key: f.key, tab: f.stage })}>
                    <td className="m">
                      <a>{f.key}</a>
                    </td>
                    <td>{f.title}</td>
                    <td className="m mu">
                      {stageIdx + 1} {STAGES[stageIdx]?.label}
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      <div className="hstack" style={{ flexWrap: 'nowrap' }}>
                        <Tag tone={st.tone}>{st.label}</Tag>
                        <span className="mu ellipsis" title={st.detail}>
                          {st.detail}
                        </span>
                      </div>
                    </td>
                    <td className="m mu">{f.repos.map((r) => r.name).join(', ')}</td>
                    <td className="m mu">{since(f.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          void act(() => api.openInIde(f.key))
                        }}
                      >
                        Abrir no Kiro
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <JobsPanel jobs={jobs} />
    </>
  )
}
