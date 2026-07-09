import { describe, it, expect } from 'vitest'
import {
  analyzeRanked,
  analyzeSplits,
  analyzeTypeBreakdowns,
  buildScorecard,
  countDeaths,
  matchBreakdown,
  matchupWinChance,
  playerSegments,
  scorecardInsights,
  speedFromPerf,
  splitCallouts,
  splitPerformance
} from './ranked-analytics'
import type { MatchupInput } from './ranked-analytics'
import { eloWinChance } from './rank'
import type { MatchInfo } from '@services/mcsr-ranked'

const ME = 'me-uuid'
const OPP = 'opp-uuid'

let nextId = 1

/** Build a ranked MatchInfo for `ME` vs `OPP` with sensible defaults. */
function match(opts: {
  winner?: string | null // result.uuid: ME, OPP, or null (draw)
  time?: number | null // winner completion time (ms)
  myChange?: number | null
  myRate?: number | null
  oppChange?: number | null
  oppRate?: number | null
  forfeited?: boolean
  type?: number
}): MatchInfo {
  const {
    winner = null,
    time = null,
    myChange = null,
    myRate = null,
    oppChange = null,
    oppRate = null,
    forfeited = false,
    type = 2
  } = opts
  return {
    id: nextId++,
    type,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: winner, time },
    forfeited,
    changes: [
      { uuid: ME, change: myChange, eloRate: myRate },
      { uuid: OPP, change: oppChange, eloRate: oppRate }
    ]
  }
}

