import type { MatchInfo, TimelineEvent } from '@services/mcsr-ranked'
import { msToTime } from './format'

export interface RankedInsight {
  kind: 'strength' | 'weakness' | 'note'
  label: string
  detail: string
}

export interface RankedAnalytics {
  played: number
  wins: number
  losses: number
  draws: number
  decided: number
  winRate: number
  netElo: number
  biggestGain: number
  biggestLoss: number
  currentStreak: number
  bestWinStreak: number
  best: number | null
  averageWin: number | null
  medianWin: number | null
  recentWinRate: number
  recentSample: number
  vsHigher: { decided: number; winRate: number }
  vsLower: { decided: number; winRate: number }
  forfeits: { yours: number; theirs: number }
  completionTimes: number[]
  insights: RankedInsight[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pct(wins: number, decided: number): number {
  if (decided <= 0) return 0
  return round1((wins / decided) * 100)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

type Outcome = 'win' | 'loss' | 'draw' | 'skip'

function outcomeFor(uuid: string, m: MatchInfo): Outcome {
  const winner = m.result?.uuid
  if (winner == null) return 'draw'
  if (winner === uuid) return 'win'
  return 'loss'
}

export interface HeadlineStats {
  winRate: number | null
  forfeitRate: number | null
  played: number
}

export function analyzeRanked(
  uuid: string,
  matches: MatchInfo[],
  headline?: HeadlineStats
): RankedAnalytics {
  uuid = uuid.toLowerCase()
  const list = Array.isArray(matches) ? matches.filter((m) => m && m.type === 2) : []

  let wins = 0
  let losses = 0
  let draws = 0
  let netElo = 0
  let biggestGain = 0
  let biggestLoss = 0
  let bestWinStreak = 0
  let runningWinStreak = 0

  let forfeitsYours = 0
  let forfeitsTheirs = 0

  let higherDecided = 0
  let higherWins = 0
  let lowerDecided = 0
  let lowerWins = 0

  const winTimes: number[] = []

  const decidedSeq: ('win' | 'loss')[] = []

  for (const m of list) {
    const outcome = outcomeFor(uuid, m)

    if (outcome === 'draw') {
      draws++
    } else if (outcome === 'win') {
      wins++
      decidedSeq.push('win')
    } else {
      losses++
      decidedSeq.push('loss')
    }

    const mine = m.changes?.find((c) => c.uuid === uuid)
    if (mine && typeof mine.change === 'number') {
      netElo += mine.change
      if (mine.change > biggestGain) biggestGain = mine.change
      if (mine.change < biggestLoss) biggestLoss = mine.change
    }

    if (outcome === 'win') {
      runningWinStreak++
      if (runningWinStreak > bestWinStreak) bestWinStreak = runningWinStreak
    } else if (outcome === 'loss') {
      runningWinStreak = 0
    }

    if (m.forfeited) {
      if (outcome === 'loss') forfeitsYours++
      else if (outcome === 'win') forfeitsTheirs++
    }

    if (
      outcome === 'win' &&
      !m.forfeited &&
      typeof m.result?.time === 'number' &&
      m.result.time > 0
    ) {
      winTimes.push(m.result.time)
    }

    if (outcome === 'win' || outcome === 'loss') {
      const myRate = mine?.eloRate
      const opp = m.changes?.find((c) => c.uuid !== uuid)
      const oppRate = opp?.eloRate
      if (typeof myRate === 'number' && typeof oppRate === 'number') {
        if (oppRate > myRate) {
          higherDecided++
          if (outcome === 'win') higherWins++
        } else if (oppRate < myRate) {
          lowerDecided++
          if (outcome === 'win') lowerWins++
        }
      }
    }
  }

  const decided = wins + losses
  const played = list.length

  let currentStreak = 0
  if (decidedSeq.length > 0) {
    const head = decidedSeq[0]
    let run = 0
    for (const r of decidedSeq) {
      if (r === head) run++
      else break
    }
    currentStreak = head === 'win' ? run : -run
  }

  const recent = decidedSeq.slice(0, 20)
  const recentSample = recent.length
  const recentWins = recent.filter((r) => r === 'win').length
  const recentWinRate = pct(recentWins, recentSample)

  const best = winTimes.length > 0 ? Math.min(...winTimes) : null
  const averageWin =
    winTimes.length > 0 ? Math.round(winTimes.reduce((a, b) => a + b, 0) / winTimes.length) : null
  const medianWin = median(winTimes)

  const vsHigher = { decided: higherDecided, winRate: pct(higherWins, higherDecided) }
  const vsLower = { decided: lowerDecided, winRate: pct(lowerWins, lowerDecided) }
  const overallWinRate = pct(wins, decided)

  const useHead = !!headline && headline.played > 0
  const insights = buildInsights({
    played,
    decided,
    wins,
    overallWinRate: (useHead ? headline.winRate : null) ?? overallWinRate,
    baselineGames: useHead ? headline.played : decided,
    forfeitRate:
      useHead && headline.forfeitRate != null
        ? headline.forfeitRate
        : decided > 0
          ? round1((forfeitsYours / decided) * 100)
          : null,
    currentStreak,
    bestWinStreak,
    recentWinRate,
    recentSample,
    vsHigher,
    vsLower,
    forfeitsYours,
    forfeitsTheirs,
    best,
    averageWin
  })

  return {
    played,
    wins,
    losses,
    draws,
    decided,
    winRate: overallWinRate,
    netElo,
    biggestGain,
    biggestLoss,
    currentStreak,
    bestWinStreak,
    best,
    averageWin,
    medianWin,
    recentWinRate,
    recentSample,
    vsHigher,
    vsLower,
    forfeits: { yours: forfeitsYours, theirs: forfeitsTheirs },
    completionTimes: winTimes,
    insights
  }
}

interface InsightInput {
  played: number
  decided: number
  wins: number
  overallWinRate: number
  baselineGames: number
  forfeitRate: number | null
  currentStreak: number
  bestWinStreak: number
  recentWinRate: number
  recentSample: number
  vsHigher: { decided: number; winRate: number }
  vsLower: { decided: number; winRate: number }
  forfeitsYours: number
  forfeitsTheirs: number
  best: number | null
  averageWin: number | null
}

function buildInsights(d: InsightInput): RankedInsight[] {
  const out: RankedInsight[] = []

  if (d.played === 0) {
    out.push({ kind: 'note', label: 'No data', detail: 'No ranked matches to analyze yet.' })
    return out
  }

  if (d.vsHigher.decided >= 3) {
    if (d.vsHigher.winRate >= 50) {
      out.push({
        kind: 'strength',
        label: 'Punches up',
        detail: `${d.vsHigher.winRate}% win rate vs higher-rated opponents.`
      })
    } else if (d.vsHigher.winRate <= 30) {
      out.push({
        kind: 'weakness',
        label: 'Struggles up',
        detail: `Only ${d.vsHigher.winRate}% vs higher-rated opponents.`
      })
    }
  }

  if (d.vsLower.decided >= 3 && d.vsLower.winRate < 50) {
    out.push({
      kind: 'weakness',
      label: 'Drops winnable games',
      detail: `${d.vsLower.winRate}% vs lower-rated opponents.`
    })
  }

  if (d.recentSample >= 5) {
    const delta = round1(d.recentWinRate - d.overallWinRate)
    if (delta >= 10) {
      out.push({
        kind: 'strength',
        label: 'Trending up',
        detail: `Recent ${d.recentWinRate}% beats your ${d.overallWinRate}% baseline.`
      })
    } else if (delta <= -10) {
      out.push({
        kind: 'weakness',
        label: 'Cooling off',
        detail: `Recent ${d.recentWinRate}% is below your ${d.overallWinRate}% baseline.`
      })
    }
  }

  if (d.currentStreak >= 3) {
    out.push({
      kind: 'strength',
      label: 'On a heater',
      detail: `${d.currentStreak}-game win streak right now.`
    })
  } else if (d.currentStreak <= -3) {
    out.push({
      kind: 'weakness',
      label: 'Cold streak',
      detail: `${Math.abs(d.currentStreak)} losses in a row right now.`
    })
  }

  if (d.forfeitRate != null) {
    const ffRate = d.forfeitRate
    if (ffRate >= 20) {
      out.push({
        kind: 'weakness',
        label: 'Forfeits often',
        detail: `You forfeited ${ffRate}% of your games.`
      })
    } else if (d.forfeitsTheirs > d.forfeitsYours && d.forfeitsTheirs >= 3) {
      out.push({
        kind: 'note',
        label: 'Opponents fold',
        detail: `${d.forfeitsTheirs} opponents forfeited to you.`
      })
    }
  }

  if (d.best != null && d.averageWin != null && d.averageWin > 0) {
    const spread = round1(((d.averageWin - d.best) / d.averageWin) * 100)
    if (spread <= 12) {
      out.push({
        kind: 'strength',
        label: 'Consistent pace',
        detail: `Your wins cluster near your best time.`
      })
    } else if (spread >= 30) {
      out.push({
        kind: 'note',
        label: 'Swingy pace',
        detail: `Big gap between your best and average win times.`
      })
    }
  }

  if (d.bestWinStreak >= 5) {
    out.push({
      kind: 'note',
      label: 'Peak streak',
      detail: `Longest win streak: ${d.bestWinStreak} games.`
    })
  }

  if (out.length === 0) {
    out.push({
      kind: 'note',
      label: 'Even keel',
      detail: `${d.overallWinRate}% win rate over ${d.baselineGames} games.`
    })
  }
  return out.slice(0, 6)
}

export interface SplitStat {
  key: string
  label: string
  best: number | null
  average: number | null
  median: number | null
  count: number
}

const CUMULATIVE_SPLITS: { key: string; label: string; type: string }[] = [
  { key: 'overworld', label: 'Overworld', type: 'story.enter_the_nether' },
  { key: 'bastion', label: 'Bastion', type: 'nether.find_bastion' },
  { key: 'fortress', label: 'Fortress', type: 'nether.find_fortress' },
  { key: 'blind', label: 'Blind', type: 'projectelo.timeline.blind_travel' },
  { key: 'stronghold', label: 'Stronghold', type: 'story.follow_ender_eye' },
  { key: 'end', label: 'End', type: 'story.enter_the_end' }
]

function splitStat(key: string, label: string, times: number[]): SplitStat {
  const valid = times.filter((t) => typeof t === 'number' && t > 0)
  const mid = median(valid)
  return {
    key,
    label,
    best: valid.length ? Math.min(...valid) : null,
    average: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
    median: mid == null ? null : Math.round(mid),
    count: valid.length
  }
}

export function analyzeSplits(uuid: string, details: MatchInfo[]): SplitStat[] {
  uuid = uuid.toLowerCase()
  const list = Array.isArray(details) ? details.filter((m) => m && m.type === 2) : []

  const buckets: Record<string, number[]> = {}
  for (const s of CUMULATIVE_SPLITS) buckets[s.key] = []
  const finishTimes: number[] = []
  const fortToFinish: number[] = []

  for (const m of list) {
    const tl = m.timelines
    if (!Array.isArray(tl)) continue

    const timeOf = (type: string): number | null => {
      let earliest: number | null = null
      for (const e of tl) {
        if (e && e.uuid === uuid && e.type === type && typeof e.time === 'number' && e.time > 0) {
          if (earliest == null || e.time < earliest) earliest = e.time
        }
      }
      return earliest
    }

    for (const s of CUMULATIVE_SPLITS) {
      const t = timeOf(s.type)
      if (t != null) buckets[s.key].push(t)
    }

    const won = m.result?.uuid === uuid
    const finish =
      won && !m.forfeited && typeof m.result?.time === 'number' ? m.result.time : null
    if (finish != null && finish > 0) {
      finishTimes.push(finish)
      const fort = timeOf('nether.find_fortress')
      if (fort != null && finish > fort) fortToFinish.push(finish - fort)
    }
  }

  const out = CUMULATIVE_SPLITS.map((s) => splitStat(s.key, s.label, buckets[s.key]))
  out.push(splitStat('finish', 'Finish', finishTimes))
  out.push(splitStat('fortToFinish', 'Fort → Finish', fortToFinish))
  return out
}

export function splitsFromTimeline(
  uuid: string,
  splits: { type: string; timeMs: number }[],
  finishMs: number | null = null
): SplitStat[] {
  const match: MatchInfo = {
    id: 0,
    type: 2,
    players: [],
    result: { uuid, time: finishMs },
    forfeited: false,
    timelines: splits.map((s): TimelineEvent => ({ uuid, time: s.timeMs, type: s.type }))
  }
  return analyzeSplits(uuid, [match])
}

export interface GapRow {
  key: string
  label: string
  runnerMs: number | null
  youMs: number | null
  delta: number | null
}

export function buildSplitGap(runner: SplitStat[], you: SplitStat[]): GapRow[] {
  const youBy = new Map(you.map((s) => [s.key, s]))
  return runner.map((r) => {
    const mine = youBy.get(r.key)
    const youMs = mine?.median ?? mine?.average ?? null
    return {
      key: r.key,
      label: r.label,
      runnerMs: r.average,
      youMs,
      delta: r.average != null && youMs != null ? youMs - r.average : null
    }
  })
}

export function seedStructureLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return code
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export interface TypeStat {
  key: string
  label: string
  count: number
  decided: number
  wins: number
  winRate: number | null
  best: number | null
  average: number | null
  timeSample: number
}

export interface TypeBreakdown {
  dimension: 'overworld' | 'bastion'
  splitLabel: string
  rows: TypeStat[]
}

const OVERWORLD_TYPES: { key: string; label: string }[] = [
  { key: 'VILLAGE', label: 'Village' },
  { key: 'SHIPWRECK', label: 'Shipwreck' },
  { key: 'RUINED_PORTAL', label: 'Ruined Portal' },
  { key: 'DESERT_TEMPLE', label: 'Desert Temple' },
  { key: 'BURIED_TREASURE', label: 'Buried Treasure' }
]

const BASTION_TYPES: { key: string; label: string }[] = [
  { key: 'HOUSING', label: 'Housing' },
  { key: 'TREASURE', label: 'Treasure' },
  { key: 'STABLES', label: 'Stables' },
  { key: 'BRIDGE', label: 'Bridge' }
]

function normalizeType(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const k = v.trim().toUpperCase()
  return k && k !== 'NONE' ? k : null
}

function pickType(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const k = normalizeType(c)
    if (k) return k
  }
  return null
}

function prettyType(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function earliestEvent(uuid: string, m: MatchInfo, type: string): number | null {
  const tl = m.timelines
  if (!Array.isArray(tl)) return null
  let earliest: number | null = null
  for (const e of tl) {
    if (e && e.uuid === uuid && e.type === type && typeof e.time === 'number' && e.time > 0) {
      if (earliest == null || e.time < earliest) earliest = e.time
    }
  }
  return earliest
}

function buildBreakdown(
  uuid: string,
  matches: MatchInfo[],
  details: MatchInfo[],
  dimension: 'overworld' | 'bastion',
  splitLabel: string,
  eventType: string,
  types: { key: string; label: string }[],
  typeKey: (m: MatchInfo) => string | null
): TypeBreakdown {
  const labelByKey: Record<string, string> = {}
  for (const t of types) labelByKey[t.key] = t.label

  const agg: Record<string, { count: number; decided: number; wins: number }> = {}
  const ensure = (k: string) => (agg[k] ??= { count: 0, decided: 0, wins: 0 })

  const rankedMatches = Array.isArray(matches) ? matches.filter((m) => m && m.type === 2) : []
  for (const m of rankedMatches) {
    const key = typeKey(m)
    if (!key) continue
    const a = ensure(key)
    a.count++
    const outcome = outcomeFor(uuid, m)
    if (outcome === 'win') {
      a.decided++
      a.wins++
    } else if (outcome === 'loss') {
      a.decided++
    }
  }

  const times: Record<string, number[]> = {}
  const rankedDetails = Array.isArray(details) ? details.filter((m) => m && m.type === 2) : []
  for (const m of rankedDetails) {
    const key = typeKey(m)
    if (!key) continue
    const t = earliestEvent(uuid, m, eventType)
    if (t != null) (times[key] ??= []).push(t)
  }

  const keys = new Set<string>([...types.map((t) => t.key), ...Object.keys(agg), ...Object.keys(times)])
  const rows: TypeStat[] = [...keys].map((key) => {
    const a = agg[key] ?? { count: 0, decided: 0, wins: 0 }
    const ts = times[key] ?? []
    return {
      key,
      label: labelByKey[key] ?? prettyType(key),
      count: a.count,
      decided: a.decided,
      wins: a.wins,
      winRate: a.decided > 0 ? pct(a.wins, a.decided) : null,
      best: ts.length ? Math.min(...ts) : null,
      average: ts.length ? Math.round(ts.reduce((x, y) => x + y, 0) / ts.length) : null,
      timeSample: ts.length
    }
  })
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return { dimension, splitLabel, rows }
}

export function analyzeTypeBreakdowns(
  uuid: string,
  matches: MatchInfo[],
  details: MatchInfo[]
): { overworld: TypeBreakdown; bastion: TypeBreakdown } {
  uuid = uuid.toLowerCase()
  return {
    overworld: buildBreakdown(
      uuid,
      matches,
      details,
      'overworld',
      'Overworld',
      'story.enter_the_nether',
      OVERWORLD_TYPES,
      (m) => pickType(m.seedType, m.seed?.overworld)
    ),
    bastion: buildBreakdown(
      uuid,
      matches,
      details,
      'bastion',
      'Bastion',
      'nether.find_bastion',
      BASTION_TYPES,
      (m) => pickType(m.bastionType, m.seed?.nether)
    )
  }
}

const REAL_DEATH_EVENT = 'projectelo.timeline.death'

export interface DeathStats {
  total: number
  matches: number
  perMatch: number
}

export function countDeaths(uuid: string, details: MatchInfo[]): DeathStats {
  const me = uuid.toLowerCase()
  const list = Array.isArray(details)
    ? details.filter((m) => m && m.type === 2 && Array.isArray(m.timelines))
    : []
  let total = 0
  for (const m of list) {
    for (const e of m.timelines!) {
      if (e && typeof e.uuid === 'string' && e.uuid.toLowerCase() === me && e.type === REAL_DEATH_EVENT) {
        total++
      }
    }
  }
  return { total, matches: list.length, perMatch: list.length > 0 ? total / list.length : 0 }
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export interface ScoreDim {
  key: string
  label: string
  score: number
  detail: string
  sample: number
}

export function buildScorecard(
  a: RankedAnalytics,
  seasonWinRate: number | null,
  seasonPlayed: number,
  deaths?: DeathStats,
  speed?: { score: number; sample: number } | null
): ScoreDim[] {
  const dims: ScoreDim[] = []

  const wr = seasonPlayed > 0 && seasonWinRate != null ? seasonWinRate : a.decided > 0 ? a.winRate : null
  const wrSample = seasonPlayed > 0 ? seasonPlayed : a.decided
  if (wr != null) {
    dims.push({ key: 'winrate', label: 'Win Rate', score: clamp100(wr), detail: `${wr}% over ${wrSample} games`, sample: wrSample })
  }
  if (a.vsHigher.decided > 0) {
    dims.push({ key: 'clutch', label: 'Clutch', score: clamp100(a.vsHigher.winRate), detail: `${a.vsHigher.winRate}% vs stronger (${a.vsHigher.decided})`, sample: a.vsHigher.decided })
  }
  if (a.vsLower.decided > 0) {
    dims.push({ key: 'closing', label: 'Closing', score: clamp100(a.vsLower.winRate), detail: `${a.vsLower.winRate}% vs weaker (${a.vsLower.decided})`, sample: a.vsLower.decided })
  }
  if (a.recentSample > 0) {
    dims.push({ key: 'form', label: 'Recent Form', score: clamp100(a.recentWinRate), detail: `${a.recentWinRate}% over last ${a.recentSample}`, sample: a.recentSample })
  }
  if (a.decided > 0) {
    const ff = Math.round((a.forfeits.yours / a.decided) * 100)
    dims.push({ key: 'finishing', label: 'Finishing', score: clamp100(100 - ff), detail: `forfeited ${ff}% of games`, sample: a.decided })
  }
  if (speed) {
    const pct = clamp100(speed.score)
    dims.push({
      key: 'speed',
      label: 'Speed',
      score: pct,
      detail: `run pace — faster than ~${pct}% of the field`,
      sample: speed.sample
    })
  }
  if (deaths && deaths.matches >= 1) {
    dims.push({
      key: 'survival',
      label: 'Survival',
      score: clamp100(100 - deaths.perMatch * 70),
      detail: `${deaths.total} death${deaths.total === 1 ? '' : 's'} in ${deaths.matches} games`,
      sample: deaths.matches
    })
  }
  return dims
}

export function scorecardInsights(
  dims: ScoreDim[],
  season: { winRate: number | null; played: number; bestTime: number | null; bestStreak: number },
  deaths?: DeathStats
): RankedInsight[] {
  const out: RankedInsight[] = []

  if (season.played > 0 && season.winRate != null) {
    out.push({
      kind: season.winRate >= 55 ? 'strength' : season.winRate <= 40 ? 'weakness' : 'note',
      label: 'Record',
      detail: `${season.winRate}% win rate over ${season.played} games.`
    })
  }

  const ranked = dims
    .filter((d) => d.key !== 'winrate' && d.key !== 'survival' && d.sample >= 3)
    .sort((x, y) => y.score - x.score)
  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  if (top && top.score >= 55) out.push({ kind: 'strength', label: top.label, detail: `${top.detail}.` })
  if (bottom && bottom !== top && bottom.score <= 45) {
    out.push({ kind: 'weakness', label: bottom.label, detail: `${bottom.detail}.` })
  }

  if (deaths && deaths.matches >= 3 && deaths.total > 0 && deaths.perMatch >= 0.34) {
    out.push({
      kind: 'weakness',
      label: 'Dies too much',
      detail: `${deaths.total} death${deaths.total === 1 ? '' : 's'} in ${deaths.matches} games — each one costs time and runs.`
    })
  }

  if (season.bestTime) {
    out.push({ kind: 'note', label: 'Personal best', detail: `Fastest win ${msToTime(season.bestTime)}.` })
  }
  if (season.bestStreak >= 3) {
    out.push({ kind: 'note', label: 'Peak streak', detail: `Best win streak: ${season.bestStreak} games.` })
  }

  if (out.length === 0) {
    out.push({ kind: 'note', label: 'Getting started', detail: 'Play a few ranked games to build your profile.' })
  }
  return out.slice(0, 6)
}

export type SplitBaselineBucket = Record<string, number[]>

export interface SplitPerf {
  key: string
  label: string
  ms: number | null
  score: number | null
  pctLabel: string
  sample: number
}

const SPLIT_SEGMENTS: { key: string; label: string }[] = [
  { key: 'overworld', label: 'Overworld' },
  { key: 'nether', label: 'Nether' },
  { key: 'bastion', label: 'Bastion' },
  { key: 'fortress', label: 'Fortress' },
  { key: 'blind', label: 'Blind' },
  { key: 'stronghold', label: 'Stronghold' },
  { key: 'end', label: 'The End' }
]

const M_NETHER = 'story.enter_the_nether'
const M_BASTION = 'nether.find_bastion'
const M_FORTRESS = 'nether.find_fortress'
const M_BLIND = 'projectelo.timeline.blind_travel'
const M_STRONGHOLD = 'story.follow_ender_eye'
const M_END = 'story.enter_the_end'

function matchSegments(uuid: string, m: MatchInfo): Record<string, number> {
  const t = (ev: string): number | null => earliestEvent(uuid, m, ev)
  const nether = t(M_NETHER)
  const bastion = t(M_BASTION)
  const fortress = t(M_FORTRESS)
  const blind = t(M_BLIND)
  const stronghold = t(M_STRONGHOLD)
  const end = t(M_END)
  const won = m.result?.uuid === uuid
  const finish = won && !m.forfeited && typeof m.result?.time === 'number' ? m.result.time : null
  const out: Record<string, number> = {}
  const seg = (key: string, a: number | null, b: number | null): void => {
    if (a != null && b != null && b > a) out[key] = b - a
  }
  if (nether != null && nether > 0) out.overworld = nether
  seg('nether', nether, bastion)
  seg('bastion', bastion, fortress)
  seg('fortress', fortress, blind)
  seg('blind', blind, stronghold)
  seg('stronghold', stronghold, end)
  seg('end', end, finish)
  return out
}

export function playerSegments(
  uuid: string,
  details: MatchInfo[]
): Record<string, { avg: number; count: number }> {
  const me = uuid.toLowerCase()
  const list = Array.isArray(details)
    ? details.filter((m) => m && m.type === 2 && Array.isArray(m.timelines))
    : []
  const acc: Record<string, number[]> = {}
  for (const m of list) {
    for (const [k, v] of Object.entries(matchSegments(me, m))) (acc[k] ??= []).push(v)
  }
  const out: Record<string, { avg: number; count: number }> = {}
  for (const { key } of SPLIT_SEGMENTS) {
    const arr = acc[key]
    if (arr && arr.length) {
      out[key] = { avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), count: arr.length }
    }
  }
  return out
}

function fasterFraction(t: number, arr: number[]): number {
  const n = arr.length
  if (n < 2) return 0.5
  if (t <= arr[0]) return 0
  if (t >= arr[n - 1]) return 1
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= t) lo = mid
    else hi = mid
  }
  const span = arr[hi] - arr[lo] || 1
  return Math.max(0, Math.min(1, (lo + (t - arr[lo]) / span) / (n - 1)))
}

export function splitPerformance(
  uuid: string,
  details: MatchInfo[],
  baseline: SplitBaselineBucket | undefined
): SplitPerf[] {
  const segs = playerSegments(uuid, details)
  return SPLIT_SEGMENTS.map(({ key, label }) => {
    const p = segs[key]
    const arr = baseline?.[key]
    if (!p || !arr || arr.length < 2) {
      return { key, label, ms: p?.avg ?? null, score: null, pctLabel: '—', sample: p?.count ?? 0 }
    }
    const f = fasterFraction(p.avg, arr)
    const score = clamp100((1 - f) * 100)
    const pctLabel = f <= 0.5 ? `Top ${pctText(f * 100)}` : `Bottom ${pctText((1 - f) * 100)}`
    return { key, label, ms: p.avg, score, pctLabel, sample: p.count }
  })
}

export function pctText(share: number): string {
  return share < 10.05 ? `${Math.max(0.1, Math.round(share * 10) / 10).toFixed(1)}%` : `${Math.round(share)}%`
}

export function strongestWeakest(
  perf: SplitPerf[],
  minSample = 3
): { strongest: SplitPerf; weakest: SplitPerf } | null {
  const rated = perf.filter((p) => p.score != null && p.sample >= minSample)
  if (rated.length < 2) return null
  const by = [...rated].sort((a, b) => (b.score as number) - (a.score as number))
  return { strongest: by[0], weakest: by[by.length - 1] }
}

export interface SplitBreakdownRow {
  key: string
  label: string
  reached: number
  started: number
  deaths: number
  deathRate: number | null
  oppDeaths: number
  oppDeathRate: number | null
}

export interface SplitBreakdown {
  games: number
  completions: number
  rows: SplitBreakdownRow[]
}

function routeMarks(uuid: string, m: MatchInfo): (number | null)[] {
  const won = m.result?.uuid === uuid && !m.forfeited
  const finish = won && typeof m.result?.time === 'number' ? m.result.time : null
  const marks = [M_NETHER, M_BASTION, M_FORTRESS, M_BLIND, M_STRONGHOLD, M_END].map((ev) =>
    earliestEvent(uuid, m, ev)
  )
  return [0, ...marks, finish]
}

export function splitBreakdown(uuid: string, details: MatchInfo[]): SplitBreakdown {
  const me = uuid.toLowerCase()
  const list = Array.isArray(details)
    ? details.filter((m) => m && m.type === 2 && Array.isArray(m.timelines))
    : []
  const n = SPLIT_SEGMENTS.length
  const tally = () => ({ started: new Array(n).fill(0), reached: new Array(n).fill(0), deaths: new Array(n).fill(0) })
  const mine = tally()
  const opp = tally()
  let completions = 0
  const add = (who: string, m: MatchInfo, into: ReturnType<typeof tally>): boolean => {
    const marks = routeMarks(who, m)
    for (let k = 0; k < n; k++) {
      if (marks[k] != null) into.started[k]++
      if (marks[k + 1] != null) into.reached[k]++
    }
    for (const e of m.timelines!) {
      if (!e || typeof e.uuid !== 'string' || e.uuid.toLowerCase() !== who || e.type !== REAL_DEATH_EVENT) continue
      let k = 0
      for (let i = 1; i < n; i++) if (marks[i] != null && (marks[i] as number) <= e.time) k = i
      into.deaths[k]++
    }
    return marks[n] != null
  }
  for (const m of list) {
    if (add(me, m, mine)) completions++
    const other = m.players?.find((p) => p.uuid.toLowerCase() !== me)
    if (other) add(other.uuid.toLowerCase(), m, opp)
  }
  const rate = (d: number, s: number): number | null => (s > 0 ? d / s : null)
  return {
    games: list.length,
    completions,
    rows: SPLIT_SEGMENTS.map(({ key, label }, k) => ({
      key,
      label,
      reached: mine.reached[k],
      started: mine.started[k],
      deaths: mine.deaths[k],
      deathRate: rate(mine.deaths[k], mine.started[k]),
      oppDeaths: opp.deaths[k],
      oppDeathRate: rate(opp.deaths[k], opp.started[k])
    }))
  }
}

export function speedFromPerf(perf: SplitPerf[]): { score: number; sample: number } | null {
  const scored = perf.filter((p) => p.score != null)
  if (scored.length < 2) return null
  const avg = scored.reduce((s, p) => s + (p.score as number), 0) / scored.length
  return { score: Math.round(avg), sample: scored.length }
}

export interface MatchupInput {
  elo: number | null
  winRate: number | null
  avgWin: number | null
  splitScore: number | null
  completion: number | null
  streak: number | null
  games: number
}

export interface MatchupFactor {
  key: string
  label: string
  favors: 'a' | 'b' | 'even'
  edge: number
}

export interface Matchup {
  pA: number | null
  adjustElo: number
  edge: number
  factors: MatchupFactor[]
  eloOnly: boolean
}

const MATCHUP_EDGE_MAX = 200
const MATCHUP_FULL_TRUST = 10
const MATCHUP_AVGWIN_REF_MS = 60_000

function clampSigned(n: number): number {
  return Math.max(-1, Math.min(1, n))
}

export function matchupWinChance(a: MatchupInput, b: MatchupInput): Matchup {
  const raw: Array<{ key: string; label: string; weight: number; edge: number | null }> = [
    {
      key: 'splits',
      label: 'Splits',
      weight: 0.35,
      edge:
        a.splitScore != null && b.splitScore != null
          ? clampSigned((a.splitScore - b.splitScore) / 100)
          : null
    },
    {
      key: 'winrate',
      label: 'Win rate',
      weight: 0.25,
      edge: a.winRate != null && b.winRate != null ? clampSigned((a.winRate - b.winRate) / 100) : null
    },
    {
      key: 'pace',
      label: 'Avg win',
      weight: 0.15,
      edge:
        a.avgWin != null && b.avgWin != null
          ? clampSigned((b.avgWin - a.avgWin) / MATCHUP_AVGWIN_REF_MS)
          : null
    },
    {
      key: 'finishing',
      label: 'Finishing',
      weight: 0.15,
      edge:
        a.completion != null && b.completion != null ? clampSigned(a.completion - b.completion) : null
    },
    {
      key: 'form',
      label: 'Form',
      weight: 0.1,
      edge: a.streak != null && b.streak != null ? clampSigned((a.streak - b.streak) / 5) : null
    }
  ]

  const present = raw.filter((s) => s.edge != null)
  const factors: MatchupFactor[] = present
    .map((s) => {
      const e = s.edge as number
      return {
        key: s.key,
        label: s.label,
        favors: (Math.abs(e) < 0.02 ? 'even' : e > 0 ? 'a' : 'b') as 'a' | 'b' | 'even',
        edge: s.weight * e
      }
    })
    .sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge))

  const wSum = present.reduce((s, x) => s + x.weight, 0)
  const edge = wSum > 0 ? present.reduce((s, x) => s + x.weight * (x.edge as number), 0) / wSum : 0

  const games = Math.min(a.games, b.games)
  const shrink = Math.max(0, Math.min(1, games / MATCHUP_FULL_TRUST))
  const adjustElo = MATCHUP_EDGE_MAX * edge * shrink

  const eloOnly = present.length === 0
  if (a.elo == null || b.elo == null) {
    return { pA: null, adjustElo, edge, factors, eloOnly }
  }
  const pA = 1 / (1 + Math.pow(10, (b.elo - a.elo - adjustElo) / 400))
  return { pA, adjustElo, edge, factors, eloOnly }
}

