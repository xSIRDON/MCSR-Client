import { app } from 'electron'
import type { GapCheckCounts, GapCheckFilters, GapCheckSeed } from '../shared/types'

const BASE = 'https://gapcheck.gg/api'

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

export function vodSeconds(runStartSeconds: number, splitMs = 0): number {
  return Math.max(0, Math.floor(runStartSeconds + splitMs / 1000))
}

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
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? v.trim() : null
}

export function normalizeMatch(raw: unknown, now = Date.now()): GapCheckSeed | null {
  const wrapper = raw && typeof raw === 'object' ? (raw as { match?: RawMatch }) : null
  const m = (wrapper?.match ?? wrapper) as RawMatch | null
  if (!m || typeof m.matchId !== 'number' || !Number.isFinite(m.matchId)) return null

  const vodByPlayer = new Map<string, { url: string; runStartSeconds: number }>()
  for (const v of m.vods ?? []) {
    const uuid = (v.uuid ?? '').toLowerCase()
    if (!uuid || typeof v.url !== 'string' || !v.url.startsWith('https://')) continue
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

function userAgent(): string {
  let version = 'dev'
  try {
    version = app.getVersion()
  } catch {
  }
  return `MCSR-Client/${version} (+https://github.com/xSIRDON/MCSR-Client)`
}

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

async function getJson(path: string): Promise<unknown> {
  return queued(async () => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json', 'user-agent': userAgent() },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) throw new Error(`GapCheck returned ${res.status}`)
    return res.json()
  })
}

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

export async function randomSeed(filters: GapCheckFilters = {}): Promise<GapCheckSeed | null> {
  const query = buildQuery(filters)
  const picked = (await getJson(`/matches/random${query ? `?${query}` : ''}`)) as {
    matchId?: number
  }
  if (typeof picked?.matchId !== 'number') return null
  return match(picked.matchId)
}
