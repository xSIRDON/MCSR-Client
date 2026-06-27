import type { MatchInfo } from '@services/mcsr-ranked'

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

export function analyzeRanked(uuid: string, matches: MatchInfo[]): RankedAnalytics {
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

    if (outcome === 'win' && typeof m.result?.time === 'number' && m.result.time > 0) {
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
      detail: `${d.overallWinRate}% win rate over ${d.decided} decided games.`
    })
  }
  return out.slice(0, 6)
}

export interface SplitStat {
  key: string
  label: string
  best: number | null
  average: number | null
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
  return {
    key,
    label,
    best: valid.length ? Math.min(...valid) : null,
    average: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
    count: valid.length
  }
}

export function analyzeSplits(uuid: string, details: MatchInfo[]): SplitStat[] {
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
    const finish = won && typeof m.result?.time === 'number' ? m.result.time : null
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

  const keys = new Set<string>([...Object.keys(agg), ...Object.keys(times)])
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