describe('analyzeRanked', () => {
  it('returns an empty-but-safe shape for no matches', () => {
    const a = analyzeRanked(ME, [])
    expect(a.played).toBe(0)
    expect(a.wins).toBe(0)
    expect(a.winRate).toBe(0)
    expect(a.best).toBeNull()
    expect(a.averageWin).toBeNull()
    expect(a.medianWin).toBeNull()
    expect(a.completionTimes).toEqual([])
    expect(a.insights[0]).toMatchObject({ kind: 'note', label: 'No data' })
  })

  it('excludes forfeit wins from completion times — an FF time is not a run', () => {
    const a = analyzeRanked(ME, [
      match({ winner: ME, time: 720_000 }), // real 12:00 completion
      match({ winner: ME, time: 224_000, forfeited: true }) // opponent FF'd at 3:44
    ])
    expect(a.wins).toBe(2) // still a win on the record…
    expect(a.completionTimes).toEqual([720_000]) // …but not a completion
    expect(a.best).toBe(720_000)
    expect(a.averageWin).toBe(720_000)
  })

  it('counts wins, losses, draws and computes win rate over decided games', () => {
    const matches = [
      match({ winner: ME }),
      match({ winner: OPP }),
      match({ winner: ME }),
      match({ winner: null }) // draw
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.played).toBe(4)
    expect(a.wins).toBe(2)
    expect(a.losses).toBe(1)
    expect(a.draws).toBe(1)
    expect(a.decided).toBe(3)
    expect(a.winRate).toBe(66.7) // 2/3
  })

  it('ignores non-ranked matches', () => {
    const matches = [
      match({ winner: ME }),
      match({ winner: OPP, type: 1 }), // casual
      match({ winner: ME, type: 4 }) // event
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.played).toBe(1)
    expect(a.wins).toBe(1)
    expect(a.losses).toBe(0)
  })

  it('sums net elo and tracks biggest gain/loss', () => {
    const matches = [
      match({ winner: ME, myChange: 18, oppChange: -18 }),
      match({ winner: OPP, myChange: -22, oppChange: 22 }),
      match({ winner: ME, myChange: 9, oppChange: -9 })
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.netElo).toBe(5) // 18 - 22 + 9
    expect(a.biggestGain).toBe(18)
    expect(a.biggestLoss).toBe(-22)
  })

  it('computes a signed current streak from the most recent decided games', () => {
    // Newest-first: two wins on top, then a loss.
    const a = analyzeRanked(ME, [
      match({ winner: ME }),
      match({ winner: ME }),
      match({ winner: OPP })
    ])
    expect(a.currentStreak).toBe(2)

    // Newest-first: a loss streak.
    const b = analyzeRanked(ME, [
      match({ winner: OPP }),
      match({ winner: OPP }),
      match({ winner: OPP }),
      match({ winner: ME })
    ])
    expect(b.currentStreak).toBe(-3)
  })

  it('finds the best win streak regardless of position', () => {
    const a = analyzeRanked(ME, [
      match({ winner: OPP }),
      match({ winner: ME }),
      match({ winner: ME }),
      match({ winner: ME }),
      match({ winner: OPP }),
      match({ winner: ME })
    ])
    expect(a.bestWinStreak).toBe(3)
  })

  it('aggregates winning times: best, average, median, newest-first list', () => {
    const matches = [
      match({ winner: ME, time: 600_000 }),
      match({ winner: OPP, time: 500_000 }), // not our win -> excluded
      match({ winner: ME, time: 400_000 }),
      match({ winner: ME, time: 800_000 })
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.completionTimes).toEqual([600_000, 400_000, 800_000]) // newest-first
    expect(a.best).toBe(400_000)
    expect(a.averageWin).toBe(600_000) // (600+400+800)/3
    expect(a.medianWin).toBe(600_000)
  })

  it('splits win rate vs higher- and lower-rated opponents', () => {
    const matches = [
      // vs higher (opp 1500 > me 1000): win then loss -> 50%
      match({ winner: ME, myRate: 1000, oppRate: 1500 }),
      match({ winner: OPP, myRate: 1000, oppRate: 1500 }),
      // vs lower (opp 800 < me 1000): two wins -> 100%
      match({ winner: ME, myRate: 1000, oppRate: 800 }),
      match({ winner: ME, myRate: 1000, oppRate: 800 }),
      // missing elo -> skipped from both splits
      match({ winner: ME, myRate: null, oppRate: 900 })
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.vsHigher).toEqual({ decided: 2, winRate: 50 })
    expect(a.vsLower).toEqual({ decided: 2, winRate: 100 })
  })

  it('attributes forfeits by who lost', () => {
    const matches = [
      match({ winner: OPP, forfeited: true }), // we lost a forfeited game -> ours
      match({ winner: ME, forfeited: true }), // we won a forfeited game -> theirs
      match({ winner: ME, forfeited: false })
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.forfeits).toEqual({ yours: 1, theirs: 1 })
  })

  it('computes recent win rate over the last up-to-20 decided games', () => {
    // 25 matches: first 20 (newest) are W,L,W,L... starting with a win.
    const matches: MatchInfo[] = []
    for (let i = 0; i < 25; i++) {
      matches.push(match({ winner: i % 2 === 0 ? ME : OPP }))
    }
    const a = analyzeRanked(ME, matches)
    expect(a.recentSample).toBe(20)
    expect(a.recentWinRate).toBe(50)
  })

  it('produces between 1 and 6 insights with valid kinds', () => {
    const matches = [
      match({ winner: ME, myRate: 1000, oppRate: 1500, time: 410_000 }),
      match({ winner: ME, myRate: 1000, oppRate: 1500, time: 400_000 }),
      match({ winner: ME, myRate: 1000, oppRate: 1400, time: 420_000 }),
      match({ winner: OPP, myRate: 1000, oppRate: 800, forfeited: true })
    ]
    const a = analyzeRanked(ME, matches)
    expect(a.insights.length).toBeGreaterThanOrEqual(1)
    expect(a.insights.length).toBeLessThanOrEqual(6)
    for (const ins of a.insights) {
      expect(['strength', 'weakness', 'note']).toContain(ins.kind)
      expect(ins.label.length).toBeGreaterThan(0)
      expect(ins.detail.length).toBeGreaterThan(0)
    }
    // Winning all three games vs higher-rated opponents is a strength.
    expect(a.insights.some((i) => i.kind === 'strength')).toBe(true)
  })

  it('tolerates missing changes and result fields', () => {
    const sparse: MatchInfo = {
      id: 999,
      type: 2,
      players: [{ uuid: ME, nickname: 'Me' }]
      // no result, no changes
    }
    const a = analyzeRanked(ME, [sparse])
    expect(a.played).toBe(1)
    expect(a.draws).toBe(1) // result.uuid is undefined -> treated as no decisive winner
    expect(a.decided).toBe(0)
    expect(a.netElo).toBe(0)
  })

  it('matches uuids case-insensitively (a profile uuid may be upper-case)', () => {
    const a = analyzeRanked(ME.toUpperCase(), [
      match({ winner: ME, time: 400_000 }),
      match({ winner: OPP })
    ])
    expect(a.wins).toBe(1)
    expect(a.losses).toBe(1)
    expect(a.best).toBe(400_000)
  })
})

