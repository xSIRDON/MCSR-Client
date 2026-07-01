import { describe, it, expect } from 'vitest'
import {
  analyzeRanked,
  analyzeSplits,
  analyzeTypeBreakdowns,
  buildScorecard,
  countDeaths,
  playerSegments,
  scorecardInsights,
  splitCallouts,
  splitPerformance
} from './ranked-analytics'
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
