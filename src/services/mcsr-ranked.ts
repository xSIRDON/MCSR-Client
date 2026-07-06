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

export interface StatBreakdown {
  ranked: number
  casual: number
  total?: number
}
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
export interface TimelineEvent {
  uuid: string
  time: number
  type: string
}
export interface MatchInfo {
  id: number
  type: number
  category?: string
  gameMode?: string
  players: MatchPlayer[]
  result?: { uuid: string | null; time: number | null }
  forfeited?: boolean
  decayed?: boolean
  seed?: { id?: string | null; overworld?: string | null; nether?: string | null }
  seedType?: string | null
  bastionType?: string | null
  changes?: MatchChange[]
  timelines?: TimelineEvent[]
  completions?: { uuid: string; time: number }[]
  date?: number
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
  season?: number
}

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

export function avatarUrl(idOrUuid: string, size = 64): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(idOrUuid)}/${size}`
}

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

export function donorInfo(roleType: number | null | undefined): DonorInfo | null {
  return roleType ? DONOR_TIERS[roleType] ?? null : null
}
