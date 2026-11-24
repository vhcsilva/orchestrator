import { contextBridge, ipcRenderer } from 'electron'
import type { OrchestratorApi } from '@shared/types'

const invoke =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args)

const subscribe =
  <T>(channel: string) =>
  (cb: (v: T) => void) => {
    const listener = (_e: unknown, v: T): void => cb(v)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }

const methods = [
  'getConfig',
  'saveConfig',
  'configPath',
  'checkEnv',
  'listFeatures',
  'lookupStory',
  'createFeature',
  'updateFeature',
  'deleteFeature',
  'readFeatureFile',
  'specTasks',
  'runBusiness',
  'runTechnical',
  'answerTechnical',
  'createSubtasks',
  'generateSpec',
  'updateSpecFromDrift',
  'checkStory',
  'acceptDrift',
  'approveSpec',
  'startDev',
  'pauseDev',
  'ondeParei',
  'setStage',
  'openInIde',
  'openFolder',
  'listJobs',
  'jobLog',
  'cancelJob'
] as const

const api = Object.fromEntries(methods.map((m) => [m, invoke(m)])) as unknown as OrchestratorApi
api.onFeatures = subscribe('features')
api.onJobs = subscribe('jobs')
api.onJobLog = subscribe('job-log')

contextBridge.exposeInMainWorld('api', api)