const MATCH_MILESTONES: { key: string; label: string; type: string }[] = [
  { key: 'nether', label: 'Nether', type: 'story.enter_the_nether' },
  { key: 'bastion', label: 'Bastion', type: 'nether.find_bastion' },
  { key: 'fortress', label: 'Fortress', type: 'nether.find_fortress' },
  { key: 'rod', label: 'First rod', type: 'nether.obtain_blaze_rod' },
  { key: 'blind', label: 'Blind', type: 'projectelo.timeline.blind_travel' },
  { key: 'stronghold', label: 'Stronghold', type: 'story.follow_ender_eye' },
  { key: 'end', label: 'End', type: 'story.enter_the_end' }
]

const MATCH_MARKERS: { key: string; label: string; type: string }[] = [
  { key: 'death', label: 'Death', type: 'projectelo.timeline.death' },
  { key: 'reset', label: 'Reset', type: 'projectelo.timeline.reset' }
]

export interface MatchEvent {
  key: string
  label: string
  ms: number
  milestone: boolean
}

export interface MatchSplitRow {
  key: string
  label: string
  aMs: number | null
  bMs: number | null
  delta: number | null
}

export interface MatchBreakdown {
  aEvents: MatchEvent[]
  bEvents: MatchEvent[]
  timestamps: MatchSplitRow[]
  segments: MatchSplitRow[]
}

