// A small in-memory console buffer. The game's stdout/stderr and the client's
// own lifecycle messages are pushed here; the renderer reads the history on mount
// and subscribes to new lines for a live tail.

import type { LogLine } from '../shared/types'

const MAX_LINES = 2000
const buffer: LogLine[] = []
let sink: ((line: LogLine) => void) | null = null

export function onLog(cb: (line: LogLine) => void): void {
  sink = cb
}

/** Append output (may contain multiple lines) from a given source. */
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

export function logHistory(): LogLine[] {
  return buffer.slice()
}

export function clearLog(): void {
  buffer.length = 0
}
