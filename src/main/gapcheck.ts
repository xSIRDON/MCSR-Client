// GapCheck (gapcheck.gg) — curated top-runner ranked matches WITH their real numeric seeds.
//
// Why this exists: MCSR Ranked's own API only hands out a seed id, which can't be pasted into a
// private room, so the Practice tab could never let you replay a top runner's seed. GapCheck (built
// by cylorun, Luxvored and marmarounos) publishes the overworld/nether/end/RNG seeds for thousands
// of matches, plus the Twitch VODs and timelines. Their video-vs-video comparison stays on their
// site; we link to it.
//
// Two reasons this lives in the main process: their API sends no CORS headers, so a renderer fetch
// is blocked, and it keeps caching and rate limiting in one place — a played match never changes,
// so its detail is cached for the session, and requests are spaced out so the client is never a
// burst of traffic on a free community service.

import { app } from 'electron'
import type { GapCheckCounts, GapCheckFilters, GapCheckSeed } from '../shared/types'

const BASE = 'https://gapcheck.gg/api'

/** Their match page — the side-by-side VOD comparison lives here. */
export function matchUrl(matchId: number): string {
  return `https://gapcheck.gg/m/${matchId}/ranked`
}

export const SEED_TYPES = [
  'RUINED_PORTAL',
  'DESERT_TEMPLE',
  'VILLAGE',
  'SHIPWRECK',
  'BURIED_TREASURE'
] as const
export const BASTION_TYPES = ['BRIDGE', 'STABLES', 'HOUSING', 'TREASURE'] as const

/**
 * Build the query string for their filters. Every value crosses IPC from the renderer, so each one
 * is checked against an allowlist or coerced to a plain integer rather than interpolated as-is.
 */
export function buildQuery(filters: GapCheckFilters = {}): string {
  const q = new URLSearchParams()
  const type = (filters.seedType ?? '').toUpperCase()
  if ((SEED_TYPES as readonly string[]).includes(type)) q.set('seedType', type)
  const bastion = (filters.bastionType ?? '').toUpperCase()
  if ((BASTION_TYPES as readonly string[]).includes(bastion)) q.set('bastionType', bastion)
  const numbers: [string, number | null | undefined][] = [
    ['maxTime', filters.maxTimeSeconds],
    ['minTime', filters.minTimeSeconds],
    ['minRank', filters.minRank]
  ]
  for (const [key, value] of numbers) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      q.set(key, String(Math.floor(value)))
    }
  }
  for (const uuid of filters.players ?? []) {
    const clean = String(uuid).replace(/-/g, '').toLowerCase()
    if (/^[0-9a-f]{32}$/.test(clean)) q.append('players', clean)
  }
  return q.toString()
}

/** Where in a Twitch VOD a split happened: the run start plus the split's own time. */
export function vodSeconds(runStartSeconds: number, splitMs = 0): number {
  return Math.max(0, Math.floor(runStartSeconds + splitMs / 1000))
}

// ---- Raw shapes (only the fields we read) ----

interface RawVod {
  uuid?: string
  url?: string
  runStartSeconds?: number
  expiresAt?: string
}

interface RawMatch {
  matchId?: number
  overworldSeed?: string | null
  netherSeed?: string | null
  endSeed?: string | null
  rngSeed?: { seed?: string | null; matches?: number; total?: number } | null
  vods?: RawVod[] | null
  splits?: { uuid?: string; time?: number; type?: string }[] | null
  seedType?: string | null
  bastionType?: string | null
  endTowers?: number[] | null
  players?: { uuid?: string; nickname?: string; eloRank?: number | null; elo?: number | null }[] | null
  finalTime?: number | null
  date?: string | null
  result?: { uuid?: string; time?: number } | null
}

function seedString(v: unknown): string | null {
  // Seeds are 64-bit and arrive as strings; keep them as text so nothing is rounded away.
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? v.trim() : null
}

