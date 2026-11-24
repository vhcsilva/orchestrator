import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppConfig, FeaturePatch, NewFeatureInput, Stage } from '@shared/types'
import { ConfigStore } from './core/config'
import { Executor } from './core/executor'
import { GitService } from './core/git'
import { JobManager } from './core/jobs'
import { expandHome } from './core/paths'
import { PromptLibrary } from './core/prompts'
import { FeatureStore } from './core/store'
import { Orchestrator } from './orchestrator'

const DATA_DIR = process.env.ORQUESTRADOR_HOME || join(homedir(), '.orquestrador')

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1B1D21',
    title: 'Orquestrador',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

async function bootstrap(): Promise<void> {
  const config = new ConfigStore(DATA_DIR)
  const cfg = await config.load()
  const exec = new Executor({ viaWsl: cfg.wsl.enabled, distro: cfg.wsl.distro, shellInit: cfg.wsl.shellInit })
  const env = await exec.detectEnv()
  if (!env.ok) console.warn('[orquestrador] ambiente Linux/WSL não respondeu:', env.error)

  const jobs = new JobManager(exec, DATA_DIR)
  await jobs.load()
  const store = new FeatureStore(join(DATA_DIR, 'features'))
  await store.load()
  const git = new GitService(exec)
  const prompts = new PromptLibrary((p) => exec.readText(expandHome(p, exec.env.home)))

  const orch = new Orchestrator({
    config,
    exec,
    jobs,
    store,
    git,
    prompts,
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title: `Orquestrador · ${title}`, body }).show()
    },
    openPath: async (p) => {
      const err = await shell.openPath(p)
      if (err) throw new Error(err)
    }
  })
  orch.startStoryWatcher()

  store.onChange((features) => send('features', features))
  jobs.onJobs((list) => send('jobs', list))
  jobs.onLog((line) => send('job-log', line))

  // Ações longas rodam em segundo plano; a interface acompanha pelo estado e pelos jobs.
  const background = (fn: () => Promise<unknown>): Promise<void> => {
    fn().catch((err) => console.error('[orquestrador]', err))
    return Promise.resolve()
  }

  const handlers: Record<string, (...args: any[]) => unknown> = {
    getConfig: () => config.get(),
    saveConfig: async (c: AppConfig) => {
      const saved = await config.save(c)
      exec.update({ viaWsl: saved.wsl.enabled, distro: saved.wsl.distro, shellInit: saved.wsl.shellInit })
      await exec.detectEnv()
      return saved
    },
    configPath: () => config.file,
    checkEnv: (full?: boolean) => orch.checkEnv(Boolean(full)),
    listFeatures: () => store.list(),
    lookupStory: (key: string) => orch.lookupStory(key),
    createFeature: (i: NewFeatureInput) => orch.createFeature(i),
    updateFeature: (key: string, patch: FeaturePatch) => orch.updateFeature(key, patch),
    deleteFeature: (key: string, rm: boolean) => orch.deleteFeature(key, rm),
    readFeatureFile: (key: string, rel: string) => orch.readFeatureFile(key, rel),
    specTasks: (key: string) => orch.specTasks(key),
    runBusiness: (key: string) => background(() => orch.runBusiness(key)),
    runTechnical: (key: string) => background(() => orch.runTechnical(key)),
    answerTechnical: (key: string, a: Record<string, string>) => background(() => orch.answerTechnical(key, a)),
    createSubtasks: (key: string) => orch.createSubtasks(key),
    generateSpec: (key: string) => background(() => orch.generateSpec(key)),
    updateSpecFromDrift: (key: string) => background(() => orch.updateSpecFromDrift(key)),
    checkStory: (key: string) => orch.checkStory(key),
    acceptDrift: (key: string) => orch.acceptDrift(key),
    approveSpec: (key: string) => orch.approveSpec(key),
    startDev: (key: string) => background(() => orch.startDev(key)),
    pauseDev: (key: string) => orch.pauseDev(key),
    ondeParei: (key: string) => orch.ondeParei(key),
    setStage: (key: string, stage: Stage) => orch.setStage(key, stage),
    openInIde: (key: string) => orch.openInIde(key),
    openFolder: (key: string) => orch.openFolder(key),
    listJobs: () => jobs.list(),
    jobLog: (id: number) => jobs.log(id),
    cancelJob: (id: number) => jobs.cancel(id)
  }
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(name, async (_e, ...args) => fn(...args))
  }

  app.on('before-quit', () => orch.stop())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.setAppUserModelId('dev.vhcsilva.orquestrador')

app.whenReady().then(async () => {
  await bootstrap()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