describe('analyzeSplits', () => {
  const tl = (events: Array<[string, string, number]>): MatchInfo['timelines'] =>
    events.map(([uuid, type, time]) => ({ uuid, time, type }))

  const detail = (opts: {
    winner?: string | null
    time?: number | null
    timelines?: MatchInfo['timelines']
    type?: number
  }): MatchInfo => ({
    id: nextId++,
    type: opts.type ?? 2,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: opts.winner ?? null, time: opts.time ?? null },
    timelines: opts.timelines
  })

  const get = (splits: ReturnType<typeof analyzeSplits>, key: string) =>
    splits.find((s) => s.key === key)!

  it('computes best/average/count per cumulative split from the player timeline', () => {
    const splits = analyzeSplits(ME, [
      detail({
        winner: ME,
        time: 600_000,
        timelines: tl([
          [ME, 'story.enter_the_nether', 100_000],
          [ME, 'nether.find_bastion', 150_000],
          [ME, 'nether.find_fortress', 250_000],
          [OPP, 'story.enter_the_nether', 120_000] // opponent events ignored
        ])
      }),
      detail({
        winner: OPP,
        time: 500_000,
        timelines: tl([
          [ME, 'story.enter_the_nether', 140_000],
          [ME, 'nether.find_bastion', 200_000] // no fortress this match
        ])
      })
    ])
    expect(get(splits, 'overworld')).toMatchObject({ best: 100_000, average: 120_000, count: 2 })
    expect(get(splits, 'bastion').count).toBe(2)
    expect(get(splits, 'fortress')).toMatchObject({ best: 250_000, count: 1 })
  })

  it('counts Finish and Fort → Finish only on the player wins', () => {
    const splits = analyzeSplits(ME, [
      detail({ winner: ME, time: 600_000, timelines: tl([[ME, 'nether.find_fortress', 250_000]]) }),
      detail({ winner: OPP, time: 500_000, timelines: tl([[ME, 'nether.find_fortress', 240_000]]) })
    ])
    expect(get(splits, 'finish')).toMatchObject({ best: 600_000, count: 1 })
    expect(get(splits, 'fortToFinish')).toMatchObject({ best: 350_000, count: 1 }) // 600k - 250k
  })

  it('returns null stats with no timelines, and ignores non-ranked matches', () => {
    expect(get(analyzeSplits(ME, [detail({ winner: ME, time: 600_000 })]), 'overworld')).toMatchObject(
      { best: null, average: null, count: 0 }
    )
    const nonRanked = analyzeSplits(ME, [
      detail({ type: 1, timelines: tl([[ME, 'story.enter_the_nether', 90_000]]) })
    ])
    expect(get(nonRanked, 'overworld').count).toBe(0)
  })
})

