import { useEffect, useMemo, useState } from 'react'
import { branchName, commitMessage, parseTypes, slugify } from '@shared/branches'
import type { LinkedIssue } from '@shared/types'
import { Spinner, Tag } from '../components/ui'
import { api, useApp } from '../state'

interface RepoRow {
  name: string
  include: boolean
  base: string
  type: string
  scope: string
  branch: string
  branchEdited: boolean
}

export function NewFeature(): React.JSX.Element {
  const { config, go, act, toast } = useApp()
  const [key, setKey] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('')
  const [linked, setLinked] = useState<LinkedIssue[]>([])
  const [looking, setLooking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [startBusiness, setStartBusiness] = useState(true)
  const [openIde, setOpenIde] = useState(true)
  const [rows, setRows] = useState<RepoRow[]>([])

  const types = useMemo(() => parseTypes(config?.branches.types ?? 'feat'), [config])

  useEffect(() => {
    if (!config) return
    setRows((prev) =>
      config.repos.map((r) => {
        const old = prev.find((p) => p.name === r.name)
        return (
          old ?? {
            name: r.name,
            include: false,
            base: r.baseBranch,
            type: types[0] ?? 'feat',
            scope: r.defaultScope,
            branch: '',
            branchEdited: false
          }
        )
      })
    )
  }, [config, types])

  // nome da branch acompanha chave/título/tipo/escopo até você editá-lo
  useEffect(() => {
    if (!config) return
    const k = key.trim().toUpperCase()
    setRows((prev) =>
      prev.map((r) =>
        r.branchEdited
          ? r
          : {
              ...r,
              branch: k
                ? branchName(config.branches.branchPattern, {
                    tipo: r.type,
                    escopo: r.scope,
                    chave: k,
                    slug: slugify(title || k, config.branches.slugMaxLength)
                  })
                : ''
            }
      )
    )
  }, [key, title, config, rows.map((r) => `${r.type}|${r.scope}|${r.branchEdited}`).join(',')])

  if (!config) return <div className="content mu">carregando…</div>

  const patch = (name: string, p: Partial<RepoRow>): void => setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...p } : r)))

  const lookup = async (): Promise<void> => {
    if (!key.trim()) return
    setLooking(true)
    const r = await act(() => api.lookupStory(key))
    setLooking(false)
    if (r) {
      setTitle(r.title)
      setStatus(r.status)
      setLinked(r.linked)
    }
  }

  const selected = rows.filter((r) => r.include)
  const create = async (): Promise<void> => {
    if (!key.trim()) return toast('Informe a chave da história')
    if (!selected.length) return toast('Selecione pelo menos um repositório')
    setCreating(true)
    const f = await act(() =>
      api.createFeature({
        key,
        title,
        linked,
        repos: selected.map((r) => ({ name: r.name, base: r.base, type: r.type, scope: r.scope, branch: r.branch })),
        startBusiness,
        openIde
      })
    )
    setCreating(false)
    if (f) go({ view: 'feature', key: f.key, tab: 'negocio' })
  }

  const k = key.trim().toUpperCase() || 'CHAVE'
  const root = config.featuresRoot.replace(/\/$/, '')

  return (
    <>
      <div className="titlebar">
        <a className="mu small" onClick={() => go({ view: 'board' })}>
          Board
        </a>
        <span className="mu">/</span>
        <span className="title">Nova feature</span>
      </div>
      <div className="scroll">
        <div className="content">
          <div className="cols">
            <div className="col-main" style={{ gap: 14 }}>
              <section className="pn">
                <div className="ph">1. História no Jira</div>
                <div className="pb stack">
                  <div className="hstack" style={{ alignItems: 'flex-end' }}>
                    <label className="lb">
                      Chave
                      <input
                        className="in"
                        style={{ width: 160 }}
                        value={key}
                        placeholder="CHK-123"
                        onChange={(e) => setKey(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && void lookup()}
                      />
                    </label>
                    <button className="btn" onClick={() => void lookup()} disabled={looking || !key.trim()}>
                      {looking ? <Spinner /> : null} Buscar no Jira
                    </button>
                    {looking && <span className="mu small">o Claude Code está lendo a história e as vinculadas…</span>}
                    {status && <Tag>{status}</Tag>}
                  </div>
                  <label className="lb">
                    Título
                    <input
                      className="in"
                      value={title}
                      placeholder="preenchido pela busca, ou digite"
                      onChange={(e) => setTitle(e.target.value)}
                      style={{ fontFamily: 'var(--sans)' }}
                    />
                  </label>
                  {linked.length > 0 && (
                    <table className="t">
                      <tbody>
                        {linked.map((l) => (
                          <tr key={l.key}>
                            <td style={{ width: 90 }}>
                              <Tag tone={l.isDesign ? 'run' : 'mu'}>{l.isDesign ? 'design' : l.relation || 'link'}</Tag>
                            </td>
                            <td className="m" style={{ width: 100 }}>
                              {l.key}
                            </td>
                            <td>{l.title}</td>
                            <td className="m mu">
                              {[l.attachments.length ? `${l.attachments.length} anexo(s)` : '', l.figma.length ? 'figma' : '']
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <section className="pn">
                <div className="ph">
                  2. Repositórios e branches
                  <span className="mu spacer" style={{ fontWeight: 400 }}>
                    padrão: <span className="m">{config.branches.branchPattern}</span> ·{' '}
                    <a onClick={() => go({ view: 'settings' })}>editar</a>
                  </span>
                </div>
                {rows.length === 0 ? (
                  <div className="pb mu small">
                    Nenhum repositório configurado. Adicione em <a onClick={() => go({ view: 'settings' })}>Configurações › Repositórios</a>
                    .
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="t" style={{ minWidth: 820 }}>
                      <thead>
                        <tr>
                          <th>
                            <span className="sr">Incluir</span>
                          </th>
                          <th className="hd">Repositório</th>
                          <th className="hd">Base</th>
                          <th className="hd">Tipo</th>
                          <th className="hd">Escopo</th>
                          <th className="hd">Branch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.name} style={{ color: r.include ? undefined : 'var(--muted)' }}>
                            <td style={{ width: 28 }}>
                              <input
                                type="checkbox"
                                checked={r.include}
                                aria-label={`Incluir ${r.name}`}
                                onChange={(e) => patch(r.name, { include: e.target.checked })}
                              />
                            </td>
                            <td className="m">{r.name}</td>
                            <td>
                              <input
                                className="in"
                                style={{ width: 110 }}
                                value={r.base}
                                aria-label={`Base ${r.name}`}
                                onChange={(e) => patch(r.name, { base: e.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                className="in"
                                value={r.type}
                                aria-label={`Tipo ${r.name}`}
                                onChange={(e) => patch(r.name, { type: e.target.value })}
                              >
                                {types.map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="in"
                                style={{ width: 130 }}
                                value={r.scope}
                                aria-label={`Escopo ${r.name}`}
                                onChange={(e) => patch(r.name, { scope: e.target.value })}
                              />
                            </td>
                            <td style={{ width: '100%' }}>
                              <div className="hstack" style={{ flexWrap: 'nowrap' }}>
                                <input
                                  className="in"
                                  style={{ width: '100%', minWidth: 280 }}
                                  value={r.branch}
                                  aria-label={`Branch ${r.name}`}
                                  onChange={(e) => patch(r.name, { branch: e.target.value, branchEdited: true })}
                                />
                                {r.branchEdited && (
                                  <a className="small" title="Voltar ao padrão" onClick={() => patch(r.name, { branchEdited: false })}>
                                    padrão
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {selected.length > 0 && (
                  <div className="m mu small" style={{ padding: '10px 12px', borderTop: '1px solid var(--border-soft)', lineHeight: 1.8 }}>
                    {selected.map((r) => (
                      <div key={r.name}>
                        commits em {r.name}:{' '}
                        <span style={{ color: 'var(--text)' }}>
                          {commitMessage(config.branches.commitPattern, {
                            tipo: r.type,
                            escopo: r.scope,
                            chave: k,
                            descricao: '<descrição>'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="pn">
                <div className="ph">3. Ao criar</div>
                <div className="pb stack">
                  <label className="check">
                    <input type="checkbox" checked={startBusiness} onChange={(e) => setStartBusiness(e.target.checked)} />
                    Iniciar refinamento de negócio (Claude Code)
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={openIde} onChange={(e) => setOpenIde(e.target.checked)} />
                    Abrir janela do Kiro com o workspace da feature
                  </label>
                </div>
              </section>

              <div className="hstack" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => go({ view: 'board' })}>
                  Cancelar
                </button>
                <button className="btn primary" onClick={() => void create()} disabled={creating}>
                  {creating ? <Spinner /> : null} Criar feature
                </button>
              </div>
            </div>

            <aside className="col-side">
              <section className="pn">
                <div className="ph">Pré-visualização</div>
                <pre
                  className="m"
                  style={{ margin: 0, padding: 12, fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}
                >
                  {`${root}/${k}/
├── ${k}.code-workspace
├── .kiro/
│   ├── steering/feature-context.md
│   └── specs/
${selected.map((r) => `├── ${r.name}/   ${r.branch || '…'}`).join('\n')}${selected.length ? '\n' : ''}└── contexto/
    ├── historia.md
    ├── design/
    ├── 01-refinamento-negocio.md
    ├── 02-refinamento-tecnico.md
    └── onde-parei.md`}
                </pre>
                <div className="pb mu small" style={{ borderTop: '1px solid var(--border-soft)' }}>
                  Cada repositório selecionado vira um git worktree na sua branch. O Kiro abre a pasta da feature numa janela própria, que
                  guarda os arquivos e terminais abertos dessa feature.
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}