function firstTimeOf(tl: TimelineEvent[], uuid: string, type: string): number | null {
  let earliest: number | null = null
  for (const e of tl) {
    if (e && e.uuid === uuid && e.type === type && typeof e.time === 'number' && e.time > 0) {
      if (earliest == null || e.time < earliest) earliest = e.time
    }
  }
  return earliest
}

function playerEvents(tl: TimelineEvent[], uuid: string, finishMs: number | null): MatchEvent[] {
  const wanted = new Map<string, { label: string; milestone: boolean }>()
  for (const s of MATCH_MILESTONES) wanted.set(s.type, { label: s.label, milestone: true })
  for (const s of MATCH_MARKERS) wanted.set(s.type, { label: s.label, milestone: false })

  const raw = tl
    .filter(
      (e) => e && e.uuid === uuid && wanted.has(e.type) && typeof e.time === 'number' && e.time > 0
    )
    .map((e) => ({ type: e.type, ms: e.time }))
    .sort((x, y) => x.ms - y.ms)

  const seen: Record<string, number> = {}
  const events: MatchEvent[] = raw.map((e, i) => {
    const w = wanted.get(e.type)!
    seen[e.type] = (seen[e.type] ?? 0) + 1
    const n = seen[e.type]
    return {
      key: `${e.type}-${i}`,
      label: n > 1 ? `${w.label} ${n}` : w.label,
      ms: e.ms,
      milestone: w.milestone
    }
  })
  if (finishMs != null && finishMs > 0) {
    events.push({ key: 'finish', label: 'Finish', ms: finishMs, milestone: true })
  }
  return events
}

