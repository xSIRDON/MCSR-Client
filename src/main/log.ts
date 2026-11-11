import type { LogLine } from '../shared/types'

const MAX_LINES = 2000
const buffer: LogLine[] = []
let sink: ((line: LogLine) => void) | null = null

export function onLog(cb: (line: LogLine) => void): void {
  sink = cb
}

export function pushLog(source: LogLine['source'], text: string): void {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (line.length === 0) continue
    const entry: LogLine = { source, text: line }
    buffer.push(entry)
    if (buffer.length > MAX_LINES) buffer.shift()
    sink?.(entry)
  }
}

export function logFailure(what: string, e: unknown): void {
  pushLog('system', `${what}: ${e instanceof Error ? e.message : String(e)}`)
}

export function logHistory(): LogLine[] {
  return buffer.slice()
}

export function clearLog(): void {
  buffer.length = 0
}
