import { useEffect, useState, type ReactNode } from 'react'
import { branchName, commitMessage, parseTypes, slugify } from '@shared/branches'
import type { AppConfig, EnvStatus, StagePromptOverrides } from '@shared/types'
import { Spinner, Tag } from '../components/ui'
import { api, useApp } from '../state'

export const SETTINGS_SECTIONS = [
  { id: 'integracoes', label: 'Integrações' },
  { id: 'jira', label: 'Jira' },
  { id: 'repos', label: 'Repositórios' },
  { id: 'branches', label: 'Branches e commits' },
  { id: 'kiro', label: 'Kiro IDE' },
  { id: 'agentes', label: 'Agentes por etapa' },
  { id: 'execucao', label: 'Execução' }
]

const AGENTS: { key: keyof StagePromptOverrides; label: string; engine: string }[] = [
  { key: 'buscarHistoria', label: 'Buscar história (nova feature)', engine: 'claude' },
  { key: 'negocio', label: 'Refinamento de negócio', engine: 'claude' },
  { key: 'tecnico', label: 'Refinamento técnico', engine: 'claude' },
  { key: 'subtasks', label: 'Criar subtasks no Jira', engine: 'claude' },
  { key: 'historia', label: 'Verificar mudanças na história', engine: 'claude' },
  { key: 'spec', label: 'Criar spec', engine: 'kiro-cli' },
  { key: 'specUpdate', label: 'Atualizar spec (história mudou)', engine: 'kiro-cli' },
  { key: 'task', label: 'Executar task', engine: 'kiro-cli' },
  { key: 'ondeParei', label: 'Onde parei', engine: 'claude' }
]

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): React.JSX.Element {
  return (
    <div className="f">
      <span>
        {label}
        {hint && (
          <div className="small" style={{ color: 'var(--dim)', marginTop: 2 }}>
            {hint}
          </div>
        )}
      </span>
      <div className="hstack">{children}</div>
    </div>
  )
}

