import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'

const MAX_ENTRIES = 30_000
const MAX_BYTES = 256 * 1024

const dir = (): string => join(paths.root(), 'match-cache')

function fileFor(id: unknown): string | null {
  const n = typeof id === 'number' ? id : Number(id)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return join(dir(), `${n}.json`)
}

export function getCachedMatch(id: unknown): unknown | null {
  const file = fileFor(id)
  if (!file) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

let writes = 0

export function putCachedMatch(id: unknown, match: unknown): void {
  const file = fileFor(id)
  if (!file || !match || typeof match !== 'object' || (match as { id?: unknown }).id !== Number(id)) return
  const text = JSON.stringify(match)
  if (text.length > MAX_BYTES) return
  try {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(file, text, 'utf8')
    if (++writes % 500 === 0) prune()
  } catch {
  }
}

function prune(): void {
  const names = readdirSync(dir())
  if (names.length <= MAX_ENTRIES) return
  const byAge = names
    .map((n) => ({ n, t: statSync(join(dir(), n)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
  for (const { n } of byAge.slice(0, names.length - MAX_ENTRIES)) rmSync(join(dir(), n), { force: true })
}
