// Tipos compartilhados entre o processo principal (Electron) e a interface.

export type Stage = 'negocio' | 'tecnico' | 'spec' | 'dev' | 'pronto'

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: 'negocio', label: 'negócio', short: 'NEG' },
  { id: 'tecnico', label: 'técnico', short: 'TEC' },
  { id: 'spec', label: 'spec', short: 'SPEC' },
  { id: 'dev', label: 'dev', short: 'DEV' },
  { id: 'pronto', label: 'pronto p/ PR', short: 'PR' }
]

export type Engine = 'claude' | 'kiro-cli' | 'git' | 'sistema'

// ---------------------------------------------------------------- Configuração

export interface RepoConfig {
  name: string
  /** Caminho Linux (dentro do WSL) do clone principal. Aceita ~ */
  path: string
  baseBranch: string
  defaultScope: string
}

export interface StagePromptOverrides {
  negocio?: string
  tecnico?: string
  subtasks?: string
  spec?: string
  specUpdate?: string
  task?: string
  ondeParei?: string
  historia?: string
  buscarHistoria?: string
}

export interface AppConfig {
  wsl: {
    /** Usar WSL para executar comandos (no Windows deve ficar ligado). */
    enabled: boolean
    /** Nome da distribuição. Vazio = distribuição padrão. */
    distro: string
    /** Trecho bash executado antes de cada comando (PATH, nvm…). */
    shellInit: string
  }
  claude: {
    command: string
    model: string
    /** Modelo para consultas rápidas (buscar história, verificar mudanças). Vazio = padrão. */
    quickModel: string
    /** Ferramentas liberadas no modo headless (--allowedTools). */
    allowedTools: string[]
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
    extraArgs: string
    maxBudgetUsd: number
  }
  kiro: {
    command: string
    trustAllTools: boolean
    /** Lista para --trust-tools quando trustAllTools = false. */
    trustTools: string
    extraArgs: string
  }
  jira: {
    siteUrl: string
    projects: string
    /** Como identificar a história de design entre as vinculadas. */
    designHint: string
    prototypePattern: string
    subtaskType: string
  }
  repos: RepoConfig[]
  /** Pasta (Linux) onde as features e seus worktrees são criados. */
  featuresRoot: string
  branches: {
    branchPattern: string
    commitPattern: string
    types: string
    slugMaxLength: number
  }
  ide: {
    /** Comando para abrir o Kiro. Placeholders: {workspace} {workspaceHost} {dir} {dirHost} {distro} */
    openCommand: string
    /** Onde executar o comando de abrir: no Windows (host) ou dentro do WSL. */
    runIn: 'host' | 'wsl'
    generateSteering: boolean
  }
  prompts: StagePromptOverrides
  execution: {
    notifications: boolean
    pauseOnUserChanges: boolean
    /** Intervalo de verificação de mudanças no Jira (min). 0 = só manual. */
    storyCheckMinutes: number
    autoOndeParei: boolean
  }
}

// ---------------------------------------------------------------- Feature

export type StepStatus = 'idle' | 'running' | 'waiting' | 'done' | 'error'

export interface FeatureRepo {
  name: string
  sourcePath: string
  base: string
  type: string
  scope: string
  branch: string
  /** Caminho Linux do worktree. */
  worktree: string
}

export type PointKind = 'divergencia' | 'duvida'
export type PointStatus = 'aberta' | 'respondida' | 'descartada'

export interface BusinessPoint {
  id: string
  kind: PointKind
  severity: 'alta' | 'media' | 'baixa'
  blocksDev: boolean
  title: string
  /** O que a história diz (divergências). */
  story?: string
  /** O que o design/protótipo mostra (divergências). */
  design?: string
  designSource?: string
  context?: string
  relatedTo?: string[]
  /** Ponto adicionado manualmente por você. */
  manual?: boolean
}

export interface PointAnswer {
  status: PointStatus
  who: string
  when: string
  text: string
}

export interface SourceRef {
  kind: string
  ref: string
  label: string
}

export interface BusinessReport {
  summary: string
  sources: SourceRef[]
  points: BusinessPoint[]
}

export interface Dependency {
  need: string
  origin: string
  owner: string
  confidence: 'alta' | 'media' | 'baixa'
  notes?: string
}

export interface AgentQuestion {
  id: string
  question: string
  context?: string
  blocking: boolean
}

export interface SubtaskDraft {
  id: string
  title: string
  description: string
  repo?: string
  blockedBy?: string
}

export interface TechReport {
  summary: string
  dependencies: Dependency[]
  questions: AgentQuestion[]
  subtasks: SubtaskDraft[]
}

export interface StoryDrift {
  detectedAt: string
  diff: DiffLine[]
  impact?: string
}

export interface DiffLine {
  op: ' ' | '+' | '-'
  text: string
}

