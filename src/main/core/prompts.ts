import type { StagePromptOverrides } from '@shared/types'
import historiaFormato from '../prompts/_historia-formato.md?raw'
import buscarHistoria from '../prompts/buscar-historia.md?raw'
import historia from '../prompts/historia.md?raw'
import negocio from '../prompts/negocio.md?raw'
import negocioReanalise from '../prompts/negocio-reanalise.md?raw'
import ondeParei from '../prompts/onde-parei.md?raw'
import spec from '../prompts/spec.md?raw'
import specUpdate from '../prompts/spec-update.md?raw'
import subtasks from '../prompts/subtasks.md?raw'
import task from '../prompts/task.md?raw'
import tecnico from '../prompts/tecnico.md?raw'
import tecnicoRespostas from '../prompts/tecnico-respostas.md?raw'

export const BUILTIN_PROMPTS = {
  historiaFormato,
  buscarHistoria,
  historia,
  negocio,
  negocioReanalise,
  ondeParei,
  spec,
  specUpdate,
  subtasks,
  task,
  tecnico,
  tecnicoRespostas
}

export type PromptName = keyof typeof BUILTIN_PROMPTS

/** Prompts que podem ser substituídos por um arquivo do usuário (Configurações › Agentes). */
export const OVERRIDABLE: Partial<Record<PromptName, keyof StagePromptOverrides>> = {
  buscarHistoria: 'buscarHistoria',
  historia: 'historia',
  negocio: 'negocio',
  tecnico: 'tecnico',
  subtasks: 'subtasks',
  spec: 'spec',
  specUpdate: 'specUpdate',
  task: 'task',
  ondeParei: 'ondeParei'
}

/** Substitui {{nome}}. Placeholders sem valor ficam vazios. */
export function render(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

export class PromptLibrary {
  constructor(private readFile: (linuxPath: string) => Promise<string | null>) {}

  async get(name: PromptName, overrides: StagePromptOverrides): Promise<string> {
    const key = OVERRIDABLE[name]
    const path = key ? overrides[key] : undefined
    if (path && path.trim()) {
      const custom = await this.readFile(path.trim())
      if (custom) return custom
    }
    return BUILTIN_PROMPTS[name]
  }
}
