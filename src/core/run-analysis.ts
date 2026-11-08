import type { MatchInfo, TimelineEvent } from '@services/mcsr-ranked'

export const RUN_SPLITS = ['ow', 'nether', 'bastion', 'fortress', 'blind', 'stronghold', 'end'] as const
export type RunSplit = (typeof RUN_SPLITS)[number]

export const OW_TYPES = ['bt', 'dt', 'rp', 'ship', 'village'] as const
export type OwType = (typeof OW_TYPES)[number]

export const BASTION_TYPES = ['bridge', 'housing', 'stables', 'treasure'] as const
export type BastionType = (typeof BASTION_TYPES)[number]

export const RUN_SPLIT_LABEL: Record<RunSplit, string> = {
  ow: 'Overworld',
  nether: 'Nether',
  bastion: 'Bastion',
  fortress: 'Fortress',
  blind: 'Blind',
  stronghold: 'Stronghold',
  end: 'The End'
}
export const OW_LABEL: Record<OwType, string> = {
  bt: 'Buried Treasure',
  dt: 'Temple',
  rp: 'Ruined Portal',
  ship: 'Shipwreck',
  village: 'Village'
}
export const BASTION_LABEL: Record<BastionType, string> = {
  bridge: 'Bridge',
  housing: 'Housing',
  stables: 'Stables',
  treasure: 'Treasure'
}

const SPLIT_EVENT: Record<string, RunSplit> = {
  'story.enter_the_nether': 'nether',
  'nether.find_bastion': 'bastion',
  'nether.find_fortress': 'fortress',
  'projectelo.timeline.blind_travel': 'blind',
  'story.follow_ender_eye': 'stronghold',
  'story.enter_the_end': 'end'
}
const OW_EVENT_TYPE: Record<string, OwType> = {
  BURIED_TREASURE: 'bt',
  DESERT_TEMPLE: 'dt',
  RUINED_PORTAL: 'rp',
  SHIPWRECK: 'ship',
  VILLAGE: 'village'
}
const RESET = 'projectelo.timeline.reset'
const DEATH = 'projectelo.timeline.death'
const POST_BASTION = new Set([
  'nether.find_fortress',
  'projectelo.timeline.blind_travel',
  'story.follow_ender_eye',
  'story.enter_the_end'
])

type Side = 'self' | 'opp'

export interface Tally<K extends string> {
  time: Record<K, number>
  count: Record<K, number>
  avg: Record<K, number | null>
}
export interface DeathTally<K extends string> {
  count: Record<K, number>
  enters: Record<K, number>
  rate: Record<K, number>
}
export interface Timesaves<K extends string> {
  median: Record<K, number | null>
  wins: Record<K, number>
  losses: Record<K, number>
}

const zeros = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
const nulls = <K extends string>(keys: readonly K[]): Record<K, number | null> =>
  Object.fromEntries(keys.map((k) => [k, null])) as Record<K, number | null>

function tally<K extends string>(keys: readonly K[]): Tally<K> {
  return { time: zeros(keys), count: zeros(keys), avg: nulls(keys) }
}
function deathTally<K extends string>(keys: readonly K[]): DeathTally<K> {
  return { count: zeros(keys), enters: zeros(keys), rate: zeros(keys) }
}
function finish<K extends string>(keys: readonly K[], t: Tally<K>, d?: DeathTally<K>): void {
  for (const k of keys) {
    t.avg[k] = t.count[k] > 0 ? Math.round(t.time[k] / t.count[k]) : null
    if (d) d.rate[k] = d.enters[k] > 0 ? Math.round((d.count[k] / d.enters[k]) * 1000) / 1000 : 0
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)
}

function headToHead<K extends string>(
  keys: readonly K[],
  firsts: { self: Record<K, number | null>; opp: Record<K, number | null> }[]
): Timesaves<K> {
  const diffs = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<K, number[]>
  const wins = zeros(keys)
  const losses = zeros(keys)
  for (const f of firsts) {
    for (const k of keys) {
      const a = f.self[k]
      const b = f.opp[k]
      if (a == null || b == null) continue
      const d = a - b
      if (d < 0) wins[k]++
      else losses[k]++
      diffs[k].push(d)
    }
  }
  const med = nulls(keys)
  for (const k of keys) med[k] = median(diffs[k])
  return { median: med, wins, losses }
}

function chronological(m: MatchInfo): TimelineEvent[] {
  return [...(m.timelines ?? [])].reverse()
}

export interface SplitAnalysis {
  games: number
  self: Tally<RunSplit>
  opp: Tally<RunSplit>
  deaths: { self: DeathTally<RunSplit>; opp: DeathTally<RunSplit> }
  timesaves: Timesaves<Exclude<RunSplit, 'end'>>
}

const SPLITS_NO_END = RUN_SPLITS.filter((s) => s !== 'end') as Exclude<RunSplit, 'end'>[]

