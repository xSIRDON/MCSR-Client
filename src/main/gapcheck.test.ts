import { describe, it, expect } from 'vitest'
import { buildQuery, matchUrl, normalizeMatch, vodSeconds } from './gapcheck'

describe('buildQuery', () => {
  it('passes through known filters', () => {
    const q = new URLSearchParams(
      buildQuery({
        seedType: 'RUINED_PORTAL',
        bastionType: 'TREASURE',
        maxTimeSeconds: 900,
        minTimeSeconds: 480,
        minRank: 300
      })
    )
    expect(q.get('seedType')).toBe('RUINED_PORTAL')
    expect(q.get('bastionType')).toBe('TREASURE')
    expect(q.get('maxTime')).toBe('900')
    expect(q.get('minTime')).toBe('480')
    expect(q.get('minRank')).toBe('300')
  })

  it('drops unknown seed and bastion types instead of forwarding them', () => {
    const q = new URLSearchParams(buildQuery({ seedType: 'NETHER_FORTRESS', bastionType: 'CASTLE' }))
    expect(q.get('seedType')).toBeNull()
    expect(q.get('bastionType')).toBeNull()
  })

  it('accepts lowercase types and normalizes them', () => {
    expect(new URLSearchParams(buildQuery({ seedType: 'village' })).get('seedType')).toBe('VILLAGE')
  })

  it('ignores non-positive and non-finite numbers', () => {
    expect(buildQuery({ maxTimeSeconds: 0, minRank: Number.NaN, minTimeSeconds: -5 })).toBe('')
  })

  it('takes only dashless-uuid players, dashed ones normalized', () => {
    const q = new URLSearchParams(
      buildQuery({
        players: [
          '9a8e24df4c8549d696a6951da84fa5c4',
          '3c875779-0ab0-400b-8b9e-3936e0dd535b',
          'Feinberg',
          '../etc'
        ]
      })
    )
    expect(q.getAll('players')).toEqual([
      '9a8e24df4c8549d696a6951da84fa5c4',
      '3c8757790ab0400b8b9e3936e0dd535b'
    ])
  })

  it('is empty with no filters', () => {
    expect(buildQuery()).toBe('')
  })
})

describe('vodSeconds', () => {
  it('offsets the run start by the split time', () => {
    expect(vodSeconds(19088, 0)).toBe(19088)
    expect(vodSeconds(19088, 686830)).toBe(19774)
  })
  it('never goes negative', () => {
    expect(vodSeconds(0, -5000)).toBe(0)
  })
})

describe('matchUrl', () => {
  it('points at their match page', () => {
    expect(matchUrl(12731602)).toBe('https://gapcheck.gg/m/12731602/ranked')
  })
})

// Shaped like a real GET /api/matches/<id> response.
const RAW = {
  match: {
    matchId: 12731602,
    overworldSeed: '612703882724199059',
    netherSeed: '170105512769032',
    endSeed: '612703882724199059',
    rngSeed: { seed: '4377546878737562057', matches: 20, total: 20 },
    vods: [
      {
        uuid: '9A8E24DF4C8549D696A6951DA84FA5C4',
        url: 'https://www.twitch.tv/videos/2855244066',
        startsAt: 1787587809,
        runStartSeconds: 19088,
        expiresAt: '2099-10-23T22:11:04.069Z'
      },
      {
        uuid: '3c8757790ab0400b8b9e3936e0dd535b',
        url: 'https://www.twitch.tv/videos/2855439663',
        runStartSeconds: 4410,
        expiresAt: '2020-01-01T00:00:00.000Z'
      }
    ],
    splits: [
      { uuid: '9a8e24df4c8549d696a6951da84fa5c4', time: 686830, type: 'projectelo.timeline.dragon_death' },
      { uuid: '9a8e24df4c8549d696a6951da84fa5c4', time: 120000, type: 'story.enter_the_nether' },
      { uuid: '3c8757790ab0400b8b9e3936e0dd535b', time: 130000, type: 'story.enter_the_nether' }
    ],
    seedType: 'RUINED_PORTAL',
    bastionType: 'TREASURE',
    endTowers: [91, 58, 42, 76],
    players: [
      { uuid: '3c8757790ab0400b8b9e3936e0dd535b', nickname: 'doogile', eloRank: 12, elo: 2301 },
      { uuid: '9a8e24df4c8549d696a6951da84fa5c4', nickname: 'Feinberg', eloRank: 6, elo: 2483 }
    ],
    finalTime: 696776,
    date: '2026-08-24T21:39:53Z',
    result: { time: 696776, uuid: '9a8e24df4c8549d696a6951da84fa5c4' }
  }
}

describe('normalizeMatch', () => {
  const seed = normalizeMatch(RAW, Date.parse('2026-09-17T00:00:00Z'))!

  it('keeps all four seeds as exact strings', () => {
    expect(seed.seeds).toEqual({
      overworld: '612703882724199059',
      nether: '170105512769032',
      end: '612703882724199059',
      rng: '4377546878737562057'
    })
    expect(seed.rngConfidence).toEqual({ matches: 20, total: 20 })
  })

  it('carries the match identity and structure', () => {
    expect(seed.matchId).toBe(12731602)
    expect(seed.url).toBe('https://gapcheck.gg/m/12731602/ranked')
    expect(seed.seedType).toBe('RUINED_PORTAL')
    expect(seed.bastionType).toBe('TREASURE')
    expect(seed.endTowers).toEqual([91, 58, 42, 76])
    expect(seed.finalTimeMs).toBe(696776)
    expect(seed.date).toBe(Math.floor(Date.parse('2026-08-24T21:39:53Z') / 1000))
  })

  it('puts the winner first, with their time', () => {
    expect(seed.players.map((p) => p.nickname)).toEqual(['Feinberg', 'doogile'])
    expect(seed.players[0].timeMs).toBe(696776)
    expect(seed.players[0].elo).toBe(2483)
    expect(seed.players[1].timeMs).toBeNull()
  })

  it('splits per player, ascending', () => {
    expect(seed.players[0].splits).toEqual([
      { type: 'story.enter_the_nether', timeMs: 120000 },
      { type: 'projectelo.timeline.dragon_death', timeMs: 686830 }
    ])
    expect(seed.players[1].splits).toHaveLength(1)
  })

  it('keeps a live VOD (matching uuid case-insensitively) and drops an expired one', () => {
    expect(seed.players[0].vod).toEqual({
      url: 'https://www.twitch.tv/videos/2855244066',
      runStartSeconds: 19088
    })
    expect(seed.players[1].vod).toBeNull()
  })

  it('accepts a bare match object as well as the wrapped response', () => {
    expect(normalizeMatch(RAW.match)?.matchId).toBe(12731602)
  })

  it('returns null for junk', () => {
    expect(normalizeMatch(null)).toBeNull()
    expect(normalizeMatch({})).toBeNull()
    expect(normalizeMatch({ match: { matchId: 'nope' } })).toBeNull()
  })

  it('survives a match with nothing but an id', () => {
    const bare = normalizeMatch({ match: { matchId: 7 } })!
    expect(bare.seeds).toEqual({ overworld: null, nether: null, end: null, rng: null })
    expect(bare.players).toEqual([])
    expect(bare.endTowers).toEqual([])
    expect(bare.rngConfidence).toBeNull()
  })
})