describe('analyzeTypeBreakdowns', () => {
  const tl = (events: Array<[string, string, number]>): MatchInfo['timelines'] =>
    events.map(([uuid, type, time]) => ({ uuid, time, type }))

  const m = (opts: {
    seedType?: string | null
    bastionType?: string | null
    winner?: string | null
    type?: number
    timelines?: MatchInfo['timelines']
    time?: number | null
  }): MatchInfo => ({
    id: nextId++,
    type: opts.type ?? 2,
    seedType: opts.seedType,
    bastionType: opts.bastionType,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: opts.winner ?? null, time: opts.time ?? null },
    timelines: opts.timelines
  })

  const row = (bd: ReturnType<typeof analyzeTypeBreakdowns>['overworld'], key: string) =>
    bd.rows.find((r) => r.key === key)

  it('aggregates overworld count + win rate from the match list, most-played first', () => {
    const { overworld } = analyzeTypeBreakdowns(
      ME,
      [
        m({ seedType: 'VILLAGE', winner: ME }),
        m({ seedType: 'VILLAGE', winner: OPP }),
        m({ seedType: 'VILLAGE', winner: null }), // draw: counted, not decided
        m({ seedType: 'SHIPWRECK', winner: ME })
      ],
      []
    )
    expect(row(overworld, 'VILLAGE')).toMatchObject({
      label: 'Village',
      count: 3,
      decided: 2,
      wins: 1,
      winRate: 50
    })
    expect(row(overworld, 'SHIPWRECK')).toMatchObject({ count: 1, decided: 1, wins: 1, winRate: 100 })
    expect(overworld.rows[0].key).toBe('VILLAGE') // count desc
  })

  it('computes per-type split best/average from detail timelines (opponent events ignored)', () => {
    const details = [
      m({
        seedType: 'VILLAGE',
        timelines: tl([
          [ME, 'story.enter_the_nether', 100_000],
          [OPP, 'story.enter_the_nether', 90_000]
        ])
      }),
      m({ seedType: 'VILLAGE', timelines: tl([[ME, 'story.enter_the_nether', 140_000]]) }),
      m({ seedType: 'SHIPWRECK', timelines: tl([[ME, 'story.enter_the_nether', 80_000]]) })
    ]
    const { overworld } = analyzeTypeBreakdowns(ME, details, details)
    expect(row(overworld, 'VILLAGE')).toMatchObject({ best: 100_000, average: 120_000, timeSample: 2 })
    expect(row(overworld, 'SHIPWRECK')).toMatchObject({ best: 80_000, timeSample: 1 })
  })

  it('breaks bastion down by bastionType using find_bastion times', () => {
    const details = [
      m({ bastionType: 'TREASURE', winner: ME, timelines: tl([[ME, 'nether.find_bastion', 200_000]]) }),
      m({ bastionType: 'HOUSING', winner: OPP, timelines: tl([[ME, 'nether.find_bastion', 250_000]]) })
    ]
    const { bastion } = analyzeTypeBreakdowns(ME, details, details)
    expect(bastion.splitLabel).toBe('Bastion')
    expect(row(bastion, 'TREASURE')).toMatchObject({ wins: 1, winRate: 100, best: 200_000 })
    expect(row(bastion, 'HOUSING')).toMatchObject({ wins: 0, winRate: 0, best: 250_000 })
  })

  it('skips missing/None types and non-ranked matches; win rate null when undecided', () => {
    const { overworld } = analyzeTypeBreakdowns(
      ME,
      [
        m({ seedType: null, winner: ME }),
        m({ seedType: 'None', winner: ME }),
        m({ seedType: 'VILLAGE', winner: null }), // draws only -> winRate null
        m({ seedType: 'SHIPWRECK', winner: ME, type: 1 }) // casual ignored
      ],
      []
    )
    // Only VILLAGE was actually played; the other canonical types still appear with count 0.
    expect(overworld.rows.filter((r) => r.count > 0).map((r) => r.key)).toEqual(['VILLAGE'])
    expect(row(overworld, 'SHIPWRECK')).toMatchObject({ count: 0 })
    expect(row(overworld, 'VILLAGE')).toMatchObject({ count: 1, decided: 0, winRate: null })
  })

  it('always lists every type, even ones not played (e.g. Housing)', () => {
    const { bastion } = analyzeTypeBreakdowns(ME, [m({ bastionType: 'TREASURE', winner: ME })], [])
    expect(bastion.rows.map((r) => r.key).sort()).toEqual([
      'BRIDGE',
      'HOUSING',
      'STABLES',
      'TREASURE'
    ])
    expect(row(bastion, 'HOUSING')).toMatchObject({ count: 0, best: null })
  })

  it('falls back to seed.overworld / seed.nether and title-cases unknown keys', () => {
    const match: MatchInfo = {
      id: nextId++,
      type: 2,
      seed: { overworld: 'MINESHAFT', nether: null },
      players: [{ uuid: ME, nickname: 'Me' }],
      result: { uuid: ME, time: 500_000 }
    }
    const { overworld } = analyzeTypeBreakdowns(ME, [match], [])
    expect(row(overworld, 'MINESHAFT')).toMatchObject({ label: 'Mineshaft', count: 1 })
  })

  it('surfaces a split time even when the type is unclassified in the list (union of samples)', () => {
    // List entry is untyped (older match), but the detail for that match carries a populated type.
    const { overworld } = analyzeTypeBreakdowns(
      ME,
      [m({ seedType: null, winner: ME })], // list: untyped -> no count row on its own
      [m({ seedType: 'DESERT_TEMPLE', timelines: tl([[ME, 'story.enter_the_nether', 95_000]]) })]
    )
    expect(row(overworld, 'DESERT_TEMPLE')).toMatchObject({
      count: 0,
      decided: 0,
      winRate: null,
      best: 95_000,
      timeSample: 1
    })
  })

  it('treats empty-string types as unclassified and falls back to seed.overworld', () => {
    const { overworld } = analyzeTypeBreakdowns(
      ME,
      [
        m({ seedType: '', winner: ME }), // empty + no seed fallback -> skipped
        { ...m({ winner: ME }), seedType: '', seed: { overworld: 'VILLAGE' } }
      ],
      []
    )
    expect(overworld.rows.filter((r) => r.count > 0).map((r) => r.key)).toEqual(['VILLAGE'])
    expect(row(overworld, 'VILLAGE')).toMatchObject({ count: 1 })
  })
})

