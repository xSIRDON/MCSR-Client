// Typed client for the MCSR Ranked REST API (https://api.mcsrranked.com).
// No API key required for the public endpoints. Rate limit: 500 req / 10 min.
// Response envelope: { status: 'success' | 'error', data }.
// NOTE: the loss field is spelled `loses` (one s); UUIDs are dashless;
// dates are epoch SECONDS and times are milliseconds.

export const MCSR_BASE = 'https://api.mcsrranked.com'

export type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

export class McsrApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'McsrApiError'
  }
}

/** MCSR stat values are broken down by mode. */
export interface StatBreakdown {
  ranked: number
  casual: number
  total?: number
}
/** The season/total statistics object is keyed by stat name. */
export interface Statistics {
  bestTime?: { ranked: number | null; casual: number | null }
  highestWinStreak?: StatBreakdown
  currentWinStreak?: StatBreakdown
  playedMatches?: StatBreakdown
  playtime?: StatBreakdown
  wins?: StatBreakdown
  loses?: StatBreakdown
}

export interface McsrUser {
  uuid: string
  nickname: string
  roleType?: number
  eloRate: number | null
  eloRank: number | null
  country?: string | null
  timestamp?: {
    firstOnline?: number
    lastOnline?: number
    lastRanked?: number
    nextDecay?: number | null
  }
  statistics?: {
    season?: Statistics
    total?: Statistics
  }
  seasonResult?: {
    last?: { eloRate: number | null; eloRank: number | null; phasePoint?: number }
    highest?: number | null
    lowest?: number | null
    phases?: { phase: number; eloRate: number | null; eloRank: number | null; point?: number }[]
  }
}

export interface FlatRankedStats {
  wins: number
  loses: number
  played: number
  currentStreak: number
  bestStreak: number
  bestTime: number | null
}

/** Pull ranked-mode stats into a flat, render-friendly shape — per-season or career totals. */
export function rankedStats(
  user: McsrUser | undefined,
  scope: 'season' | 'total' = 'season'
): FlatRankedStats {
  const s = scope === 'total' ? user?.statistics?.total : user?.statistics?.season
  return {
    wins: s?.wins?.ranked ?? 0,
    loses: s?.loses?.ranked ?? 0,
    played: s?.playedMatches?.ranked ?? 0,
    currentStreak: s?.currentWinStreak?.ranked ?? 0,
    bestStreak: s?.highestWinStreak?.ranked ?? 0,
    bestTime: s?.bestTime?.ranked ?? null
  }
}

/** Ranked-mode stats for the current/requested season. */
export function seasonRanked(user: McsrUser | undefined): FlatRankedStats {
  return rankedStats(user, 'season')
}

export interface MatchPlayer {
  uuid: string
  nickname: string
}
export interface MatchChange {
  uuid: string
  change: number | null
  eloRate: number | null
}
/** A split/milestone event from a match's timeline (present on the match-detail endpoint). */
export interface TimelineEvent {
  uuid: string
  time: number // ms from match start
  type: string // e.g. 'story.enter_the_nether', 'nether.find_bastion', 'projectelo.timeline.blind_travel'
}
export interface MatchInfo {
  id: number
  type: number // 1 Casual, 2 Ranked, 3 Private, 4 Event
  category?: string
  gameMode?: string
  players: MatchPlayer[]
  /** winner uuid (dashless) or null for draw/incomplete. */
  result?: { uuid: string | null; time: number | null }
  forfeited?: boolean
  decayed?: boolean
  seed?: { id?: string | null; overworld?: string | null; nether?: string | null }
  /** Overworld structure type: VILLAGE | SHIPWRECK | RUINED_PORTAL | DESERT_TEMPLE | BURIED_TREASURE (mirrors seed.overworld). */
  seedType?: string | null
  /** Bastion remnant type: HOUSING | TREASURE | STABLES | BRIDGE (mirrors seed.nether). */
  bastionType?: string | null
  changes?: MatchChange[]
  /** Per-player split events. Only populated by the match-detail endpoint (getMatch). */
  timelines?: TimelineEvent[]
  /** Per-player finish times (ms). Present on the match-detail endpoint. */
  completions?: { uuid: string; time: number }[]
  date?: number // epoch seconds
}