export interface SpecTask {
  id: string
  title: string
  done: boolean
  inProgress: boolean
  depth: number
  line: number
}

export interface Feature {
  key: string
  title: string
  createdAt: string
  updatedAt: string
  stage: Stage
  /** Pasta Linux da feature (contém worktrees, contexto/ e .kiro/). */
  dir: string
  repos: FeatureRepo[]
  linked: LinkedIssue[]
  drift?: StoryDrift
  storyCheckedAt?: string
  negocio: {
    status: StepStatus
    report?: BusinessReport
    answers: Record<string, PointAnswer>
    manualPoints: BusinessPoint[]
    notes: string
    lastRunAt?: string
    error?: string
  }
  tecnico: {
    status: StepStatus
    report?: TechReport
    answers: Record<string, string>
    sessionId?: string
    selectedSubtasks: Record<string, boolean>
    createdSubtasks: { id: string; key: string }[]
    lastRunAt?: string
    error?: string
  }
  spec: {
    status: StepStatus
    name: string
    approved: boolean
    executeAfterApprove: boolean
    confirmEachTask: boolean
    lastRunAt?: string
    error?: string
  }
  dev: {
    status: StepStatus
    currentTask?: string
    pauseRequested: boolean
    message?: string
    error?: string
  }
}

export interface LinkedIssue {
  key: string
  title: string
  relation: string
  isDesign: boolean
  attachments: string[]
  figma: string[]
}

export interface NewFeatureInput {
  key: string
  title: string
  linked: LinkedIssue[]
  repos: { name: string; base: string; type: string; scope: string; branch: string }[]
  startBusiness: boolean
  openIde: boolean
}

export interface StoryLookup {
  key: string
  title: string
  status: string
  linked: LinkedIssue[]
}

// ---------------------------------------------------------------- Jobs

export type JobStatus = 'running' | 'ok' | 'error' | 'cancelled'

export interface Job {
  id: number
  featureKey: string
  kind: string
  engine: Engine
  status: JobStatus
  startedAt: string
  endedAt?: string
  /** Última linha de progresso legível. */
  activity: string
  sessionId?: string
  costUsd?: number
  error?: string
}

export interface JobLogLine {
  jobId: number
  at: string
  text: string
  stream: 'out' | 'err' | 'info'
}

export interface ToolCheck {
  ok: boolean
  output: string
}

export interface EnvStatus {
  platform: string
  wsl: ToolCheck & { distro: string; home: string }
  claude: ToolCheck
  kiro: ToolCheck
  git: ToolCheck
}

// ---------------------------------------------------------------- API (preload)

export interface OrchestratorApi {
  getConfig(): Promise<AppConfig>
  saveConfig(cfg: AppConfig): Promise<AppConfig>
  configPath(): Promise<string>
  checkEnv(full?: boolean): Promise<EnvStatus>

  listFeatures(): Promise<Feature[]>
  lookupStory(key: string): Promise<StoryLookup>
  createFeature(input: NewFeatureInput): Promise<Feature>
  updateFeature(key: string, patch: FeaturePatch): Promise<Feature>
  deleteFeature(key: string, removeWorktrees: boolean): Promise<void>
  readFeatureFile(key: string, relPath: string): Promise<string | null>
  specTasks(key: string): Promise<SpecTask[]>

  runBusiness(key: string): Promise<void>
  runTechnical(key: string): Promise<void>
  answerTechnical(key: string, answers: Record<string, string>): Promise<void>
  createSubtasks(key: string): Promise<void>
  generateSpec(key: string): Promise<void>
  updateSpecFromDrift(key: string): Promise<void>
  checkStory(key: string): Promise<void>
  acceptDrift(key: string): Promise<void>
  approveSpec(key: string): Promise<void>
  startDev(key: string): Promise<void>
  pauseDev(key: string): Promise<void>
  ondeParei(key: string): Promise<void>
  setStage(key: string, stage: Stage): Promise<void>

  openInIde(key: string): Promise<void>
  openFolder(key: string): Promise<void>

  listJobs(): Promise<Job[]>
  jobLog(id: number): Promise<JobLogLine[]>
  cancelJob(id: number): Promise<void>

  onFeatures(cb: (features: Feature[]) => void): () => void
  onJobs(cb: (jobs: Job[]) => void): () => void
  onJobLog(cb: (line: JobLogLine) => void): () => void
}

export interface FeaturePatch {
  negocio?: Partial<Pick<Feature['negocio'], 'answers' | 'manualPoints' | 'notes'>>
  tecnico?: Partial<Pick<Feature['tecnico'], 'answers' | 'selectedSubtasks'>>
  spec?: Partial<Pick<Feature['spec'], 'executeAfterApprove' | 'confirmEachTask'>>
  title?: string
}