function matchSegmentDurations(tl: TimelineEvent[], uuid: string, finishMs: number | null): Record<string, number> {
  const segs: Record<string, number> = {}
  let prev = 0
  for (const s of MATCH_MILESTONES) {
    const t = firstTimeOf(tl, uuid, s.type)
    if (t == null) continue
    segs[s.key] = t - prev
    prev = t
  }
  if (finishMs != null && finishMs > 0 && finishMs > prev) segs['finish'] = finishMs - prev
  return segs
}

export function matchBreakdown(m: MatchInfo, uuidA: string, uuidB: string): MatchBreakdown {
  const a = uuidA.toLowerCase()
  const b = uuidB.toLowerCase()
  const tl: TimelineEvent[] = Array.isArray(m.timelines)
    ? m.timelines.map((e) => ({ ...e, uuid: (e.uuid ?? '').toLowerCase() }))
    : []

  const finishOf = (u: string): number | null => {
    const c = m.completions?.find((x) => (x.uuid ?? '').toLowerCase() === u)?.time
    if (typeof c === 'number' && c > 0) return c
    if (
      m.result?.uuid &&
      m.result.uuid.toLowerCase() === u &&
      !m.forfeited &&
      typeof m.result?.time === 'number' &&
      m.result.time > 0
    ) {
      return m.result.time
    }
    return null
  }
  const aFin = finishOf(a)
  const bFin = finishOf(b)

  const timestamps: MatchSplitRow[] = []
  for (const s of MATCH_MILESTONES) {
    const aMs = firstTimeOf(tl, a, s.type)
    const bMs = firstTimeOf(tl, b, s.type)
    if (aMs == null && bMs == null) continue
    timestamps.push({ key: s.key, label: s.label, aMs, bMs, delta: aMs != null && bMs != null ? aMs - bMs : null })
  }
  if (aFin != null || bFin != null) {
    timestamps.push({ key: 'finish', label: 'Finish', aMs: aFin, bMs: bFin, delta: aFin != null && bFin != null ? aFin - bFin : null })
  }

  const aSeg = matchSegmentDurations(tl, a, aFin)
  const bSeg = matchSegmentDurations(tl, b, bFin)
  const segments: MatchSplitRow[] = []
  for (const s of [...MATCH_MILESTONES, { key: 'finish', label: 'Finish' }]) {
    const aMs = aSeg[s.key] ?? null
    const bMs = bSeg[s.key] ?? null
    if (aMs == null && bMs == null) continue
    segments.push({ key: s.key, label: s.label, aMs, bMs, delta: aMs != null && bMs != null ? aMs - bMs : null })
  }

  return { aEvents: playerEvents(tl, a, aFin), bEvents: playerEvents(tl, b, bFin), timestamps, segments }
}

