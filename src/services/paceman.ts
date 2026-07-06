// Read-only client for the public paceman.gg stats API.
// Base: https://paceman.gg/stats/api/  — used for the live pace panel.

export const PACEMAN_BASE = 'https://paceman.gg/stats/api'

export type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/** Split timings on a run. Each is ms since run start, or null if not reached. */
export interface RunSplits {
  nether: number | null
  bastion: number | null
  fortress: number | null
  first_portal: number | null
  stronghold: number | null
  end: number | null
  finish: number | null
}

export interface RecentRun extends RunSplits {
  id: number
  /** Unix seconds of the run's nether enter (paceman's insert time). */
  time: number | null
}

/** A player's paceman-tracked personal best (their fastest uploaded completion). */
export interface PacemanPB {
  /** PB completion time in ms (in-game time). */
  finish: number
  uuid: string
  /** Unix seconds of the PB run. */
  timestamp: number
  name: string
  /** Pre-formatted "m:ss" string from paceman. */
  pb: string
}

/** getSessionNethers — enter count/avg for a window, plus the player's uuid. */
export interface SessionNethers {
  count: number
  avg: string | null
  rnph: number
  uuid?: string
}

export interface WorldData extends RunSplits {
  id: number
  worldId: string
  nickname: string
  uuid: string
  twitch?: string | null
}

export interface WorldResponse {
  data: WorldData
  time: number | null
  isLive: boolean
}

export interface SplitStat {
  /** Number of runs that reached this split in the window. */
  count: number
  /** Average time to this split, pre-formatted by paceman as "m:ss" (or null). */
  avg: string | null
}
export interface SessionStats {
  nether: SplitStat
  bastion: SplitStat
  fortress: SplitStat
  first_structure: SplitStat
  second_structure: SplitStat
  first_portal: SplitStat
  stronghold: SplitStat
  end: SplitStat
  finish: SplitStat
}

/** Aggregate grind/activity stats (paceman's getNPH — "nether per hour"). */
export interface NetherStats {
  /** Real nether-per-hour — the headline grind-rate paceman shows. */
  rnph: number
  /** Lifetime nether-per-hour. */
  lnph: number
  /** Completions counted in the window. */
  count: number
  /** Average completion time, in ms. */
  avg: number
  /** Resets across all tracked time. */
  totalResets: number
  /** Resets in the window. */
  resets: number
  /** Play time in the window (minutes). */
  playtime: number
  /** Resets per enter (nether). */
  rpe: number
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export class PacemanApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'PacemanApiError'
  }
}

async function getJson<T>(fetchImpl: FetchLike, url: string): Promise<T> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new PacemanApiError(`paceman request failed (${res.status})`, res.status)
  return (await res.json()) as T
}

export interface RecentOpts {
  hours?: number
  hoursBetween?: number
  limit?: number
}

export function createPacemanClient(fetchImpl: FetchLike, base = PACEMAN_BASE) {
  return {
    getRecentRuns(name: string, opts: RecentOpts = {}): Promise<RecentRun[]> {
      return getJson<RecentRun[]>(
        fetchImpl,
        `${base}/getRecentRuns/${qs({
          name,
          hours: opts.hours,
          hoursBetween: opts.hoursBetween,
          limit: opts.limit ?? 1
        })}`
      )
    },
    getWorld(worldId: string | number): Promise<WorldResponse> {
      return getJson<WorldResponse>(fetchImpl, `${base}/getWorld/${qs({ worldId })}`)
    },
    getSessionStats(name: string, opts: RecentOpts = {}): Promise<SessionStats> {
      // Trailing slash: paceman 308-redirects the slashless form (extra round-trip).
      return getJson<SessionStats>(
        fetchImpl,
        `${base}/getSessionStats/${qs({
          name,
          hours: opts.hours,
          hoursBetween: opts.hoursBetween
        })}`
      )
    },
    getNetherStats(name: string, opts: RecentOpts = {}): Promise<NetherStats> {
      return getJson<NetherStats>(
        fetchImpl,
        `${base}/getNPH/${qs({
          name,
          hours: opts.hours,
          hoursBetween: opts.hoursBetween
        })}`
      )
    },
    getSessionNethers(name: string, opts: RecentOpts = {}): Promise<SessionNethers> {
      return getJson<SessionNethers>(
        fetchImpl,
        `${base}/getSessionNethers/${qs({
          name,
          hours: opts.hours,
          hoursBetween: opts.hoursBetween
        })}`
      )
    },
    /** PBs by uuid. (The `names` variant is a case-sensitive exact match upstream — avoid it.) */
    getPBs(uuids: string[]): Promise<PacemanPB[]> {
      return getJson<PacemanPB[]>(fetchImpl, `${base}/getPBs/${qs({ uuids: uuids.join(',') })}`)
    },
    /**
     * A player's true personal best, by paceman name. Resolves the name to a uuid first
     * (getSessionNethers echoes it back for any known player), then asks getPBs — the
     * recent-runs window can miss the PB entirely, so never derive a PB from it.
     * Returns null only for players paceman doesn't know (404); transient failures rethrow
     * so callers (react-query) retry instead of caching a false "no PB".
     */
    async getPB(name: string): Promise<PacemanPB | null> {
      try {
        const session = await this.getSessionNethers(name, { hours: 999999, hoursBetween: 999999 })
        if (!session?.uuid) return null
        const pbs = await this.getPBs([session.uuid])
        return pbs[0] ?? null
      } catch (e) {
        if (e instanceof PacemanApiError && e.status === 404) return null
        throw e
      }
    }
  }
}

export type PacemanClient = ReturnType<typeof createPacemanClient>

/** Ordered split ladder for display. */
export const SPLIT_ORDER: { key: keyof RunSplits; label: string }[] = [
  { key: 'nether', label: 'Enter Nether' },
  { key: 'bastion', label: 'Bastion' },
  { key: 'fortress', label: 'Fortress' },
  { key: 'first_portal', label: 'First Portal' },
  { key: 'stronghold', label: 'Stronghold' },
  { key: 'end', label: 'Enter End' },
  { key: 'finish', label: 'Finish' }
]
