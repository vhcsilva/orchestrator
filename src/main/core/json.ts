/** Extrai o primeiro objeto JSON de um texto (aceita bloco ```json). */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(text)
  const candidates = fenced ? [fenced[1], text] : [text]
  for (const c of candidates) {
    const start = c.indexOf('{')
    const end = c.lastIndexOf('}')
    if (start < 0 || end <= start) continue
    try {
      return JSON.parse(c.slice(start, end + 1)) as T
    } catch {
      // tenta o próximo candidato
    }
  }
  return null
}
