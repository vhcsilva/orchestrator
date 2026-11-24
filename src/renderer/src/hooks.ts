import { useEffect, useRef, useState } from 'react'
import type { Job } from '@shared/types'
import { api } from './state'

/** Lê um arquivo da pasta da feature e recarrega quando `version` muda. */
export function useFeatureFile(
  key: string,
  rel: string | null,
  version: unknown
): { text: string | null; loading: boolean; reload: () => void } {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!rel) return
    let alive = true
    setLoading(true)
    api
      .readFeatureFile(key, rel)
      .then((t) => alive && setText(t))
      .catch(() => alive && setText(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [key, rel, version, nonce])
  return { text, loading, reload: () => setNonce((n) => n + 1) }
}

/** Última execução da feature entre os tipos informados. */
export function lastJob(jobs: Job[], key: string, kinds: (string | RegExp)[]): Job | undefined {
  return jobs.find((j) => j.featureKey === key && kinds.some((k) => (typeof k === 'string' ? j.kind === k : k.test(j.kind))))
}

/** Estado local com gravação atrasada (evita salvar a cada tecla). */
export function useDebouncedSave<T>(value: T, save: (v: T) => void, delay = 600): [T, (v: T) => void] {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const pending = useRef(value)
  const latest = useRef(save)
  latest.current = save
  useEffect(() => {
    if (!dirty.current) setLocal(value)
  }, [value])
  useEffect(
    () => () => {
      // grava o que estava pendente ao sair da tela
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) latest.current(pending.current)
    },
    []
  )
  const update = (v: T): void => {
    setLocal(v)
    pending.current = v
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      latest.current(v)
    }, delay)
  }
  return [local, update]
}
