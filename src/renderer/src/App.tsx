import { useEffect, useState } from 'react'
import { STAGES, type EnvStatus } from '@shared/types'
import { Dot, Icon } from './components/ui'
import { api, featureState, useApp } from './state'
import { Board } from './views/Board'
import { FeatureView } from './views/FeatureView'
import { NewFeature } from './views/NewFeature'
import { Settings, SETTINGS_SECTIONS } from './views/Settings'

export function App(): React.JSX.Element {
  const { route, go } = useApp()
  return (
    <div className="app">
      <div className="app-body">
        <nav className="activity" aria-label="Atividades">
          <button
            className={`ico ${route.view === 'board' || route.view === 'feature' ? 'on' : ''}`}
            aria-label="Board"
            title="Board"
            onClick={() => go({ view: 'board' })}
          >
            <Icon name="board" />
          </button>
          <button
            className={`ico ${route.view === 'new' ? 'on' : ''}`}
            aria-label="Nova feature"
            title="Nova feature"
            onClick={() => go({ view: 'new' })}
          >
            <Icon name="plus" />
          </button>
          <button
            className={`ico ${route.view === 'settings' ? 'on' : ''}`}
            aria-label="Configurações"
            title="Configurações"
            style={{ marginTop: 'auto' }}
            onClick={() => go({ view: 'settings' })}
          >
            <Icon name="gear" />
          </button>
        </nav>
        {route.view === 'settings' ? <SettingsNav /> : <FeatureList />}
        <main className="main">
          {route.view === 'board' && <Board />}
          {route.view === 'new' && <NewFeature />}
          {route.view === 'settings' && <Settings />}
          {route.view === 'feature' && <FeatureView key={route.key} featureKey={route.key} tab={route.tab} />}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}

function FeatureList(): React.JSX.Element {
  const { features, jobs, route, go } = useApp()
  return (
    <aside className="side">
      <div className="side-head hd">
        Features
        <span className="m spacer" style={{ fontWeight: 400 }}>
          {features.length}
        </span>
      </div>
      <div className="side-list">
        {features.length === 0 && (
          <div className="mu small" style={{ padding: 12 }}>
            Nenhuma feature. Use <a onClick={() => go({ view: 'new' })}>Nova feature</a>.
          </div>
        )}
        {features.map((f) => {
          const st = featureState(f, jobs)
          const short = STAGES.find((s) => s.id === f.stage)?.short
          return (
            <button
              key={f.key}
              className={`row ${route.view === 'feature' && route.key === f.key ? 'sel' : ''}`}
              title={`${st.label}${st.detail ? ' — ' + st.detail : ''}`}
              onClick={() => go({ view: 'feature', key: f.key, tab: f.stage })}
            >
              <Dot tone={st.tone} />
              <span className="m mu">{f.key}</span>
              <span className="ellipsis">{f.title}</span>
              <span className="m mu" style={{ fontSize: 10 }}>
                {short}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mu" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 11, lineHeight: 1.8 }}>
        <Dot tone="run" /> rodando&nbsp;&nbsp;
        <Dot tone="warn" /> aguardando você&nbsp;&nbsp;
        <Dot tone="err" /> alerta
      </div>
    </aside>
  )
}

function SettingsNav(): React.JSX.Element {
  const { config } = useApp()
  const [path, setPath] = useState('')
  useEffect(() => {
    void api.configPath().then(setPath)
  }, [])
  return (
    <aside className="side">
      <div className="side-head hd">Configurações</div>
      <div className="side-list">
        {SETTINGS_SECTIONS.map((s) => (
          <button key={s.id} className="row" onClick={() => document.getElementById(`cfg-${s.id}`)?.scrollIntoView({ behavior: 'smooth' })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="m mu" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 11, wordBreak: 'break-all' }}>
        {path || (config ? '' : 'carregando…')}
      </div>
    </aside>
  )
}

function StatusBar(): React.JSX.Element {
  const { jobs, config } = useApp()
  const [env, setEnv] = useState<EnvStatus | null>(null)
  useEffect(() => {
    void api
      .checkEnv()
      .then(setEnv)
      .catch(() => undefined)
  }, [config?.wsl.enabled, config?.wsl.distro, config?.claude.command, config?.kiro.command])
  const running = jobs.filter((j) => j.status === 'running').length
  const mark = (ok?: boolean): React.JSX.Element =>
    env ? <span style={{ color: ok ? 'var(--ok)' : 'var(--err)' }}>●</span> : <span className="mu">○</span>
  return (
    <footer className="status">
      <span>{config?.wsl.enabled ? `WSL: ${env?.wsl.distro || config.wsl.distro || '…'}` : `local: ${env?.platform ?? '…'}`}</span>
      <span>{mark(env?.wsl.ok)} shell</span>
      <span>{mark(env?.claude.ok)} claude</span>
      <span>{mark(env?.kiro.ok)} kiro-cli</span>
      <span>{mark(env?.git.ok)} git</span>
      <span className="spacer">{running ? `${running} execução(ões) ativa(s)` : 'nenhuma execução ativa'}</span>
    </footer>
  )
}