/** Turn one of their matches into the shape the Practice tab renders. Null when unusable. */
export function normalizeMatch(raw: unknown, now = Date.now()): GapCheckSeed | null {
  const wrapper = raw && typeof raw === 'object' ? (raw as { match?: RawMatch }) : null
  const m = (wrapper?.match ?? wrapper) as RawMatch | null
  if (!m || typeof m.matchId !== 'number' || !Number.isFinite(m.matchId)) return null

  const vodByPlayer = new Map<string, { url: string; runStartSeconds: number }>()
  for (const v of m.vods ?? []) {
    const uuid = (v.uuid ?? '').toLowerCase()
    if (!uuid || typeof v.url !== 'string' || !v.url.startsWith('https://')) continue
    // Twitch VODs expire; a dead link is worse than no button.
    if (v.expiresAt && Date.parse(v.expiresAt) <= now) continue
    vodByPlayer.set(uuid, {
      url: v.url,
      runStartSeconds: Math.max(0, Math.floor(v.runStartSeconds ?? 0))
    })
  }

  const splitsByPlayer = new Map<string, { type: string; timeMs: number }[]>()
  for (const s of m.splits ?? []) {
    const uuid = (s.uuid ?? '').toLowerCase()
    if (!uuid || typeof s.time !== 'number' || typeof s.type !== 'string') continue
    const list = splitsByPlayer.get(uuid) ?? []
    list.push({ type: s.type, timeMs: s.time })
    splitsByPlayer.set(uuid, list)
  }
  for (const list of splitsByPlayer.values()) list.sort((a, b) => a.timeMs - b.timeMs)

  const winnerUuid = (m.result?.uuid ?? '').toLowerCase()
  const players = (m.players ?? [])
    .map((p) => {
      const uuid = (p.uuid ?? '').toLowerCase()
      if (!uuid) return null
      return {
        uuid,
        nickname: typeof p.nickname === 'string' ? p.nickname : uuid.slice(0, 8),
        eloRank: typeof p.eloRank === 'number' ? p.eloRank : null,
        elo: typeof p.elo === 'number' ? p.elo : null,
        timeMs: uuid === winnerUuid && typeof m.result?.time === 'number' ? m.result.time : null,
        splits: splitsByPlayer.get(uuid) ?? [],
        vod: vodByPlayer.get(uuid) ?? null
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    // Winner first: their run is the one you're chasing.
    .sort((a, b) => Number(b.uuid === winnerUuid) - Number(a.uuid === winnerUuid))

  const rngSeed = seedString(m.rngSeed?.seed)
  return {
    matchId: m.matchId,
    url: matchUrl(m.matchId),
    date: m.date ? Math.floor(Date.parse(m.date) / 1000) || null : null,
    seedType: typeof m.seedType === 'string' ? m.seedType : null,
    bastionType: typeof m.bastionType === 'string' ? m.bastionType : null,
    endTowers: Array.isArray(m.endTowers) ? m.endTowers.filter((n) => typeof n === 'number') : [],
    seeds: {
      overworld: seedString(m.overworldSeed),
      nether: seedString(m.netherSeed),
      end: seedString(m.endSeed),
      rng: rngSeed
    },
    rngConfidence:
      rngSeed && typeof m.rngSeed?.matches === 'number' && typeof m.rngSeed?.total === 'number'
        ? { matches: m.rngSeed.matches, total: m.rngSeed.total }
        : null,
    players,
    finalTimeMs: typeof m.finalTime === 'number' ? m.finalTime : null
  }
}

// ---- Fetching ----

/** Identify the client so GapCheck can see (and reach) us in their logs. */
function userAgent(): string {
  let version = 'dev'
  try {
    version = app.getVersion()
  } catch {
    // outside Electron (tests) — the fallback is fine
  }
  return `MCSR-Client/${version} (+https://github.com/xSIRDON/MCSR-Client)`
}

// One request at a time, spaced out: this is a free community service, not a CDN.
const MIN_REQUEST_GAP_MS = 250
let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now())
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return fn()
  })
  chain = run.catch(() => undefined)
  return run
}

class GapCheckHttpError extends Error {
  constructor(readonly status: number) {
    super(`GapCheck returned ${status}`)
  }
}

async function getJson(path: string): Promise<unknown> {
  return queued(async () => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json', 'user-agent': userAgent() },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) throw new GapCheckHttpError(res.status)
    return res.json()
  })
}

/** A played match never changes, so its detail is cached for the session. */
const matchCache = new Map<number, GapCheckSeed>()
const countsCache = new Map<string, { at: number; value: GapCheckCounts }>()
const COUNTS_TTL_MS = 10 * 60_000

export async function counts(filters: GapCheckFilters = {}): Promise<GapCheckCounts> {
  const query = buildQuery(filters)
  const hit = countsCache.get(query)
  if (hit && Date.now() - hit.at < COUNTS_TTL_MS) return hit.value
  const raw = (await getJson(`/matches/random/counts${query ? `?${query}` : ''}`)) as {
    count?: { Total?: number; ByType?: Record<string, number> }
  }
  const value: GapCheckCounts = {
    total: typeof raw?.count?.Total === 'number' ? raw.count.Total : 0,
    byType: raw?.count?.ByType && typeof raw.count.ByType === 'object' ? raw.count.ByType : {}
  }
  countsCache.set(query, { at: Date.now(), value })
  return value
}

export async function match(matchId: number): Promise<GapCheckSeed | null> {
  if (!Number.isSafeInteger(matchId) || matchId <= 0) throw new Error('Invalid match id')
  const cached = matchCache.get(matchId)
  if (cached) return cached
  const seed = normalizeMatch(await getJson(`/matches/${matchId}`))
  if (seed) matchCache.set(matchId, seed)
  return seed
}

/**
 * Draw one seed matching the filters: their random pick, then that match's detail. Nothing matching
 * is a 404 upstream, which is an ordinary answer here (null), not a failure to report.
 */
export async function randomSeed(filters: GapCheckFilters = {}): Promise<GapCheckSeed | null> {
  const query = buildQuery(filters)
  let picked: { matchId?: number }
  try {
    picked = (await getJson(`/matches/random${query ? `?${query}` : ''}`)) as { matchId?: number }
  } catch (e) {
    if (e instanceof GapCheckHttpError && e.status === 404) return null
    throw e
  }
  if (typeof picked?.matchId !== 'number') return null
  return match(picked.matchId)
}
