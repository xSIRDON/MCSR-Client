import { describe, it, expect } from 'vitest'
import { eloToRank, eloWinChance, RANKS } from './rank'

describe('eloWinChance', () => {
  it('gives 50% for equal ratings', () => {
    expect(eloWinChance(1200, 1200)).toBeCloseTo(0.5)
  })

  it('gives ~91% at +400 and is symmetric', () => {
    expect(eloWinChance(1600, 1200)).toBeCloseTo(0.909, 2)
    expect(eloWinChance(1200, 1600) + eloWinChance(1600, 1200)).toBeCloseTo(1)
  })
})

describe('eloToRank', () => {
  it('maps 0 to Coal I', () => {
    expect(eloToRank(0)).toMatchObject({ tier: 'Coal', division: 1, color: '#aaaaaa' })
  })

  it('maps 599 to Coal III (top of Coal)', () => {
    expect(eloToRank(599)).toMatchObject({ tier: 'Coal', division: 3 })
  })

  it('maps 600 to Iron I', () => {
    expect(eloToRank(600)).toMatchObject({ tier: 'Iron', division: 1 })
  })

  it('maps 950 to Gold I', () => {
    expect(eloToRank(950)).toMatchObject({ tier: 'Gold', division: 1, name: 'Gold I' })
  })

  it('maps 1500 to Diamond I', () => {
    expect(eloToRank(1500)).toMatchObject({ tier: 'Diamond', division: 1 })
  })

  it('maps 1900 to Diamond III', () => {
    expect(eloToRank(1900)).toMatchObject({ tier: 'Diamond', division: 3 })
  })

  it('maps 2100 to Netherite with no division', () => {
    expect(eloToRank(2100)).toMatchObject({ tier: 'Netherite', division: 0, color: '#c0a0ff' })
  })

  it('treats null/missing ELO as Unrated, not the Coal floor', () => {
    expect(eloToRank(null)).toMatchObject({ tier: 'Unrated', name: 'Unrated' })
    expect(eloToRank(undefined).name).toBe('Unrated')
    // a real ELO of 0 is still Coal I (it's a rating, not "no rank")
    expect(eloToRank(0).tier).toBe('Coal')
  })

  it('builds a contiguous ladder with no gaps', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].min).toBe(RANKS[i - 1].max + 1)
    }
    expect(RANKS[0].min).toBe(0)
    expect(RANKS[RANKS.length - 1].max).toBe(Infinity)
  })
})
