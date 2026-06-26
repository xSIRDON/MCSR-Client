// Skin/head proxy. The renderer used to point a dozen <img> tags straight at mc-heads, which
// bursts the host on every leaderboard render — many requests fail (connection resets) and the
// heads fall back to letters. Here the main process fetches them instead, with: a small
// concurrency cap (no burst), a multi-host fallback chain, per-host retries, in-flight dedupe,
// and a persistent disk cache (data/skins). Returns a data: URL the renderer can drop into <img>.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'

export type SkinKind = 'avatar' | 'body'

const memCache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

/** PNG magic number — guards against caching/serving an error page or a glitched response. */
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

// ---- concurrency cap: at most N outbound skin fetches at once ----
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
      // network blip / reset — fall through to retry, then the next host
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
        `https://mc-heads.net/body/${raw}/${size}`,
        `https://minotar.net/armor/body/${raw}/${size}`,
        `https://crafatar.com/renders/body/${d}?size=${size}&overlay`,
        `https://visage.surgeplay.com/full/${size}/${raw}`
      ]
    : [
        `https://mc-heads.net/avatar/${raw}/${size}`,
        `https://minotar.net/avatar/${raw}/${size}`,
        `https://crafatar.com/avatars/${d}?size=${size}&overlay`,
        `https://visage.surgeplay.com/face/${size}/${raw}`
      ]
}

/**
 * Resolve a player head/body as a data: URL, or null if every host failed. Cached in memory and
 * on disk, so repeat requests (and future sessions) are instant.
 */
export async function getSkin(idOrUuid: string, size: number, kind: SkinKind): Promise<string | null> {
  const raw = idOrUuid.replace(/-/g, '')
  if (!raw) return null
  const key = `${kind}-${raw}-${size}`

  const mem = memCache.get(key)
  if (mem) return mem

  try {
    if (existsSync(cacheFile(key))) {
      const buf = readFileSync(cacheFile(key))
      if (isPng(buf)) {
        const url = `data:image/png;base64,${buf.toString('base64')}`
        memCache.set(key, url)
        return url
      }
      // corrupt cache entry — fall through and refetch
    }
  } catch {
    // unreadable cache entry — refetch
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const p = withSlot(async () => {
    const buf = await fetchFirst(hosts(raw, size, kind))
    if (!buf) {
      console.warn(`[skins] could not resolve ${key} — all hosts failed`)
      return null
    }
    try {
      mkdirSync(cacheDir(), { recursive: true })
      writeFileSync(cacheFile(key), buf)
    } catch {
      // a failed disk write is fine; we still return the in-memory copy
    }
    const url = `data:image/png;base64,${buf.toString('base64')}`
    memCache.set(key, url)
    return url
  }).finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p
}