export function analyzeSplitRuns(uuid: string, details: MatchInfo[]): SplitAnalysis {
  const me = uuid.toLowerCase()
  const out: SplitAnalysis = {
    games: 0,
    self: tally(RUN_SPLITS),
    opp: tally(RUN_SPLITS),
    deaths: { self: deathTally(RUN_SPLITS), opp: deathTally(RUN_SPLITS) },
    timesaves: { median: nulls(SPLITS_NO_END), wins: zeros(SPLITS_NO_END), losses: zeros(SPLITS_NO_END) }
  }
  const firsts: { self: Record<RunSplit, number | null>; opp: Record<RunSplit, number | null> }[] = []

  for (const m of details) {
    if (!m.timelines || m.timelines.length === 0) continue
    out.games++
    const cur: Record<Side, RunSplit> = { self: 'ow', opp: 'ow' }
    const prev: Record<Side, number> = { self: 0, opp: 0 }
    const firstCur: Record<Side, RunSplit> = { self: 'ow', opp: 'ow' }
    const firstPrev: Record<Side, number> = { self: 0, opp: 0 }
    const seen: Record<Side, Set<string>> = { self: new Set(), opp: new Set() }
    const first = { self: nulls(RUN_SPLITS), opp: nulls(RUN_SPLITS) }
    out.deaths.self.enters.ow++
    out.deaths.opp.enters.ow++

    for (const e of chronological(m)) {
      const side: Side = e.uuid?.toLowerCase() === me ? 'self' : 'opp'
      const t = out[side]
      const d = out.deaths[side]
      if (e.type === RESET) {
        prev[side] = e.time
        cur[side] = 'ow'
        d.enters.ow++
      } else if (e.type in SPLIT_EVENT) {
        const next = SPLIT_EVENT[e.type]
        t.time[cur[side]] += e.time - prev[side]
        t.count[cur[side]]++
        prev[side] = e.time
        cur[side] = next
        if (!seen[side].has(e.type)) {
          first[side][firstCur[side]] = e.time - firstPrev[side]
          firstPrev[side] = e.time
          firstCur[side] = next
          seen[side].add(e.type)
        }
        d.enters[next]++
      } else if (e.type === DEATH) {
        d.count[cur[side]]++
      }
    }

    if (!m.forfeited && typeof m.result?.time === 'number') {
      const side: Side = m.result.uuid?.toLowerCase() === me ? 'self' : 'opp'
      out[side].time[cur[side]] += m.result.time - prev[side]
      out[side].count[cur[side]]++
    }
    firsts.push(first)
  }

  finish(RUN_SPLITS, out.self, out.deaths.self)
  finish(RUN_SPLITS, out.opp, out.deaths.opp)
  out.timesaves = headToHead(SPLITS_NO_END, firsts)
  return out
}

export interface OverworldAnalysis {
  games: number
  self: Tally<OwType>
  opp: Tally<OwType>
  timesaves: Timesaves<OwType>
}

export function analyzeOverworlds(uuid: string, details: MatchInfo[]): OverworldAnalysis {
  const me = uuid.toLowerCase()
  const out: OverworldAnalysis = {
    games: 0,
    self: tally(OW_TYPES),
    opp: tally(OW_TYPES),
    timesaves: { median: nulls(OW_TYPES), wins: zeros(OW_TYPES), losses: zeros(OW_TYPES) }
  }
  const firsts: { self: Record<OwType, number | null>; opp: Record<OwType, number | null> }[] = []
  for (const m of details) {
    const type = OW_EVENT_TYPE[m.seedType ?? m.seed?.overworld ?? '']
    if (!m.timelines || m.timelines.length === 0 || !type) continue
    out.games++
    const entry: Record<Side, number> = { self: 0, opp: 0 }
    const firstNether: Record<Side, number | null> = { self: null, opp: null }
    for (const e of chronological(m)) {
      const side: Side = e.uuid?.toLowerCase() === me ? 'self' : 'opp'
      if (e.type === 'story.enter_the_nether') {
        out[side].time[type] += e.time - entry[side]
        out[side].count[type]++
        if (firstNether[side] == null) firstNether[side] = e.time
      } else if (e.type === RESET) {
        entry[side] = e.time
      }
    }
    const f = { self: nulls(OW_TYPES), opp: nulls(OW_TYPES) }
    f.self[type] = firstNether.self
    f.opp[type] = firstNether.opp
    firsts.push(f)
  }
  finish(OW_TYPES, out.self)
  finish(OW_TYPES, out.opp)
  out.timesaves = headToHead(OW_TYPES, firsts)
  return out
}

export interface BastionAnalysis {
  completed: number
  self: Tally<BastionType>
  opp: Tally<BastionType>
  deaths: { self: DeathTally<BastionType>; opp: DeathTally<BastionType> }
  timesaves: Timesaves<BastionType>
}