describe('buildScorecard / scorecardInsights', () => {
  it('uses the authoritative season win rate for the Win Rate dimension', () => {
    // Recent window is all losses, but the season record is 6-5.
    const recent = analyzeRanked(ME, [match({ winner: OPP }), match({ winner: OPP })])
    const dims = buildScorecard(recent, 54.5, 12)
    const wr = dims.find((d) => d.key === 'winrate')!
    expect(wr.score).toBe(55) // 54.5 rounded/clamped
    expect(wr.sample).toBe(12)
  })

  it('only includes dimensions that have data', () => {
    expect(buildScorecard(analyzeRanked(ME, []), null, 0)).toEqual([])
  })

  it('anchors insights to the season record, not the recent losing window', () => {
    const recent = analyzeRanked(ME, [match({ winner: OPP }), match({ winner: OPP })])
    const dims = buildScorecard(recent, 54.5, 12)
    const ins = scorecardInsights(dims, {
      winRate: 54.5,
      played: 12,
      bestTime: 713_531,
      bestStreak: 2
    })
    expect(ins.some((i) => i.label === 'Record' && i.detail.includes('54.5%'))).toBe(true)
    expect(ins.some((i) => i.label === 'Personal best')).toBe(true)
  })
})

describe('countDeaths + death insights', () => {
  const tl = (events: Array<[string, string, number]>): MatchInfo['timelines'] =>
    events.map(([uuid, type, time]) => ({ uuid, time, type }))

  const withTimeline = (timelines: MatchInfo['timelines'], type = 2): MatchInfo => ({
    id: nextId++,
    type,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: null, time: null },
    timelines
  })

  it('counts only real deaths — strategic spawnpoint resets and opponents excluded', () => {
    const stats = countDeaths(ME, [
      withTimeline(
        tl([
          [ME, 'projectelo.timeline.death', 100],
          [ME, 'projectelo.timeline.death_spawnpoint', 200], // strategic reset -> ignored
          [OPP, 'projectelo.timeline.death', 300] // opponent -> ignored
        ])
      ),
      withTimeline(tl([[ME, 'projectelo.timeline.death', 50]]))
    ])
    expect(stats).toMatchObject({ total: 2, matches: 2, perMatch: 1 })
  })

  it('ignores non-ranked matches when counting deaths', () => {
    const stats = countDeaths(ME, [
      withTimeline(tl([[ME, 'projectelo.timeline.death', 100]]), 1) // casual
    ])
    expect(stats).toMatchObject({ total: 0, matches: 0 })
  })

  it('adds a Survival dimension and a death weakness when deaths are frequent', () => {
    const a = analyzeRanked(ME, [match({ winner: OPP })])
    const deaths = { total: 3, matches: 4, perMatch: 0.75 }
    const dims = buildScorecard(a, 50, 10, deaths)
    expect(dims.find((x) => x.key === 'survival')).toBeTruthy()
    const ins = scorecardInsights(
      dims,
      { winRate: 50, played: 10, bestTime: null, bestStreak: 0 },
      deaths
    )
    expect(ins.some((i) => i.label === 'Dies too much' && i.kind === 'weakness')).toBe(true)
  })

  it('does not flag deaths when they are rare', () => {
    const a = analyzeRanked(ME, [match({ winner: OPP })])
    const deaths = { total: 0, matches: 6, perMatch: 0 }
    const ins = scorecardInsights(
      buildScorecard(a, 50, 10, deaths),
      { winRate: 50, played: 10, bestTime: null, bestStreak: 0 },
      deaths
    )
    expect(ins.some((i) => i.label === 'Dies too much')).toBe(false)
  })
})

describe('playerSegments / splitPerformance', () => {
  const tl = (events: Array<[string, string, number]>): MatchInfo['timelines'] =>
    events.map(([uuid, type, time]) => ({ uuid, time, type }))
  const d = (opts: {
    timelines: MatchInfo['timelines']
    winner?: string | null
    time?: number | null
  }): MatchInfo => ({
    id: nextId++,
    type: 2,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: opts.winner ?? null, time: opts.time ?? null },
    timelines: opts.timelines
  })

  it('derives per-segment durations from consecutive milestones', () => {
    const segs = playerSegments(ME, [
      d({
        winner: ME,
        time: 700_000,
        timelines: tl([
          [ME, 'story.enter_the_nether', 100_000],
          [ME, 'nether.find_bastion', 150_000],
          [ME, 'nether.find_fortress', 300_000],
          [ME, 'projectelo.timeline.blind_travel', 400_000],
          [ME, 'story.follow_ender_eye', 500_000],
          [ME, 'story.enter_the_end', 600_000]
        ])
      })
    ])
    expect(segs.overworld.avg).toBe(100_000) // start -> nether
    expect(segs.nether.avg).toBe(50_000) // nether -> bastion
    expect(segs.bastion.avg).toBe(150_000) // bastion -> fortress
    expect(segs.end.avg).toBe(100_000) // enter end -> finish (700k - 600k)
  })

  it('ranks a fast segment as Top% and a missing baseline as —', () => {
    const arr = Array.from({ length: 101 }, (_, i) => 100_000 + i * 1000) // 100k..200k ascending
    const details = [d({ timelines: tl([[ME, 'story.enter_the_nether', 110_000]]) })]
    const perf = splitPerformance(ME, details, { overworld: arr })
    const ow = perf.find((p) => p.key === 'overworld')!
    expect(ow.ms).toBe(110_000)
    expect(ow.pctLabel).toMatch(/^Top /)
    expect(ow.score).toBeGreaterThan(80)
    expect(perf.find((p) => p.key === 'bastion')?.pctLabel).toBe('—')
  })
})

