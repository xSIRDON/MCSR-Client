// Pure, dependency-free analytics over a player's ranked match history.
// Only a type-only import of MatchInfo (no runtime dependency).
// Matches are assumed to arrive newest-first (as the MCSR API returns them).

import type { MatchInfo, TimelineEvent } from '@services/mcsr-ranked'
import { msToTime } from './format'

export interface RankedInsight {
  kind: 'strength' | 'weakness' | 'note'
  label: string
  detail: string
}

export interface RankedAnalytics {
  played: number // matches analyzed (ranked)
  wins: number
  losses: number
  draws: number // no decisive winner (result.uuid == null)
  decided: number // wins + losses
  winRate: number // % over decided, 1 decimal
  netElo: number // sum of your changes
  biggestGain: number // max positive change (0 if none)
  biggestLoss: number // min negative change (0 if none)
  currentStreak: number // signed: + = win streak, - = loss streak (most recent matches)
  bestWinStreak: number
  best: number | null // your fastest winning time (ms)
  averageWin: number | null // mean of your winning times (ms)
  medianWin: number | null // median of your winning times (ms)
  recentWinRate: number // win% over the last up-to-20 decided
  recentSample: number
  vsHigher: { decided: number; winRate: number } // matches where opponent's eloRate > yours
  vsLower: { decided: number; winRate: number }
  forfeits: { yours: number; theirs: number } // approx: a forfeited match you lost = yours; one you won = theirs
  completionTimes: number[] // your winning times (ms), newest-first, for a histogram
  insights: RankedInsight[] // 3–6 derived strengths/weaknesses/notes
}

/** Round to one decimal place. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Win% over decided games, 1 decimal, guarding divide-by-zero. */
function pct(wins: number, decided: number): number {
  if (decided <= 0) return 0
  return round1((wins / decided) * 100)
}

/** Median of a numeric list (sorted copy); null if empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Only decisive ranked games where this player took part, for win-rate splits. */
type Outcome = 'win' | 'loss' | 'draw' | 'skip'

function outcomeFor(uuid: string, m: MatchInfo): Outcome {
  const winner = m.result?.uuid
  if (winner == null) return 'draw'
  if (winner === uuid) return 'win'
  // A decisive result for someone other than us is a loss (provided we were involved).
  return 'loss'
}

