import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'

export type SkinKind = 'avatar' | 'body'

const TTL_MS = 6 * 60 * 60 * 1000
const memCache = new Map<string, { url: string; ts: number }>()
const inflight = new Map<string, Promise<string | null>>()

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 4).equals(PNG_SIG)
}

function cacheDir(): string {
  return join(paths.root(), 'skins')
}
function cacheFile(key: string): string {
  return join(cacheDir(), `${key}.png`)
}

const MAX_CONCURRENT = 4
let active = 0
const waiters: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiters.shift()?.()
  }
}

async function tryFetch(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (isPng(buf)) return buf
      }
    } catch {
    }
  }
  return null
}

async function fetchFirst(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    const buf = await tryFetch(url)
    if (buf) return buf
  }
  return null
}

function dashed(raw: string): string {
  return /^[0-9a-fA-F]{32}$/.test(raw)
    ? raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
    : raw
}

function hosts(raw: string, size: number, kind: SkinKind): string[] {
  const d = dashed(raw)
  return kind === 'body'
    ? [
        `https://minotar.net/armor/body/${raw}/${size}`,
        `https://mc-heads.net/body/${raw}/${size}`,
        `https://crafatar.com/renders/body/${d}?size=${size}&overlay`,
        `https://visage.surgeplay.com/full/${size}/${raw}`
      ]
    : [
        `https://minotar.net/helm/${raw}/${size}`,
        `https://mc-heads.net/avatar/${raw}/${size}`,
        `https://crafatar.com/avatars/${d}?size=${size}&overlay`,
        `https://visage.surgeplay.com/face/${size}/${raw}`
      ]
}

export async function getSkin(idOrUuid: string, size: number, kind: SkinKind): Promise<string | null> {
  const raw = idOrUuid.replace(/-/g, '')
  if (!/^[A-Za-z0-9_]{1,36}$/.test(raw)) return null
  if (!Number.isInteger(size) || size < 8 || size > 512) return null
  if (kind !== 'avatar' && kind !== 'body') return null
  const key = `${kind}-${raw}-${size}`

  const now = Date.now()
  const mem = memCache.get(key)
  if (mem && now - mem.ts < TTL_MS) return mem.url

  try {
    if (existsSync(cacheFile(key))) {
      const stat = statSync(cacheFile(key))
      if (now - stat.mtimeMs < TTL_MS) {
        const buf = readFileSync(cacheFile(key))
        if (isPng(buf)) {
          const url = `data:image/png;base64,${buf.toString('base64')}`
          memCache.set(key, { url, ts: stat.mtimeMs })
          return url
        }
      }
    }
  } catch {
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const p = withSlot(async () => {
    const buf = await fetchFirst(hosts(raw, size, kind))
    if (!buf) {
      console.warn(`[skins] could not resolve ${key}, all hosts failed`)
      return null
    }
    try {
      mkdirSync(cacheDir(), { recursive: true })
      writeFileSync(cacheFile(key), buf)
    } catch {
    }
    const url = `data:image/png;base64,${buf.toString('base64')}`
    memCache.set(key, { url, ts: Date.now() })
    return url
  }).finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p
}