export function splitCallouts(
  perf: SplitPerf[],
  segs: Record<string, { avg: number; count: number }>,
  nextTier?: { label: string; bucket: SplitBaselineBucket }
): RankedInsight[] {
  const out: RankedInsight[] = []
  const scored = perf.filter((p) => p.score != null)
  if (scored.length >= 3) {
    const best = scored.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a))
    const worst = scored.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a))
    if (worst !== best) {
      out.push({
        kind: 'strength',
        label: 'Best split',
        detail: `${best.label} — ${best.pctLabel}.`
      })
      out.push({
        kind: 'weakness',
        label: 'Weakest split',
        detail: `${worst.label} — ${worst.pctLabel}.`
      })
    }
  }
  if (nextTier) {
    let focus: { label: string; gap: number } | null = null
    for (const p of perf) {
      const seg = segs[p.key]
      const arr = nextTier.bucket[p.key]
      if (!seg || !arr || arr.length < 51) continue
      const gap = seg.avg - arr[50]
      if (gap > 0 && (!focus || gap > focus.gap)) focus = { label: p.label, gap }
    }
    if (focus) {
      out.push({
        kind: 'note',
        label: 'To rank up',
        detail: `Your ${focus.label} is ${msToTime(focus.gap)} behind ${nextTier.label} pace.`
      })
    }
  }
  return out
}
