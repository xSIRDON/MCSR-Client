export const PACEMAN_BASE = 'https://paceman.gg/stats/api'

export type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

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
  time: number | null
}

export interface PacemanPB {
  finish: number
  uuid: string
  timestamp: number
  name: string
  pb: string
}

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
  count: number
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

export interface NetherStats {
  rnph: number
  lnph: number
  count: number
  avg: number
  totalResets: number
  resets: number
  playtime: number
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
    getPBs(uuids: string[]): Promise<PacemanPB[]> {
      return getJson<PacemanPB[]>(fetchImpl, `${base}/getPBs/${qs({ uuids: uuids.join(',') })}`)
    },
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

export const SPLIT_ORDER: { key: keyof RunSplits; label: string }[] = [
  { key: 'nether', label: 'Enter Nether' },
  { key: 'bastion', label: 'Bastion' },
  { key: 'fortress', label: 'Fortress' },
  { key: 'first_portal', label: 'First Portal' },
  { key: 'stronghold', label: 'Stronghold' },
  { key: 'end', label: 'Enter End' },
  { key: 'finish', label: 'Finish' }
]
