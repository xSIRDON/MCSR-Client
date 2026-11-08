import { describe, expect, it } from 'vitest'
import type { MatchInfo } from '@services/mcsr-ranked'
import {
  analyzeBastions,
  analyzeOverworlds,
  analyzeSplitRuns,
  calcMomentum,
  clutchStats,
  rankAgainst,
  topLabel
} from './run-analysis'

const ME = 'a'.repeat(32)
const OPP = 'b'.repeat(32)
let nextId = 1

function match(opts: {
  events: Array<[string, string, number]>
  winner?: string | null
  time?: number | null
  forfeited?: boolean
  seedType?: string
  bastionType?: string
}): MatchInfo {
  return {
    id: nextId++,
    type: 2,
    players: [
      { uuid: ME, nickname: 'Me' },
      { uuid: OPP, nickname: 'Opp' }
    ],
    result: { uuid: opts.winner ?? null, time: opts.time ?? null },
    forfeited: opts.forfeited ?? false,
    seedType: opts.seedType ?? 'VILLAGE',
    bastionType: opts.bastionType ?? 'TREASURE',
    timelines: opts.events.map(([uuid, type, time]) => ({ uuid, type, time })).reverse()
  } as MatchInfo
}

describe('analyzeSplitRuns', () => {
  it('counts every pass, restarts the overworld at a reset and ends at the finish', () => {
    const a = analyzeSplitRuns(ME, [
      match({
        winner: ME,
        time: 500_000,
        events: [
          [ME, 'story.enter_the_nether', 100_000],
          [ME, 'projectelo.timeline.death', 120_000],
          [ME, 'projectelo.timeline.reset', 150_000],
          [ME, 'story.enter_the_nether', 200_000],
          [ME, 'story.enter_the_end', 400_000],
          [OPP, 'story.enter_the_nether', 90_000]
        ]
      })
    ])
    expect(a.self.count.ow).toBe(2)
    expect(a.self.avg.ow).toBe(75_000)
    expect(a.self.avg.nether).toBe(200_000)
    expect(a.self.avg.end).toBe(100_000)
    expect(a.deaths.self.count.nether).toBe(1)
    expect(a.deaths.self.rate.nether).toBe(0.5)
    expect(a.timesaves.median.ow).toBe(10_000)
    expect(a.timesaves.losses.ow).toBe(1)
  })

  it('gives no end split to a forfeit win', () => {
    const a = analyzeSplitRuns(ME, [
      match({ winner: ME, time: 300_000, forfeited: true, events: [[ME, 'story.enter_the_end', 250_000]] })
    ])
    expect(a.self.count.end).toBe(0)
  })
})

describe('analyzeOverworlds / analyzeBastions', () => {
  it('buckets overworld time by structure type', () => {
    const o = analyzeOverworlds(ME, [
      match({ seedType: 'BURIED_TREASURE', events: [[ME, 'story.enter_the_nether', 120_000]] }),
      match({ seedType: 'SHIPWRECK', events: [[ME, 'story.enter_the_nether', 140_000]] })
    ])
    expect(o.self.avg.bt).toBe(120_000)
    expect(o.self.avg.ship).toBe(140_000)
    expect(o.self.avg.village).toBeNull()
  })

  it('times a bastion from entry to the next split', () => {
    const b = analyzeBastions(ME, [
      match({
        bastionType: 'STABLES',
        events: [
          [ME, 'nether.find_bastion', 100_000],
          [ME, 'projectelo.timeline.death', 150_000],
          [ME, 'nether.find_fortress', 300_000]
        ]
      })
    ])
    expect(b.self.avg.stables).toBe(200_000)
    expect(b.completed).toBe(1)
    expect(b.deaths.self.rate.stables).toBe(1)
  })
})

describe('clutchStats', () => {
  it('measures chokes, comebacks and momentum', () => {
    const c = clutchStats(ME, [
      match({ winner: ME, events: [[ME, 'projectelo.timeline.death', 10]] }),
      match({ winner: OPP, events: [[ME, 'projectelo.timeline.reset', 10]] }),
      match({ winner: ME, events: [] }),
      match({ winner: null, events: [] })
    ])
    expect(c.chokeRate).toBe(0.5)
    expect(c.resilience).toBe(0.5)
    expect(c.momentum).toBeLessThan(0)
  })

  it('momentum is 1 for pure streaks and 0 when the expected repeat rate is 1', () => {
    expect(calcMomentum(1, 1, 2, 0.5)).toBe(1)
    expect(calcMomentum(3, 0, 3, 1)).toBe(0)
  })
})

describe('rankAgainst / topLabel', () => {
  const pool = [10, 20, 30, 40]
  it('is the share of the pool doing worse', () => {
    expect(rankAgainst(15, pool, true)).toBe(0.75)
    expect(rankAgainst(35, pool, false)).toBe(0.75)
    expect(rankAgainst(1, [], true)).toBeNull()
  })
  it('labels to two significant figures', () => {
    expect(topLabel(0.994)).toBe('Top 0.6%')
    expect(topLabel(0.953)).toBe('Top 4.7%')
    expect(topLabel(0.85)).toBe('Top 15%')
    expect(topLabel(0.41)).toBe('Bottom 41%')
  })
})
