import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { LogFile, LogKind } from '../../shared/types'
import { redact } from '../line-scrub'

const DIRS: Record<LogKind, string> = { log: 'logs', crash: 'crash-reports' }
const NAME = /^[\w.+ -]+\.(log|log\.gz|txt)$/
const MAX_LINES = 25_000
const MAX_BYTES = 10 * 1024 * 1024
const UPLOAD_URL = 'https://api.mclo.gs/1/log'

export function listLogs(gameDir: string): LogFile[] {
  const out: LogFile[] = []
  for (const kind of Object.keys(DIRS) as LogKind[]) {
    const dir = join(gameDir, DIRS[kind])
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!NAME.test(name)) continue
      const st = statSync(join(dir, name))
      if (st.isFile()) out.push({ kind, name, size: st.size, mtime: st.mtimeMs })
    }
  }
  return out.sort((a, b) => Number(b.name === 'latest.log') - Number(a.name === 'latest.log') || b.mtime - a.mtime)
}

export function trimLog(text: string): string {
  let lines = text.split(/\r?\n/)
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES)
  let out = lines.join('\n')
  while (Buffer.byteLength(out) > MAX_BYTES) out = out.slice(out.indexOf('\n', out.length >> 3) + 1)
  return out
}

export function hideUser(text: string): string {
  return text.replace(/([A-Za-z]:[\\/]+Users[\\/]+|\/(?:home|Users)\/)[^\\/\s"']+/g, '$1user')
}

export async function readLog(gameDir: string, kind: LogKind, name: string, secrets: readonly string[]): Promise<string> {
  if (!(kind in DIRS) || !NAME.test(name)) throw new Error('Unknown log file.')
  const raw = await readFile(join(gameDir, DIRS[kind], name))
  const text = name.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
  return trimLog(hideUser(redact(text, secrets)))
}

export async function deleteLog(gameDir: string, kind: LogKind, name: string): Promise<void> {
  if (!(kind in DIRS) || !NAME.test(name)) throw new Error('Unknown log file.')
  await rm(join(gameDir, DIRS[kind], name))
}

export async function cleanLogs(gameDir: string): Promise<number> {
  const old = listLogs(gameDir).filter((l) => l.name !== 'latest.log')
  await Promise.all(old.map((l) => rm(join(gameDir, DIRS[l.kind], l.name))))
  return old.length
}

export async function uploadLog(content: string, post: typeof fetch = fetch): Promise<string> {
  const res = await post(UPLOAD_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, source: 'MCSR Client' })
  })
  const body = (await res.json()) as { success?: boolean; url?: string; error?: string }
  if (!body.success || !body.url) throw new Error(body.error ?? `mclo.gs answered ${res.status}`)
  return body.url
}
