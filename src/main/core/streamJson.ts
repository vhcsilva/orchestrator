// Interpreta a saída `--output-format stream-json` do Claude Code e a saída de texto do kiro-cli.

export interface ClaudeResult {
  isError: boolean
  text: string
  sessionId?: string
  costUsd?: number
  durationMs?: number
}

export interface ParsedEvent {
  /** Linha legível para o log. */
  log?: string
  /** Resumo curto para a coluna "atividade". */
  activity?: string
  sessionId?: string
  result?: ClaudeResult
}

function short(text: string, max = 140): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

function describeTool(name: string, input: Record<string, unknown> = {}): string {
  const pick = (k: string): string | undefined => (typeof input[k] === 'string' ? (input[k] as string) : undefined)
  const arg =
    pick('file_path') ?? pick('path') ?? pick('pattern') ?? pick('command') ?? pick('url') ?? pick('issueIdOrKey') ?? pick('query')
  const tool = name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : name
  return arg ? `${tool} ${short(arg, 100)}` : tool
}

export function parseClaudeLine(line: string): ParsedEvent {
  const trimmed = line.trim()
  if (!trimmed) return {}
  let ev: Record<string, any>
  try {
    ev = JSON.parse(trimmed)
  } catch {
    return { log: trimmed }
  }
  switch (ev.type) {
    case 'system': {
      if (ev.subtype === 'init') {
        const mcps = Array.isArray(ev.mcp_servers) ? ev.mcp_servers.map((s: any) => `${s.name}:${s.status}`).join(' ') : ''
        return {
          sessionId: ev.session_id,
          log: `sessão ${ev.session_id ?? ''} · modelo ${ev.model ?? '?'}${mcps ? ' · mcp ' + mcps : ''}`,
          activity: 'sessão iniciada'
        }
      }
      return {}
    }
    case 'assistant': {
      const parts: any[] = ev.message?.content ?? []
      const logs: string[] = []
      let activity: string | undefined
      for (const p of parts) {
        if (p.type === 'text' && p.text?.trim()) {
          logs.push(p.text.trim())
          activity = short(p.text)
        } else if (p.type === 'tool_use') {
          const d = describeTool(p.name, p.input)
          logs.push(`→ ${d}`)
          activity = d
        }
      }
      return { log: logs.join('\n') || undefined, activity }
    }
    case 'user': {
      const parts: any[] = ev.message?.content ?? []
      const errors = parts.filter((p) => p.type === 'tool_result' && p.is_error)
      if (!errors.length) return {}
      const text = errors.map((e) => (typeof e.content === 'string' ? e.content : JSON.stringify(e.content))).join(' ')
      return { log: `✗ ferramenta falhou: ${short(text, 300)}` }
    }
    case 'result': {
      const result: ClaudeResult = {
        isError: Boolean(ev.is_error) || (ev.subtype && ev.subtype !== 'success'),
        text: typeof ev.result === 'string' ? ev.result : '',
        sessionId: ev.session_id,
        costUsd: ev.total_cost_usd,
        durationMs: ev.duration_ms
      }
      const cost = typeof result.costUsd === 'number' ? ` · US$ ${result.costUsd.toFixed(2)}` : ''
      return {
        result,
        sessionId: ev.session_id,
        log: `${result.isError ? 'falhou' : 'concluído'} (${ev.subtype ?? ''})${cost}`,
        activity: result.isError ? 'falhou' : 'concluído'
      }
    }
    default:
      return {}
  }
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(/\r/g, '')
}

export function parseKiroLine(line: string): ParsedEvent {
  const clean = stripAnsi(line).trim()
  if (!clean) return {}
  return { log: clean, activity: short(clean) }
}
