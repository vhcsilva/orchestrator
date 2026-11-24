import type { BusinessPoint, BusinessReport, LinkedIssue, StoryLookup, TechReport } from '@shared/types'

// Os agentes gravam JSON; aqui garantimos o formato antes de usar na interface.

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v === undefined || v === null ? d : String(v))
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const sev = (v: unknown): 'alta' | 'media' | 'baixa' => {
  const s = str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return s === 'alta' || s === 'high' ? 'alta' : s === 'baixa' || s === 'low' ? 'baixa' : 'media'
}

export function normalizePoint(raw: any, idx: number): BusinessPoint {
  const kindRaw = str(raw?.kind).toLowerCase()
  const kind = kindRaw.startsWith('div') ? 'divergencia' : 'duvida'
  return {
    id: str(raw?.id) || `${kind === 'divergencia' ? 'D' : 'Q'}${idx + 1}`,
    kind,
    severity: sev(raw?.severity),
    blocksDev: Boolean(raw?.blocksDev),
    title: str(raw?.title, '(sem título)'),
    story: str(raw?.story) || undefined,
    design: str(raw?.design) || undefined,
    designSource: str(raw?.designSource) || undefined,
    context: str(raw?.context) || undefined,
    relatedTo: arr(raw?.relatedTo)
      .map((x) => str(x))
      .filter(Boolean),
    manual: raw?.manual ? true : undefined
  }
}

export function normalizeBusinessReport(raw: any): BusinessReport {
  return {
    summary: str(raw?.summary),
    sources: arr(raw?.sources).map((s: any) => ({ kind: str(s?.kind), ref: str(s?.ref), label: str(s?.label) })),
    points: arr(raw?.points).map(normalizePoint)
  }
}

export function normalizeTechReport(raw: any): TechReport {
  return {
    summary: str(raw?.summary),
    dependencies: arr(raw?.dependencies).map((d: any) => ({
      need: str(d?.need),
      origin: str(d?.origin),
      owner: str(d?.owner),
      confidence: sev(d?.confidence),
      notes: str(d?.notes) || undefined
    })),
    questions: arr(raw?.questions).map((q: any, i) => ({
      id: str(q?.id) || `P${i + 1}`,
      question: str(q?.question),
      context: str(q?.context) || undefined,
      blocking: Boolean(q?.blocking)
    })),
    subtasks: arr(raw?.subtasks).map((s: any, i) => ({
      id: str(s?.id) || `S${i + 1}`,
      title: str(s?.title),
      description: str(s?.description),
      repo: str(s?.repo) || undefined,
      blockedBy: str(s?.blockedBy) || undefined
    }))
  }
}

export function normalizeLinked(raw: any): LinkedIssue {
  return {
    key: str(raw?.key),
    title: str(raw?.title),
    relation: str(raw?.relation),
    isDesign: Boolean(raw?.isDesign),
    attachments: arr(raw?.attachments)
      .map((x) => str(x))
      .filter(Boolean),
    figma: arr(raw?.figma)
      .map((x) => str(x))
      .filter(Boolean)
  }
}

export function normalizeLookup(raw: any, key: string): StoryLookup {
  return {
    key: str(raw?.key) || key,
    title: str(raw?.title),
    status: str(raw?.status),
    linked: arr(raw?.linked)
      .map(normalizeLinked)
      .filter((l) => l.key)
  }
}