describe('speedFromPerf', () => {
  const perf = (scores: Array<number | null>) =>
    scores.map((score, i) => ({
      key: `split${i}`,
      label: `Split ${i}`,
      ms: score == null ? null : 100_000,
      score,
      pctLabel: score == null ? '—' : `Top ${100 - score}%`,
      sample: 5
    }))

  it('averages the scored split percentiles', () => {
    const s = speedFromPerf(perf([80, 60, 40]))
    expect(s).not.toBeNull()
    expect(s!.score).toBe(60)
    expect(s!.sample).toBe(3)
  })

  it('ignores splits with no baseline (null score)', () => {
    const s = speedFromPerf(perf([90, null, 70, null]))
    expect(s!.score).toBe(80)
    expect(s!.sample).toBe(2)
  })

  it('returns null with fewer than two scored splits', () => {
    expect(speedFromPerf(perf([]))).toBeNull()
    expect(speedFromPerf(perf([75]))).toBeNull()
    expect(speedFromPerf(perf([75, null, null]))).toBeNull()
  })

  it('feeds buildScorecard a Speed dim even when win times are missing', () => {
    const analytics = analyzeRanked(ME, []) // nothing — best/averageWin are null
    const dims = buildScorecard(analytics, null, 0, undefined, { score: 72, sample: 12 })
    const dim = dims.find((x) => x.key === 'speed')
    expect(dim).toBeDefined()
    expect(dim!.label).toBe('Speed')
    expect(dim!.score).toBe(72)
    expect(dim!.detail).toContain('72')
  })
})

describe('matchupWinChance', () => {
  const side = (o: Partial<MatchupInput> = {}): MatchupInput => ({
    elo: 1500,
    winRate: 50,
    avgWin: 600_000,
    splitScore: 50,
    completion: 0.9,
    streak: 0,
    games: 100,
    ...o
  })

  it('is a coin flip when both sides are identical', () => {
    const m = matchupWinChance(side(), side())
    expect(m.pA).toBeCloseTo(0.5, 5)
    expect(m.adjustElo).toBeCloseTo(0, 5)
  })

  it('collapses to the pure Elo expectation when every side stat ties', () => {
    const m = matchupWinChance(side({ elo: 1700 }), side({ elo: 1500 }))
    expect(m.adjustElo).toBeCloseTo(0, 5)
    expect(m.pA).toBeCloseTo(eloWinChance(1700, 1500), 6)
  })

  it('tilts an even-Elo matchup toward the player with better splits + win rate', () => {
    const m = matchupWinChance(
      side({ splitScore: 85, winRate: 62 }),
      side({ splitScore: 40, winRate: 45 })
    )
    expect(m.adjustElo).toBeGreaterThan(0)
    expect(m.pA!).toBeGreaterThan(0.5)
    // Splits carry the most weight, so it should top the factor list favoring A.
    expect(m.factors[0].key).toBe('splits')
    expect(m.factors[0].favors).toBe('a')
  })

  it('can favor the lower-Elo player when the side signals strongly disagree', () => {
    const under = side({ elo: 1450, splitScore: 92, winRate: 65, streak: 6, avgWin: 540_000 })
    const over = side({ elo: 1550, splitScore: 35, winRate: 42, streak: -4, avgWin: 640_000 })
    const m = matchupWinChance(under, over)
    expect(m.pA!).toBeGreaterThan(eloWinChance(1450, 1550)) // stats pulled it up past raw Elo
  })

  it('shrinks the tilt toward zero on thin records', () => {
    const strong = side({ splitScore: 95, winRate: 70, games: 2 })
    const weak = side({ splitScore: 20, winRate: 40, games: 2 })
    const m = matchupWinChance(strong, weak)
    // Only 2 shared games → 0.2× trust, so the tilt is a fraction of its full-sample size.
    const full = matchupWinChance(side({ ...strong, games: 100 }), side({ ...weak, games: 100 }))
    expect(Math.abs(m.adjustElo)).toBeLessThan(Math.abs(full.adjustElo))
    expect(m.adjustElo).toBeCloseTo(full.adjustElo * 0.2, 5)
  })

  it('renormalizes weights when a side is missing a signal', () => {
    // Only splits available on both → the whole blend rides on splits alone.
    const bare = (splitScore: number): MatchupInput => ({
      elo: 1500,
      winRate: null,
      avgWin: null,
      splitScore,
      completion: null,
      streak: null,
      games: 100
    })
    const m = matchupWinChance(bare(80), bare(30))
    expect(m.factors).toHaveLength(1)
    expect(m.factors[0].key).toBe('splits')
    // edge renormalized to the raw split edge (0.5), not diluted by absent signals.
    expect(m.edge).toBeCloseTo(0.5, 5)
    expect(m.eloOnly).toBe(false)
  })

  it('returns a null probability but keeps the edge when an Elo is missing', () => {
    const m = matchupWinChance(side({ elo: null, splitScore: 80 }), side({ splitScore: 40 }))
    expect(m.pA).toBeNull()
    expect(m.edge).toBeGreaterThan(0)
  })

  it('flags eloOnly when no side signals are present', () => {
    const onlyElo = (elo: number): MatchupInput => ({
      elo,
      winRate: null,
      avgWin: null,
      splitScore: null,
      completion: null,
      streak: null,
      games: 100
    })
    const m = matchupWinChance(onlyElo(1600), onlyElo(1500))
    expect(m.eloOnly).toBe(true)
    expect(m.adjustElo).toBeCloseTo(0, 5)
    expect(m.pA).toBeCloseTo(eloWinChance(1600, 1500), 6)
  })
})