export interface SeasonPhasePoint {
  phase?: number
  eloRate: number | null
  eloRank?: number | null
}

export interface LeaderboardEntry {
  uuid: string
  nickname: string
  eloRate: number | null
  eloRank: number | null
  country?: string | null
  /** MCSR donor tier badge: 1 Stone, 2 Iron, 3 Diamond, 0/absent = not a donor. */
  roleType?: number
  seasonResult?: { eloRate: number | null; eloRank: number | null }
}

export interface LiveInfo {
  players?: number
  liveMatches?: unknown[]
}

interface Envelope<T> {
  status: 'success' | 'error'
  data: T
}

async function call<T>(fetchImpl: FetchLike, url: string): Promise<T> {
  const res = await fetchImpl(url)
  let body: Envelope<T>
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    throw new McsrApiError(`Invalid JSON from ${url}`, res.status)
  }
  if (!res.ok || !body || body.status !== 'success') {
    const msg =
      body && typeof (body as unknown as { data?: unknown }).data === 'string'
        ? String((body as unknown as { data: unknown }).data)
        : `Request failed (${res.status})`
    throw new McsrApiError(msg, res.status)
  }
  return body.data
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export interface MatchesOpts {
  type?: number
  count?: number
  page?: number
  /** Season filter; omit for the current season. */
  season?: number
}

/** Season metadata returned alongside the leaderboard. */
export interface SeasonMeta {
  number: number
  startsAt?: number
  endsAt?: number
}

export function createMcsrClient(fetchImpl: FetchLike, base = MCSR_BASE) {
  return {
    getUser(identifier: string, opts: { season?: number } = {}): Promise<McsrUser> {
      return call<McsrUser>(
        fetchImpl,
        `${base}/users/${encodeURIComponent(identifier)}${qs({ season: opts.season })}`
      )
    },
    getMatches(identifier: string, opts: MatchesOpts = {}): Promise<MatchInfo[]> {
      return call<MatchInfo[]>(
        fetchImpl,
        `${base}/users/${encodeURIComponent(identifier)}/matches${qs({
          type: opts.type,
          count: opts.count,
          page: opts.page,
          season: opts.season
        })}`
      )
    },
    getSeasons(identifier: string): Promise<SeasonPhasePoint[]> {
      return call<SeasonPhasePoint[]>(
        fetchImpl,
        `${base}/users/${encodeURIComponent(identifier)}/seasons`
      )
    },
    getMatch(matchId: number | string): Promise<MatchInfo> {
      return call<MatchInfo>(fetchImpl, `${base}/matches/${matchId}`)
    },
    getLeaderboard(
      opts: { season?: number } = {}
    ): Promise<{ season?: SeasonMeta; users: LeaderboardEntry[] }> {
      return call<{ season?: SeasonMeta; users: LeaderboardEntry[] }>(
        fetchImpl,
        `${base}/leaderboard${qs({ season: opts.season })}`
      )
    },
    getLive(): Promise<LiveInfo> {
      return call<LiveInfo>(fetchImpl, `${base}/live`)
    }
  }
}

export type McsrClient = ReturnType<typeof createMcsrClient>

/** Avatar URL helper. mc-heads accepts username or dashless uuid. */
export function avatarUrl(idOrUuid: string, size = 64): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(idOrUuid)}/${size}`
}

// ---- Donor tiers ----
// MCSR supporters get a tier badge, exposed as `roleType` on the user/leaderboard objects.

export type DonorTier = 'stone' | 'iron' | 'diamond'
export interface DonorInfo {
  tier: DonorTier
  label: string
  color: string
}

const DONOR_TIERS: Record<number, DonorInfo> = {
  1: { tier: 'stone', label: 'Stone', color: '#9aa0a6' },
  2: { tier: 'iron', label: 'Iron', color: '#d3d7db' },
  3: { tier: 'diamond', label: 'Diamond', color: '#4fe3d7' }
}

/** Donor tier for a `roleType`, or null when the player isn't a supporter (0 / undefined). */
export function donorInfo(roleType: number | null | undefined): DonorInfo | null {
  return roleType ? DONOR_TIERS[roleType] ?? null : null
}