export function analyzeRanked(uuid: string, matches: MatchInfo[]): RankedAnalytics {
  uuid = uuid.toLowerCase() // MCSR uuids are lowercase dashless; guard a mixed-case caller
  const list = Array.isArray(matches) ? matches.filter((m) => m && m.type === 2) : []

  let wins = 0
  let losses = 0
  let draws = 0
  let netElo = 0
  let biggestGain = 0
  let biggestLoss = 0
  let bestWinStreak = 0
  let runningWinStreak = 0

  // Forfeits.
  let forfeitsYours = 0
  let forfeitsTheirs = 0

  // vs higher / lower elo (only decided games with both elos known).
  let higherDecided = 0
  let higherWins = 0
  let lowerDecided = 0
  let lowerWins = 0

  const winTimes: number[] = [] // your winning times (ms), in match order (newest-first)

  // Per-decided outcome sequence in newest-first order, for streak + recent form.
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

    // Your elo change for this match.
    const mine = m.changes?.find((c) => c.uuid === uuid)
    if (mine && typeof mine.change === 'number') {
      netElo += mine.change
      if (mine.change > biggestGain) biggestGain = mine.change
      if (mine.change < biggestLoss) biggestLoss = mine.change
    }

    // Best win streak (scan in order; direction doesn't matter for the max run).
    if (outcome === 'win') {
      runningWinStreak++
      if (runningWinStreak > bestWinStreak) bestWinStreak = runningWinStreak
    } else if (outcome === 'loss') {
      runningWinStreak = 0
    }
    // Draws neither extend nor reset a win streak.

    // Forfeits (approx): a forfeited match we lost is ours, one we won is theirs.
    if (m.forfeited) {
      if (outcome === 'loss') forfeitsYours++
      else if (outcome === 'win') forfeitsTheirs++
    }

    // Winning completion times. A win by opponent forfeit carries the elapsed time at the
    // forfeit, not a run completion — counting it would poison Avg Win / best / the histogram.
    if (
      outcome === 'win' &&
      !m.forfeited &&
      typeof m.result?.time === 'number' &&
      m.result.time > 0
    ) {
      winTimes.push(m.result.time)
    }

    // vs higher / lower elo — needs both elos and a decisive result.
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

  // Current streak: signed run from the most recent decided games.
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

  // Recent form: last up-to-20 decided games.
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

  const insights = buildInsights({
    played,
    decided,
    wins,
    overallWinRate,
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

/** Derive 3–6 short strengths/weaknesses/notes from the aggregate numbers. */
function buildInsights(d: InsightInput): RankedInsight[] {
  const out: RankedInsight[] = []

  if (d.played === 0) {
    out.push({ kind: 'note', label: 'No data', detail: 'No ranked matches to analyze yet.' })
    return out
  }

  // Performance against higher-rated opponents (needs a meaningful sample).
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

  // Closing out games you should win.
  if (d.vsLower.decided >= 3 && d.vsLower.winRate < 50) {
    out.push({
      kind: 'weakness',
      label: 'Drops winnable games',
      detail: `${d.vsLower.winRate}% vs lower-rated opponents.`
    })
  }

  // Recent form trend vs overall.
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

  // Current streak.
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

  // Forfeit rate.
  if (d.decided > 0) {
    const ffRate = round1((d.forfeitsYours / d.decided) * 100)
    if (ffRate >= 20) {
      out.push({
        kind: 'weakness',
        label: 'Forfeits often',
        detail: `You forfeited ${ffRate}% of decided games.`
      })
    } else if (d.forfeitsTheirs > d.forfeitsYours && d.forfeitsTheirs >= 3) {
      out.push({
        kind: 'note',
        label: 'Opponents fold',
        detail: `${d.forfeitsTheirs} opponents forfeited to you.`
      })
    }
  }

  // Consistency: best vs average winning time.
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

  // Best win streak as a positive note if nothing else stood out.
  if (d.bestWinStreak >= 5) {
    out.push({
      kind: 'note',
      label: 'Peak streak',
      detail: `Longest win streak: ${d.bestWinStreak} games.`
    })
  }

  // Always have at least one insight; cap at 6.
  if (out.length === 0) {
    out.push({
      kind: 'note',
      label: 'Even keel',
      detail: `${d.overallWinRate}% win rate over ${d.decided} decided games.`
    })
  }
  return out.slice(0, 6)
}

// ---- Splits (from match-detail timelines) ----

export interface SplitStat {
  key: string
  label: string
  best: number | null // fastest ms reaching this split
  average: number | null // mean ms
  count: number // matches contributing
}

/** Cumulative milestones in run order, mapped to their MCSR timeline event types. */
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
  return {
    key,
    label,
    best: valid.length ? Math.min(...valid) : null,
    average: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
    count: valid.length
  }
}

/**
 * Per-split best/average across the player's matches, computed from match-detail timelines.
 * Cumulative milestones (Overworld → End) use the player's own event time in each match.
 * Finish uses the player's winning time; Fort → Finish is the segment from the fortress to that win.
 * Returns one SplitStat per milestone (run order), then Finish, then Fort → Finish.
 */
export function analyzeSplits(uuid: string, details: MatchInfo[]): SplitStat[] {
  uuid = uuid.toLowerCase() // MCSR uuids are lowercase dashless; guard a mixed-case caller
  const list = Array.isArray(details) ? details.filter((m) => m && m.type === 2) : []

  const buckets: Record<string, number[]> = {}
  for (const s of CUMULATIVE_SPLITS) buckets[s.key] = []
  const finishTimes: number[] = []
  const fortToFinish: number[] = []

  for (const m of list) {
    const tl = m.timelines
    if (!Array.isArray(tl)) continue

    // Earliest time of an event type for this player in this match (null if absent).
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

    // Finish + Fort → Finish only count when this player won the match — and actually ran it
    // out: a win by opponent forfeit carries the elapsed time at the forfeit, not a completion.
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

// ---- Practice: gap between a top runner's seed run and your typical splits ----

export interface GapRow {
  key: string
  label: string
  /** The top runner's time to this split on the seed (ms), or null. */
  runnerMs: number | null
  /** Your average time to this split (ms), or null. */
  youMs: number | null
  /** youMs − runnerMs: positive = you're slower (time to make up), negative = you're ahead. */
  delta: number | null
}

/**
 * The split-by-split gap between a top runner's run on a seed and your own typical splits. Feed it
 * `analyzeSplits(runnerUuid, [theirMatch])` (their times on that one seed) and
 * `analyzeSplits(yourUuid, yourRecentMatches)` (your averages). Rows follow the runner's splits, so
 * a split they never reached drops out; `youMs`/`delta` are null where you have no baseline yet.
 */
export function buildSplitGap(runner: SplitStat[], you: SplitStat[]): GapRow[] {
  const youBy = new Map(you.map((s) => [s.key, s]))
  return runner.map((r) => {
    const youMs = youBy.get(r.key)?.average ?? null
    return {
      key: r.key,
      label: r.label,
      runnerMs: r.average,
      youMs,
      delta: r.average != null && youMs != null ? youMs - r.average : null
    }
  })
}

/** Human label for a seed structure code, e.g. RUINED_PORTAL → "Ruined Portal", BRIDGE → "Bridge". */
export function seedStructureLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return code
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// ---- Per-type breakdowns (overworld structure & bastion remnant type) ----

export interface TypeStat {
  key: string // canonical key, e.g. 'VILLAGE'
  label: string // display label, e.g. 'Village'
  count: number // ranked matches of this type (from the match list)
  decided: number // decisive matches (basis for win rate)
  wins: number
  winRate: number | null // % over decided, 1dp; null when none decided
  best: number | null // fastest split time for this type (ms; from detail timelines)
  average: number | null // mean split time (ms)
  timeSample: number // matches contributing a split time
}

export interface TypeBreakdown {
  dimension: 'overworld' | 'bastion'
  splitLabel: string // the cumulative split this type gates: 'Overworld' | 'Bastion'
  rows: TypeStat[] // types with count > 0, most-played first
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

/** Normalize a seed/bastion type to a canonical key, or null for missing/unclassified. */
function normalizeType(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const k = v.trim().toUpperCase()
  return k && k !== 'NONE' ? k : null
}

/** First usable, normalized type among candidates (skips null/undefined/empty), else null. */
function pickType(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const k = normalizeType(c)
    if (k) return k
  }
  return null
}

/** Title-case an unknown underscore key as a fallback label, e.g. FOO_BAR -> 'Foo Bar'. */
function prettyType(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Earliest time of an event type for this player in a match's timeline (null if absent). */
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

  // Frequency + win rate from the full match list (no detail fetch needed).
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

  // Split times from match-detail timelines, grouped by the same type key.
  const times: Record<string, number[]> = {}
  const rankedDetails = Array.isArray(details) ? details.filter((m) => m && m.type === 2) : []
  for (const m of rankedDetails) {
    const key = typeKey(m)
    if (!key) continue
    const t = earliestEvent(uuid, m, eventType)
    if (t != null) (times[key] ??= []).push(t)
  }

  // Always include every canonical type (so e.g. Housing shows even with no games yet), plus
  // any extra type seen in the data — a type can be classified only in the detail timelines
  // even when its list entry was unclassified, and vice-versa.
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

/**
 * Break the Overworld and Bastion splits down by seed type.
 * Counts and win rates come from the match list (`matches`); split best/average times come
 * from match-detail timelines (`details`). The two samples can differ in size — that's expected.
 */
export function analyzeTypeBreakdowns(
  uuid: string,
  matches: MatchInfo[],
  details: MatchInfo[]
): { overworld: TypeBreakdown; bastion: TypeBreakdown } {
  uuid = uuid.toLowerCase() // MCSR uuids are lowercase dashless; guard a mixed-case caller
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

// ---- Deaths (from match-detail timelines) ----

// Only a real, costly death counts. `projectelo.timeline.death_spawnpoint` is deliberately
// EXCLUDED: that's a strategic reset death — dying on purpose with a bed/anchor spawn set to
// refill health/hunger (e.g. before the end, or when blinding in the overworld), which is good
// play. The bare `projectelo.timeline.death` is the mistake we want to flag.
const REAL_DEATH_EVENT = 'projectelo.timeline.death'

export interface DeathStats {
  total: number // real (non-strategic) deaths
  matches: number // ranked matches (with timelines) counted
  perMatch: number
}

/** Count the player's real deaths across recent match-detail timelines (strategic resets excluded). */
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

// ---- Strengths & weaknesses (play-style scorecard + split radar) ----

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export interface ScoreDim {
  key: string
  label: string
  score: number // 0–100, higher = stronger
  detail: string
  sample: number // games backing this dimension
}

/**
 * Play-style dimensions on a 0–100 scale (higher = stronger). Win Rate is authoritative
 * (season stats); the rest derive from the recent match window. Only dimensions with data
 * are returned, so a sparse history yields a smaller — but honest — radar.
 */
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

/**
 * Human-readable strengths/weaknesses, anchored to the authoritative season record so they
 * stay meaningful even when the recent match window is a sparse losing streak.
 */
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

  // Survival is handled explicitly below, so keep it out of the generic best/worst pick.
  const ranked = dims
    .filter((d) => d.key !== 'winrate' && d.key !== 'survival' && d.sample >= 3)
    .sort((x, y) => y.score - x.score)
  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  if (top && top.score >= 55) out.push({ kind: 'strength', label: top.label, detail: `${top.detail}.` })
  if (bottom && bottom !== top && bottom.score <= 45) {
    out.push({ kind: 'weakness', label: bottom.label, detail: `${bottom.detail}.` })
  }

  // Real deaths (strategic resets already excluded) are a costly, flaggable weakness.
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

// ---- Split Performance (percentile vs a bundled baseline) ----

/** A baseline distribution: segment key -> 101 ascending percentile-point times (ms). */
export type SplitBaselineBucket = Record<string, number[]>

export interface SplitPerf {
  key: string
  label: string
  ms: number | null // the player's average segment time
  score: number | null // 0–100 for the radar (higher = faster than more of the field)
  pctLabel: string // "Top 10%" / "Bottom 25%" / "—"
  sample: number // matches contributing this segment
}

/** The seven run segments (durations between milestones), in run order. */
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

/** Per-segment durations for one match (canonical route: consecutive-milestone diffs, positive only). */
function matchSegments(uuid: string, m: MatchInfo): Record<string, number> {
  const t = (ev: string): number | null => earliestEvent(uuid, m, ev)
  const nether = t(M_NETHER)
  const bastion = t(M_BASTION)
  const fortress = t(M_FORTRESS)
  const blind = t(M_BLIND)
  const stronghold = t(M_STRONGHOLD)
  const end = t(M_END)
  const won = m.result?.uuid === uuid
  // A forfeit "win time" is the elapsed time at the forfeit, not a completion — never a real
  // end split.
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

/** The player's average time per segment across their recent match-detail timelines. */
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

/** Fraction of the baseline strictly faster (smaller) than t. `arr` is ascending (101 points). */
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

/**
 * Rank the player's average segment times against a baseline distribution. One entry per segment:
 * a 0–100 radar score (higher = faster than more of the field) and a "Top X%" / "Bottom X%" label.
 */
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
    const pctLabel =
      f <= 0.5
        ? `Top ${Math.max(1, Math.round(f * 100))}%`
        : `Bottom ${Math.max(1, Math.round((1 - f) * 100))}%`
    return { key, label, ms: p.avg, score, pctLabel, sample: p.count }
  })
}

/**
 * Overall run pace as a single 0–100 play-style score: the average of the player's split
 * percentiles vs the field (higher = faster than more players). Null until a couple of splits
 * are rated. Feeds the "Speed" dimension on the strengths & weaknesses radar.
 */
export function speedFromPerf(perf: SplitPerf[]): { score: number; sample: number } | null {
  const scored = perf.filter((p) => p.score != null)
  if (scored.length < 2) return null
  const avg = scored.reduce((s, p) => s + (p.score as number), 0) / scored.length
  return { score: Math.round(avg), sample: scored.length }
}

// ---- Composite matchup win chance (Elo anchor + splits + form) ----

/** One player's inputs to the matchup metric. A missing signal simply drops out of the
 *  blend (weights renormalize over what's present) rather than counting as a tie. */
export interface MatchupInput {
  elo: number | null
  /** Season win rate, 0–100. */
  winRate: number | null
  /** Mean winning time in ms (lower = faster). */
  avgWin: number | null
  /** Average split percentile vs the field, 0–100 (from speedFromPerf). */
  splitScore: number | null
  /** Share of decided games NOT forfeited, 0–1 (higher = doesn't fold). */
  completion: number | null
  /** Current signed streak (+win / −loss). */
  streak: number | null
  /** Decided games backing these numbers — thin records lean on Elo. */
  games: number
}

export interface MatchupFactor {
  key: string
  label: string
  favors: 'a' | 'b' | 'even'
  /** Signed (A-positive), already weighted — magnitude ranks the factors. */
  edge: number
}

export interface Matchup {
  /** A's win probability, 0–1. Null when either Elo is missing. */
  pA: number | null
  /** Effective-Elo tilt the non-Elo signals applied to A (signed, already sample-shrunk). */
  adjustElo: number
  /** Composite edge for A across the blended signals, roughly −1..1. */
  edge: number
  factors: MatchupFactor[]
  /** True when no split/form signals were available and only Elo drove the number. */
  eloOnly: boolean
}

// How many effective Elo points a total domination (edge = ±1) in the side signals is worth.
// Elo already encodes head-to-head skill, so this stays deliberately bounded — the side
// signals tilt the matchup, they don't overturn the rating.
const MATCHUP_EDGE_MAX = 200
// Records below this many decided games shrink the side-signal tilt toward zero.
const MATCHUP_FULL_TRUST = 10
// A 60s gap in mean finish time counts as a full-strength pace edge.
const MATCHUP_AVGWIN_REF_MS = 60_000

function clampSigned(n: number): number {
  return Math.max(-1, Math.min(1, n))
}

/**
 * Composite win chance: the textbook Elo expectation, tilted by who holds the edge in splits,
 * win rate, finishing pace, not-folding, and recent form. Every signal is expressed in
 * effective-Elo so the tilt stays interpretable and Elo remains the anchor. Signals absent for
 * a side drop out of the blend rather than counting as a tie, and the whole tilt shrinks toward
 * zero on small records (where the side stats are just noise).
 */
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

  // Renormalize over present weights so a missing signal doesn't just deflate the blend.
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

// ---- Single-match head-to-head breakdown (splits & timestamps) ----

/** Run-order milestones in a single match's breakdown — the ones that earn a head-to-head
 *  delta. Order matters: segment durations are measured between consecutive reached ones. */
const MATCH_MILESTONES: { key: string; label: string; type: string }[] = [
  { key: 'nether', label: 'Nether', type: 'story.enter_the_nether' },
  { key: 'bastion', label: 'Bastion', type: 'nether.find_bastion' },
  { key: 'fortress', label: 'Fortress', type: 'nether.find_fortress' },
  { key: 'rod', label: 'First rod', type: 'nether.obtain_blaze_rod' },
  { key: 'blind', label: 'Blind', type: 'projectelo.timeline.blind_travel' },
  { key: 'stronghold', label: 'Stronghold', type: 'story.follow_ender_eye' },
  { key: 'end', label: 'End', type: 'story.enter_the_end' }
]

/** Non-milestone markers surfaced in a player's timestamp column (never earn a delta). */
const MATCH_MARKERS: { key: string; label: string; type: string }[] = [
  { key: 'death', label: 'Death', type: 'projectelo.timeline.death' },
  { key: 'reset', label: 'Reset', type: 'projectelo.timeline.reset' }
]

export interface MatchEvent {
  key: string // stable key for React
  label: string // numbered on repeat, e.g. "Nether 2"
  ms: number
  milestone: boolean // true for run-order milestones, false for death/reset markers
}

export interface MatchSplitRow {
  key: string
  label: string
  aMs: number | null
  bMs: number | null
  /** aMs − bMs when both present; negative = player A ahead/faster. Null otherwise. */
  delta: number | null
}

export interface MatchBreakdown {
  /** Time-ordered events (milestones + death/reset) for each player's timestamp column. */
  aEvents: MatchEvent[]
  bEvents: MatchEvent[]
  /** Per run-order milestone (first occurrence): each player's absolute time + delta. */
  timestamps: MatchSplitRow[]
  /** Per segment (→Nether→…→Finish): each player's duration + delta. */
  segments: MatchSplitRow[]
}

/** Earliest time (ms) a player hit an event type in this match, or null if they never did. */
function firstTimeOf(tl: TimelineEvent[], uuid: string, type: string): number | null {
  let earliest: number | null = null
  for (const e of tl) {
    if (e && e.uuid === uuid && e.type === type && typeof e.time === 'number' && e.time > 0) {
      if (earliest == null || e.time < earliest) earliest = e.time
    }
  }
  return earliest
}

/** One player's milestones + death/reset markers, in time order, with repeats numbered. */
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

/** Per-segment durations (keyed by milestone key) for one player: gap from the previous reached
 *  milestone, starting at 0, plus a Finish segment when the player completed. */
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

/**
 * Head-to-head breakdown of a single match for its two players, feeding the match card's
 * Splits ⇄ Timestamps views: per-player time-ordered event columns, per-milestone absolute
 * timestamps with deltas, and per-segment durations with deltas. Deltas are A-minus-B (negative
 * favors A). A finish time is taken from the per-player completions, else the winner's run time.
 */
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

/**
 * Textual split callouts: your best and weakest split (by percentile), and — when a tier above
 * exists — the split where you lose the most time vs that tier's median ("to rank up").
 */
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
    // Only call out a best vs weakest when there is real spread — if every split ties on score
    // (e.g. a player faster or slower than the whole field across the board) `best` and `worst`
    // collapse to the same segment, which must not be labelled both a strength and a weakness.
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
      const gap = seg.avg - arr[50] // player's avg minus the next tier's median
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
