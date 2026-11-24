import { useState } from 'react'
import { STAGES, type Feature, type Stage } from '@shared/types'
import { DiffView, JobsPanel, Spinner, Tag } from '../components/ui'
import { useFeatureFile } from '../hooks'
import { api, featureState, since, useApp } from '../state'
import { BusinessTab } from './BusinessTab'
import { DevTab } from './DevTab'
import { SpecTab } from './SpecTab'
import { TechTab } from './TechTab'

function stepMark(f: Feature, s: Stage): { mark: string; tone: string } {
  const order = STAGES.findIndex((x) => x.id === s)
  const current = STAGES.findIndex((x) => x.id === f.stage)
  if (s !== 'pronto' && f[s].status === 'running') return { mark: '●', tone: 'var(--accent)' }
  if (s !== 'pronto' && f[s].status === 'error') return { mark: '●', tone: 'var(--err)' }
  if (order < current) return { mark: '✓', tone: 'var(--ok)' }
  if (order === current) return { mark: '●', tone: 'var(--warn)' }
  return { mark: '', tone: '' }
}

export function FeatureView({ featureKey, tab }: { featureKey: string; tab: Stage }): React.JSX.Element {
  const { features, jobs, go, act, attempt } = useApp()
  const f = features.find((x) => x.key === featureKey)
  const [showNote, setShowNote] = useState(false)
  const [checking, setChecking] = useState(false)

  if (!f) {
    return (
      <div className="content">
        <div className="empty">
          Feature {featureKey} não encontrada. <a onClick={() => go({ view: 'board' })}>Voltar ao board</a>
        </div>
      </div>
    )
  }
  const st = featureState(f, jobs)
  const setTab = (t: Stage): void => go({ view: 'feature', key: f.key, tab: t })

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Excluir a feature ${f.key} do orquestrador?`)) return
    const rm = window.confirm(
      `Remover também os worktrees e a pasta ${f.dir}?\n\nAs branches continuam nos repositórios. OK = remover pasta, Cancelar = manter arquivos.`
    )
    if (await attempt(() => api.deleteFeature(f.key, rm), `Feature ${f.key} excluída`)) go({ view: 'board' })
  }

  return (
    <>
      <div className="tabs">
        {STAGES.filter((s) => s.id !== 'pronto').map((s, i) => {
          const m = stepMark(f, s.id)
          return (
            <button key={s.id} className={`tab ${tab === s.id ? 'act' : ''}`} onClick={() => setTab(s.id)}>
              {m.mark && <span style={{ color: m.tone }}>{m.mark}</span>}
              {i + 1} {s.label}
            </button>
          )
        })}
      </div>
      <div className="titlebar">
        <span className="m mu">{f.key}</span>
        <span className="title">{f.title}</span>
        <Tag tone={st.tone}>{st.label}</Tag>
        <span className="mu small ellipsis" style={{ maxWidth: 420 }} title={st.detail}>
          {st.detail}
        </span>
        <div className="spacer hstack">
          <select
            className="in"
            aria-label="Etapa atual"
            value={f.stage}
            onChange={(e) => void act(() => api.setStage(f.key, e.target.value as Stage))}
            title="Mover para outra etapa"
          >
            {STAGES.map((s, i) => (
              <option key={s.id} value={s.id}>
                etapa: {i + 1} {s.label}
              </option>
            ))}
          </select>
          <button
            className="btn"
            disabled={checking}
            title={`Última verificação: ${since(f.storyCheckedAt)}`}
            onClick={async () => {
              setChecking(true)
              await act(() => api.checkStory(f.key))
              setChecking(false)
            }}
          >
            {checking ? <Spinner /> : null} Verificar história
          </button>
          <button className="btn" onClick={() => setShowNote(!showNote)}>
            Onde parei
          </button>
          <button className="btn" onClick={() => void act(() => api.openFolder(f.key))}>
            Abrir pasta
          </button>
          <button className="btn primary" onClick={() => void act(() => api.openInIde(f.key))}>
            Abrir no Kiro
          </button>
          <button className="btn danger" onClick={() => void remove()} title="Excluir feature">
            Excluir
          </button>
        </div>
      </div>
      <div className="scroll">
        <div className="content">
          {showNote && <OndeParei f={f} />}
          {f.drift && <DriftBanner f={f} />}
          {tab === 'negocio' && <BusinessTab f={f} />}
          {tab === 'tecnico' && <TechTab f={f} />}
          {tab === 'spec' && <SpecTab f={f} />}
          {(tab === 'dev' || tab === 'pronto') && <DevTab f={f} />}
        </div>
      </div>
      <JobsPanel jobs={jobs} featureKey={f.key} height={200} />
    </>
  )
}

function DriftBanner({ f }: { f: Feature }): React.JSX.Element {
  const { act } = useApp()
  const hasSpec = f.spec.status === 'done' || f.spec.approved || f.stage === 'dev' || f.stage === 'pronto'
  return (
    <section className="pn alert">
      <div className="ph">
        <Tag tone="err">jira</Tag>A história mudou depois do refinamento
        <span className="mu spacer m small" style={{ fontWeight: 400 }}>
          detectado {since(f.drift?.detectedAt)}
        </span>
      </div>
      <DiffView diff={f.drift?.diff ?? []} />
      <div className="hstack" style={{ padding: '10px 12px', borderTop: '1px solid var(--border-soft)' }}>
        <span className="mu small spacer" style={{ marginLeft: 0, marginRight: 'auto' }}>
          {hasSpec
            ? 'Atualize a spec para refletir a mudança, ou aceite como nova base.'
            : 'Reanalise o refinamento de negócio, ou aceite como nova base.'}
        </span>
        <button className="btn" onClick={() => void act(() => api.acceptDrift(f.key), 'Nova versão da história aceita como base')}>
          Aceitar como nova base
        </button>
        {!hasSpec && (
          <button className="btn" onClick={() => void act(() => api.runBusiness(f.key))}>
            Reanalisar negócio
          </button>
        )}
        {hasSpec && (
          <button className="btn primary" onClick={() => void act(() => api.updateSpecFromDrift(f.key))}>
            Atualizar spec com kiro-cli
          </button>
        )}
      </div>
    </section>
  )
}

function OndeParei({ f }: { f: Feature }): React.JSX.Element {
  const { jobs, act } = useApp()
  const running = jobs.find((j) => j.featureKey === f.key && j.kind === 'onde-parei' && j.status === 'running')
  const version = jobs.find((j) => j.featureKey === f.key && j.kind === 'onde-parei')?.endedAt
  const { text } = useFeatureFile(f.key, 'contexto/onde-parei.md', version)
  return (
    <section className="pn">
      <div className="ph">
        <span className="m">onde-parei.md</span>
        <button className="btn spacer" disabled={!!running} onClick={() => void act(() => api.ondeParei(f.key))}>
          {running ? <Spinner /> : null} Atualizar com Claude Code
        </button>
      </div>
      <div className="pb" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>
        {text ?? <span className="mu">Ainda não existe. Clique em atualizar para gerar o resumo.</span>}
      </div>
    </section>
  )
}