export function Settings(): React.JSX.Element {
  const { config, setConfig, attempt } = useApp()
  const [draft, setDraft] = useState<AppConfig | null>(config)
  const [env, setEnv] = useState<EnvStatus | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (config && !draft) setDraft(config)
  }, [config, draft])

  if (!draft) return <div className="content mu">carregando…</div>
  const dirty = JSON.stringify(draft) !== JSON.stringify(config)

  const set = <K extends keyof AppConfig>(k: K, v: Partial<AppConfig[K]>): void =>
    setDraft({ ...draft, [k]: Array.isArray(v) ? v : { ...(draft[k] as object), ...v } } as AppConfig)

  const save = async (): Promise<void> => {
    let saved: AppConfig | null = null
    const ok = await attempt(async () => {
      saved = await api.saveConfig(draft)
    }, 'Configurações salvas')
    if (ok && saved) {
      setConfig(saved)
      setDraft(saved)
    }
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    if (dirty) await save()
    const r = await api.checkEnv(true).catch(() => null)
    setEnv(r)
    setTesting(false)
  }

  const types = parseTypes(draft.branches.types)
  const sample = {
    tipo: types[0] ?? 'feat',
    escopo: draft.repos[0]?.defaultScope || 'checkout',
    chave: 'CHK-490',
    slug: slugify('Troca de forma de pagamento', draft.branches.slugMaxLength),
    descricao: 'permitir troca de cartão'
  }

  return (
    <>
      <div className="titlebar">
        <span className="title">Configurações</span>
        {dirty && <Tag tone="warn">não salvo</Tag>}
        <div className="spacer hstack">
          <button className="btn" disabled={!dirty} onClick={() => setDraft(config)}>
            Descartar
          </button>
          <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
            Salvar
          </button>
        </div>
      </div>
      <div className="scroll">
        <div className="content" style={{ maxWidth: 1040 }}>
          <section id="cfg-integracoes" className="pn">
            <div className="ph">
              Integrações
              <button className="btn spacer" onClick={() => void test()} disabled={testing}>
                {testing ? <Spinner /> : null} Testar ambiente
              </button>
            </div>
            <Field label="Executar no WSL" hint="No Windows, mantenha ligado: repositórios e CLIs ficam no WSL.">
              <label className="check">
                <input type="checkbox" checked={draft.wsl.enabled} onChange={(e) => set('wsl', { enabled: e.target.checked })} /> usar
                wsl.exe
              </label>
              <input
                className="in"
                style={{ width: 200 }}
                placeholder="distribuição (vazio = padrão)"
                value={draft.wsl.distro}
                onChange={(e) => set('wsl', { distro: e.target.value })}
                aria-label="Distribuição WSL"
              />
            </Field>
            <Field label="Inicialização do shell" hint="Rodado antes de cada comando (PATH, nvm).">
              <textarea
                className="in m"
                rows={4}
                value={draft.wsl.shellInit}
                onChange={(e) => set('wsl', { shellInit: e.target.value })}
                aria-label="Inicialização do shell"
              />
            </Field>
            <Field label="Claude Code (orquestrador)" hint="Comando e modelo. Vazio = padrão do Claude Code.">
              <input
                className="in"
                style={{ width: 200 }}
                value={draft.claude.command}
                onChange={(e) => set('claude', { command: e.target.value })}
                aria-label="Comando do Claude Code"
              />
              <input
                className="in"
                style={{ width: 150 }}
                placeholder="modelo"
                value={draft.claude.model}
                onChange={(e) => set('claude', { model: e.target.value })}
                aria-label="Modelo"
              />
              <input
                className="in"
                style={{ width: 170 }}
                placeholder="modelo p/ tarefas rápidas"
                value={draft.claude.quickModel}
                onChange={(e) => set('claude', { quickModel: e.target.value })}
                aria-label="Modelo rápido"
              />
            </Field>
            <Field label="Permissões do Claude Code" hint="Modo headless (-p). Ferramentas liberadas, uma por linha.">
              <div className="stack" style={{ width: '100%' }}>
                <select
                  className="in"
                  style={{ width: 260 }}
                  value={draft.claude.permissionMode}
                  onChange={(e) => set('claude', { permissionMode: e.target.value as AppConfig['claude']['permissionMode'] })}
                  aria-label="Modo de permissão"
                >
                  <option value="acceptEdits">acceptEdits + lista abaixo</option>
                  <option value="default">default + lista abaixo</option>
                  <option value="bypassPermissions">liberar tudo (--dangerously-skip-permissions)</option>
                </select>
                <textarea
                  className="in m"
                  rows={6}
                  disabled={draft.claude.permissionMode === 'bypassPermissions'}
                  value={draft.claude.allowedTools.join('\n')}
                  onChange={(e) =>
                    set('claude', {
                      allowedTools: e.target.value
                        .split('\n')
                        .map((x) => x.trim())
                        .filter(Boolean)
                    })
                  }
                  aria-label="Ferramentas liberadas"
                />
                <span className="mu small">
                  Para os MCPs, use o nome do servidor como aparece em <span className="m">claude mcp list</span> (ex.:{' '}
                  <span className="m">mcp__atlassian</span>).
                </span>
              </div>
            </Field>
            <Field label="Claude Code · extras">
              <input
                className="in"
                style={{ width: 300 }}
                placeholder="argumentos extras"
                value={draft.claude.extraArgs}
                onChange={(e) => set('claude', { extraArgs: e.target.value })}
                aria-label="Argumentos extras do Claude Code"
              />
              <label className="lb" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                limite US$/execução
                <input
                  className="in"
                  style={{ width: 80 }}
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.claude.maxBudgetUsd}
                  onChange={(e) => set('claude', { maxBudgetUsd: Number(e.target.value) || 0 })}
                />
              </label>
            </Field>
            <Field label="kiro-cli (spec e execução)">
              <input
                className="in"
                style={{ width: 200 }}
                value={draft.kiro.command}
                onChange={(e) => set('kiro', { command: e.target.value })}
                aria-label="Comando do kiro-cli"
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.kiro.trustAllTools}
                  onChange={(e) => set('kiro', { trustAllTools: e.target.checked })}
                />{' '}
                --trust-all-tools
              </label>
              {!draft.kiro.trustAllTools && (
                <input
                  className="in"
                  style={{ width: 240 }}
                  placeholder="--trust-tools (ex.: read,write,shell)"
                  value={draft.kiro.trustTools}
                  onChange={(e) => set('kiro', { trustTools: e.target.value })}
                  aria-label="Ferramentas confiáveis"
                />
              )}
              <input
                className="in"
                style={{ width: 220 }}
                placeholder="argumentos extras"
                value={draft.kiro.extraArgs}
                onChange={(e) => set('kiro', { extraArgs: e.target.value })}
                aria-label="Argumentos extras do kiro-cli"
              />
            </Field>
            {env && (
              <div style={{ borderTop: '1px solid var(--border-soft)' }}>
                {(
                  [
                    [
                      'shell',
                      env.wsl.ok,
                      env.wsl.ok ? `home ${env.wsl.home}${env.wsl.distro ? ` · ${env.wsl.distro}` : ''}` : env.wsl.output
                    ],
                    ['git', env.git.ok, env.git.output],
                    ['claude', env.claude.ok, env.claude.output],
                    ['kiro-cli', env.kiro.ok, env.kiro.output]
                  ] as const
                ).map(([name, ok, out]) => (
                  <div key={name} className="f" style={{ alignItems: 'start' }}>
                    <span>
                      <Tag tone={ok ? 'ok' : 'err'}>{ok ? 'ok' : 'falhou'}</Tag> {name}
                    </span>
                    <pre className="m small" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                      {out || '—'}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="cfg-jira" className="pn">
            <div className="ph">Jira</div>
            <Field label="Site" hint="Opcional: ajuda o agente a escolher o site certo.">
              <input
                className="in"
                style={{ width: 360 }}
                placeholder="https://suaempresa.atlassian.net"
                value={draft.jira.siteUrl}
                onChange={(e) => set('jira', { siteUrl: e.target.value })}
                aria-label="Site do Jira"
              />
            </Field>
            <Field label="Projetos">
              <input
                className="in"
                style={{ width: 240 }}
                placeholder="CHK, PAY"
                value={draft.jira.projects}
                onChange={(e) => set('jira', { projects: e.target.value })}
                aria-label="Projetos"
              />
            </Field>
            <Field label="Como achar a história de design" hint="Instrução em texto livre para o agente.">
              <input
                className="in"
                style={{ width: '100%', fontFamily: 'var(--sans)' }}
                value={draft.jira.designHint}
                onChange={(e) => set('jira', { designHint: e.target.value })}
                aria-label="História de design"
              />
            </Field>
            <Field label="Anexos de protótipo">
              <input
                className="in"
                style={{ width: 200 }}
                value={draft.jira.prototypePattern}
                onChange={(e) => set('jira', { prototypePattern: e.target.value })}
                aria-label="Padrão de anexos"
              />
            </Field>
            <Field label="Tipo de subtask" hint="Só título e descrição são preenchidos.">
              <input
                className="in"
                style={{ width: 200 }}
                value={draft.jira.subtaskType}
                onChange={(e) => set('jira', { subtaskType: e.target.value })}
                aria-label="Tipo de subtask"
              />
            </Field>
          </section>

          <section id="cfg-repos" className="pn">
            <div className="ph">
              Repositórios
              <button
                className="btn spacer"
                onClick={() => set('repos', [...draft.repos, { name: '', path: '~/repos/', baseBranch: 'main', defaultScope: '' }])}
              >
                + Adicionar
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="t" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th className="hd">Nome</th>
                    <th className="hd">Caminho (Linux/WSL)</th>
                    <th className="hd">Branch base</th>
                    <th className="hd">Escopo padrão</th>
                    <th>
                      <span className="sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.repos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="mu">
                        Nenhum repositório. Adicione os clones que você usa (o orquestrador cria worktrees a partir deles).
                      </td>
                    </tr>
                  )}
                  {draft.repos.map((r, i) => {
                    const upd = (p: Partial<typeof r>): void =>
                      set(
                        'repos',
                        draft.repos.map((x, j) => (j === i ? { ...x, ...p } : x))
                      )
                    return (
                      <tr key={i}>
                        <td>
                          <input
                            className="in"
                            style={{ width: 150 }}
                            value={r.name}
                            placeholder="checkout-web"
                            onChange={(e) => upd({ name: e.target.value.trim() })}
                            aria-label="Nome"
                          />
                        </td>
                        <td>
                          <input
                            className="in"
                            style={{ width: 260 }}
                            value={r.path}
                            onChange={(e) => {
                              const path = e.target.value
                              const guess = path.split('/').filter(Boolean).pop() ?? ''
                              upd({ path, name: r.name || guess })
                            }}
                            aria-label="Caminho"
                          />
                        </td>
                        <td>
                          <input
                            className="in"
                            style={{ width: 110 }}
                            value={r.baseBranch}
                            onChange={(e) => upd({ baseBranch: e.target.value })}
                            aria-label="Branch base"
                          />
                        </td>
                        <td>
                          <input
                            className="in"
                            style={{ width: 130 }}
                            value={r.defaultScope}
                            onChange={(e) => upd({ defaultScope: e.target.value })}
                            aria-label="Escopo padrão"
                          />
                        </td>
                        <td>
                          <button
                            className="btn danger"
                            onClick={() =>
                              set(
                                'repos',
                                draft.repos.filter((_, j) => j !== i)
                              )
                            }
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Field label="Pasta das features" hint="Cada feature vira uma subpasta com os worktrees.">
              <input
                className="in"
                style={{ width: 260 }}
                value={draft.featuresRoot}
                onChange={(e) => setDraft({ ...draft, featuresRoot: e.target.value })}
                aria-label="Pasta das features"
              />
            </Field>
          </section>

          <section id="cfg-branches" className="pn">
            <div className="ph">Branches e commits (Conventional Commits)</div>
            <Field label="Padrão de branch" hint="{tipo} {escopo} {chave} {slug}">
              <input
                className="in"
                style={{ width: 360 }}
                value={draft.branches.branchPattern}
                onChange={(e) => set('branches', { branchPattern: e.target.value })}
                aria-label="Padrão de branch"
              />
            </Field>
            <Field label="Tipos permitidos">
              <input
                className="in"
                style={{ width: 360 }}
                value={draft.branches.types}
                onChange={(e) => set('branches', { types: e.target.value })}
                aria-label="Tipos"
              />
            </Field>
            <Field label="Padrão de commit" hint="{tipo} {escopo} {chave} {descricao}">
              <input
                className="in"
                style={{ width: 360 }}
                value={draft.branches.commitPattern}
                onChange={(e) => set('branches', { commitPattern: e.target.value })}
                aria-label="Padrão de commit"
              />
            </Field>
            <Field label="Tamanho máximo do slug">
              <input
                className="in"
                style={{ width: 80 }}
                type="number"
                min={10}
                max={80}
                value={draft.branches.slugMaxLength}
                onChange={(e) => set('branches', { slugMaxLength: Number(e.target.value) || 40 })}
                aria-label="Tamanho do slug"
              />
            </Field>
            <Field label="Pré-visualização">
              <div className="m" style={{ lineHeight: 1.7 }}>
                <div style={{ color: 'var(--link)' }}>{branchName(draft.branches.branchPattern, sample)}</div>
                <div>{commitMessage(draft.branches.commitPattern, sample)}</div>
              </div>
            </Field>
          </section>

          <section id="cfg-kiro" className="pn">
            <div className="ph">Kiro IDE</div>
            <Field label="Comando para abrir" hint="{workspaceHost} {workspace} {dirHost} {dir} {distro}">
              <input
                className="in"
                style={{ width: 420 }}
                value={draft.ide.openCommand}
                onChange={(e) => set('ide', { openCommand: e.target.value })}
                aria-label="Comando do Kiro"
              />
            </Field>
            <Field label="Executar o comando">
              <select
                className="in"
                value={draft.ide.runIn}
                onChange={(e) => set('ide', { runIn: e.target.value as 'host' | 'wsl' })}
                aria-label="Onde executar"
              >
                <option value="host">no Windows (host)</option>
                <option value="wsl">dentro do WSL</option>
              </select>
              <span className="mu small">
                No host, <span className="m">{'{workspaceHost}'}</span> vira <span className="m">\\wsl.localhost\…</span>
              </span>
            </Field>
            <Field label="Steering da feature">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.ide.generateSteering}
                  onChange={(e) => set('ide', { generateSteering: e.target.checked })}
                />
                gerar <span className="m">.kiro/steering/feature-context.md</span> na pasta da feature
              </label>
            </Field>
          </section>

          <section id="cfg-agentes" className="pn">
            <div className="ph">Agentes por etapa</div>
            <div className="pb mu small" style={{ borderBottom: '1px solid var(--border-soft)' }}>
              Cada etapa usa um prompt embutido. Para personalizar, aponte para um arquivo .md (caminho Linux/WSL); use os mesmos
              placeholders do prompt original, como <span className="m">{'{{key}}'}</span>, <span className="m">{'{{contextDir}}'}</span> e{' '}
              <span className="m">{'{{repoList}}'}</span>.
            </div>
            <table className="t">
              <thead>
                <tr>
                  <th className="hd">Etapa</th>
                  <th className="hd">Motor</th>
                  <th className="hd">Prompt personalizado</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((a) => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td className="m">{a.engine}</td>
                    <td>
                      <input
                        className="in"
                        style={{ width: 320 }}
                        placeholder="(embutido)"
                        value={draft.prompts[a.key] ?? ''}
                        onChange={(e) => setDraft({ ...draft, prompts: { ...draft.prompts, [a.key]: e.target.value } })}
                        aria-label={`Prompt ${a.label}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section id="cfg-execucao" className="pn">
            <div className="ph">Execução</div>
            <Field label="Execuções em paralelo">
              <span className="m">sem limite</span>
            </Field>
            <Field label="Notificações">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.execution.notifications}
                  onChange={(e) => set('execution', { notifications: e.target.checked })}
                />
                avisar quando um agente terminar ou precisar de mim
              </label>
            </Field>
            <Field label="Edições na IDE">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.execution.pauseOnUserChanges}
                  onChange={(e) => set('execution', { pauseOnUserChanges: e.target.checked })}
                />
                pausar o kiro-cli antes da próxima task se houver alterações não commitadas
              </label>
            </Field>
            <Field label="Onde parei">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.execution.autoOndeParei}
                  onChange={(e) => set('execution', { autoOndeParei: e.target.checked })}
                />
                atualizar automaticamente quando a execução parar
              </label>
            </Field>
            <Field label="Mudanças na história" hint="Para features em spec/dev. 0 = só pelo botão. Cada verificação usa o Claude Code.">
              <span>verificar a cada</span>
              <input
                className="in"
                style={{ width: 70 }}
                type="number"
                min={0}
                value={draft.execution.storyCheckMinutes}
                onChange={(e) => set('execution', { storyCheckMinutes: Number(e.target.value) || 0 })}
                aria-label="Intervalo"
              />
              <span>min</span>
            </Field>
          </section>
        </div>
      </div>
    </>
  )
}