export function analyzeBastions(
  uuid: string,
  details: MatchInfo[],
  opts: { rearmOnReset?: boolean } = {}
): BastionAnalysis {
  const me = uuid.toLowerCase()
  const out: BastionAnalysis = {
    completed: 0,
    self: tally(BASTION_TYPES),
    opp: tally(BASTION_TYPES),
    deaths: { self: deathTally(BASTION_TYPES), opp: deathTally(BASTION_TYPES) },
    timesaves: { median: nulls(BASTION_TYPES), wins: zeros(BASTION_TYPES), losses: zeros(BASTION_TYPES) }
  }
  const firsts: { self: Record<BastionType, number | null>; opp: Record<BastionType, number | null> }[] = []
  for (const m of details) {
    const raw = (m.bastionType ?? m.seed?.nether ?? '').toLowerCase()
    const type = (BASTION_TYPES as readonly string[]).includes(raw) ? (raw as BastionType) : null
    if (!m.timelines || m.timelines.length === 0 || !type) continue
    const entry: Record<Side, number> = { self: 0, opp: 0 }
    const exited: Record<Side, boolean> = { self: false, opp: false }
    const firstEntry: Record<Side, number | null> = { self: null, opp: null }
    const firstLength: Record<Side, number | null> = { self: null, opp: null }
    for (const e of chronological(m)) {
      const side: Side = e.uuid?.toLowerCase() === me ? 'self' : 'opp'
      if (e.type === 'nether.find_bastion') {
        entry[side] = e.time
        if (firstEntry[side] == null) firstEntry[side] = e.time
        out.deaths[side].enters[type]++
      } else if (e.type === RESET) {
        entry[side] = 0
        if (opts.rearmOnReset) exited[side] = false
      } else if (entry[side] && !exited[side]) {
        if (e.type === DEATH) out.deaths[side].count[type]++
        else if (POST_BASTION.has(e.type)) {
          exited[side] = true
          out[side].time[type] += e.time - entry[side]
          out[side].count[type]++
          if (firstLength[side] == null) firstLength[side] = e.time - (firstEntry[side] ?? e.time)
        }
      }
    }
    const f = { self: nulls(BASTION_TYPES), opp: nulls(BASTION_TYPES) }
    f.self[type] = firstLength.self
    f.opp[type] = firstLength.opp
    firsts.push(f)
  }
  finish(BASTION_TYPES, out.self, out.deaths.self)
  finish(BASTION_TYPES, out.opp, out.deaths.opp)
  out.completed = BASTION_TYPES.reduce((n, k) => n + out.self.count[k], 0)
  out.timesaves = headToHead(BASTION_TYPES, firsts)
  return out
}

export interface ClutchStats {
  games: number
  chokeRate: number
  resilience: number
  momentum: number
}

export function calcMomentum(winwin: number, lossloss: number, pairs: number, winrate: number): number {
  const repeat = (winwin + lossloss) / pairs
  const expected = winrate ** 2 + (1 - winrate) ** 2
  if (expected === 1) return 0
  return Math.round(((repeat - expected) / (1 - expected)) * 1000) / 1000
}

export function clutchStats(uuid: string, details: MatchInfo[]): ClutchStats {
  const me = uuid.toLowerCase()
  let chokes = 0
  let comebacks = 0
  let games = 0
  let prev: 'win' | 'loss' | null = null
  let nonDraws = 0
  let pairs = 0
  let winwin = 0
  let lossloss = 0
  let winsAfter = 0
  for (const m of details) {
    games++
    const won = m.result?.uuid?.toLowerCase() === me
    if ((m.timelines ?? []).some((e) => e.uuid?.toLowerCase() === me && (e.type === RESET || e.type === DEATH))) {
      chokes++
      if (won) comebacks++
    }
    const outcome = won ? 'win' : m.result?.uuid ? 'loss' : null
    if (!outcome) continue
    if (prev) {
      pairs++
      if (prev === 'win' && outcome === 'win') winwin++
      if (prev === 'loss' && outcome === 'loss') lossloss++
      if (outcome === 'win') winsAfter++
    }
    nonDraws++
    prev = outcome
  }
  const r3 = (x: number): number => Math.round(x * 1000) / 1000
  return {
    games,
    chokeRate: games ? r3(chokes / games) : 0,
    resilience: chokes ? r3(comebacks / chokes) : 0,
    momentum: nonDraws && pairs ? calcMomentum(winwin, lossloss, pairs, winsAfter / nonDraws) : 0
  }
}

export function rankAgainst(value: number, sorted: readonly number[], lowerIsBetter: boolean): number | null {
  if (sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  const below = lo / sorted.length
  return Math.round((lowerIsBetter ? 1 - below : below) * 1000) / 1000
}

export function topLabel(share: number): string {
  const pct = share >= 0.5 ? (1 - share) * 100 : share * 100
  const shown = pct === 0 ? '0' : String(Number(pct.toPrecision(2)))
  return `${share >= 0.5 ? 'Top' : 'Bottom'} ${shown}%`
}