describe('matchBreakdown', () => {
  const ev = (uuid: string, type: string, time: number) => ({ uuid, type, time })
  const base = (over: Partial<MatchInfo> = {}): MatchInfo => ({
    id: nextId++,
    type: 2,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: ME, time: 420_000 },
    timelines: [
      ev(ME, 'story.enter_the_nether', 60_000),
      ev(ME, 'nether.find_bastion', 120_000),
      ev(ME, 'nether.find_fortress', 180_000),
      ev(ME, 'projectelo.timeline.death', 200_000),
      ev(ME, 'nether.obtain_blaze_rod', 210_000),
      ev(ME, 'projectelo.timeline.blind_travel', 260_000),
      ev(ME, 'story.follow_ender_eye', 300_000),
      ev(ME, 'story.enter_the_end', 360_000),
      ev(OPP, 'projectelo.timeline.reset', 30_000),
      ev(OPP, 'story.enter_the_nether', 90_000),
      ev(OPP, 'nether.find_bastion', 150_000),
      ev(OPP, 'nether.find_fortress', 200_000),
      ev(OPP, 'nether.obtain_blaze_rod', 230_000),
      ev(OPP, 'projectelo.timeline.blind_travel', 280_000),
      ev(OPP, 'story.follow_ender_eye', 330_000)
    ],
    completions: [{ uuid: ME, time: 420_000 }],
    ...over
  })

  it('pairs milestone timestamps with an A-minus-B delta', () => {
    const b = matchBreakdown(base(), ME, OPP)
    const nether = b.timestamps.find((r) => r.key === 'nether')!
    expect(nether.aMs).toBe(60_000)
    expect(nether.bMs).toBe(90_000)
    expect(nether.delta).toBe(-30_000) // A 30s ahead
    // A reached the End, B never did → B side null, no delta.
    const end = b.timestamps.find((r) => r.key === 'end')!
    expect(end.aMs).toBe(360_000)
    expect(end.bMs).toBeNull()
    expect(end.delta).toBeNull()
  })

  it('adds a Finish row from completions', () => {
    const b = matchBreakdown(base(), ME, OPP)
    const fin = b.timestamps.find((r) => r.key === 'finish')!
    expect(fin.aMs).toBe(420_000)
    expect(fin.bMs).toBeNull()
  })

  it('derives per-segment durations between consecutive milestones', () => {
    const b = matchBreakdown(base(), ME, OPP)
    const seg = (k: string) => b.segments.find((r) => r.key === k)!
    expect(seg('nether').aMs).toBe(60_000) // 0 -> 60k
    expect(seg('bastion').aMs).toBe(60_000) // 60k -> 120k
    expect(seg('rod').aMs).toBe(30_000) // 180k -> 210k
    expect(seg('finish').aMs).toBe(60_000) // 360k -> 420k
    // Fortress segment: A 60k (120→180), B 50k (150→200) → A slower by 10k.
    expect(seg('fortress').delta).toBe(10_000)
  })

  it('surfaces death/reset markers in the event column but never as milestones or deltas', () => {
    const b = matchBreakdown(base(), ME, OPP)
    expect(b.aEvents.some((e) => e.label === 'Death' && !e.milestone)).toBe(true)
    expect(b.bEvents.some((e) => e.label === 'Reset' && !e.milestone)).toBe(true)
    expect(b.timestamps.some((r) => r.key === 'death' || r.key === 'reset')).toBe(false)
    expect(b.segments.some((r) => r.key === 'death' || r.key === 'reset')).toBe(false)
    const times = b.aEvents.map((e) => e.ms)
    expect(times).toEqual([...times].sort((x, y) => x - y)) // time-ordered
  })

  it('numbers repeated events (Nether 2, Reset 2)', () => {
    const b = matchBreakdown(
      base({
        timelines: [
          ev(OPP, 'projectelo.timeline.reset', 20_000),
          ev(OPP, 'story.enter_the_nether', 40_000),
          ev(OPP, 'projectelo.timeline.reset', 60_000),
          ev(OPP, 'story.enter_the_nether', 90_000)
        ],
        completions: []
      }),
      ME,
      OPP
    )
    expect(b.bEvents.map((e) => e.label)).toEqual(['Reset', 'Nether', 'Reset 2', 'Nether 2'])
    // Timestamps/deltas use the FIRST occurrence.
    expect(b.timestamps.find((r) => r.key === 'nether')!.bMs).toBe(40_000)
  })

  it('uses the winner run time for finish when completions are absent, but not on a forfeit', () => {
    const won = matchBreakdown(base({ completions: undefined }), ME, OPP)
    expect(won.timestamps.find((r) => r.key === 'finish')!.aMs).toBe(420_000)
    const ff = matchBreakdown(base({ completions: undefined, forfeited: true }), ME, OPP)
    expect(ff.timestamps.find((r) => r.key === 'finish')).toBeUndefined()
  })
})

