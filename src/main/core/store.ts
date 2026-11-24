import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Feature } from '@shared/types'

/** Estado das features, salvo em JSON (um arquivo por feature) na pasta de dados do app. */
export class FeatureStore {
  private features = new Map<string, Feature>()
  private listeners: ((f: Feature[]) => void)[] = []
  private writes = new Map<string, Promise<void>>()

  constructor(private dir: string) {}

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    for (const name of await fs.readdir(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const f = JSON.parse(await fs.readFile(join(this.dir, name), 'utf8')) as Feature
        // execuções interrompidas pelo fechamento do app
        for (const step of [f.negocio, f.tecnico, f.spec, f.dev]) {
          if (step.status === 'running') {
            step.status = 'error'
            step.error = 'interrompido: o app foi fechado durante a execução'
          }
        }
        this.features.set(f.key, f)
      } catch {
        // arquivo inválido: ignora
      }
    }
  }

  list(): Feature[] {
    return [...this.features.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(key: string): Feature {
    const f = this.features.get(key)
    if (!f) throw new Error(`Feature ${key} não encontrada`)
    return f
  }

  has(key: string): boolean {
    return this.features.has(key)
  }

  onChange(cb: (f: Feature[]) => void): void {
    this.listeners.push(cb)
  }

  private persist(f: Feature): Promise<void> {
    const prev = this.writes.get(f.key) ?? Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const file = join(this.dir, `${f.key}.json`)
        await fs.writeFile(file + '.tmp', JSON.stringify(f, null, 2), 'utf8')
        await fs.rename(file + '.tmp', file)
      })
    this.writes.set(f.key, next)
    return next
  }

  async put(f: Feature): Promise<Feature> {
    f.updatedAt = new Date().toISOString()
    this.features.set(f.key, f)
    await this.persist(f)
    this.emit()
    return f
  }

  /** Altera uma feature com uma função e salva. */
  async mutate(key: string, fn: (f: Feature) => void): Promise<Feature> {
    const f = structuredClone(this.get(key))
    fn(f)
    return this.put(f)
  }

  async remove(key: string): Promise<void> {
    this.features.delete(key)
    await fs.rm(join(this.dir, `${key}.json`), { force: true })
    this.emit()
  }

  private emit(): void {
    const all = this.list()
    for (const l of this.listeners) l(all)
  }
}