describe('splitCallouts', () => {
  const perf = (rows: Array<[string, string, number | null, number | null, string]>) =>
    rows.map(([key, label, ms, score, pctLabel]) => ({
      key,
      label,
      ms,
      score,
      pctLabel,
      sample: 5
    }))

  it('names the best and weakest split by percentile score', () => {
    const rows = perf([
      ['overworld', 'Overworld', 100_000, 90, 'Top 10%'],
      ['nether', 'Nether', 50_000, 50, 'Top 50%'],
      ['bastion', 'Bastion', 150_000, 20, 'Bottom 20%']
    ])
    const out = splitCallouts(rows, {})
    const best = out.find((i) => i.label === 'Best split')
    const weak = out.find((i) => i.label === 'Weakest split')
    expect(best?.detail).toContain('Overworld')
    expect(weak?.detail).toContain('Bastion')
    expect(out.find((i) => i.label === 'To rank up')).toBeUndefined()
  })

  it('does not label the same split both best and weakest when every score ties', () => {
    // A player faster than the whole field on every split scores 100 across the board.
    const rows = perf([
      ['overworld', 'Overworld', 100_000, 100, 'Top 1%'],
      ['nether', 'Nether', 50_000, 100, 'Top 1%'],
      ['bastion', 'Bastion', 150_000, 100, 'Top 1%']
    ])
    const out = splitCallouts(rows, {})
    expect(out.find((i) => i.label === 'Best split')).toBeUndefined()
    expect(out.find((i) => i.label === 'Weakest split')).toBeUndefined()
  })

  it('flags the split with the biggest gap to the next tier', () => {
    const rows = perf([
      ['overworld', 'Overworld', 120_000, 60, 'Top 40%'],
      ['bastion', 'Bastion', 200_000, 30, 'Bottom 30%']
    ])
    const segs = {
      overworld: { avg: 120_000, count: 4 },
      bastion: { avg: 200_000, count: 4 }
    }
    // next-tier medians: overworld barely ahead, bastion far ahead of the player
    const med = (m: number) => Array.from({ length: 101 }, () => m)
    const nextTier = {
      label: 'Diamond',
      bucket: { overworld: med(118_000), bastion: med(150_000) }
    }
    const out = splitCallouts(rows, segs, nextTier)
    const focus = out.find((i) => i.label === 'To rank up')
    expect(focus?.detail).toContain('Bastion')
    expect(focus?.detail).toContain('Diamond')
  })
})
