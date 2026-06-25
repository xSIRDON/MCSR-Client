import { describe, it, expect } from 'vitest'
import { msToTime, signedElo, epochToAgo, winRate } from './format'

describe('msToTime', () => {
  it('formats sub-hour times as m:ss.mmm', () => {
    expect(msToTime(754_000)).toBe('12:34.000')
    expect(msToTime(65_432)).toBe('1:05.432')
  })
  it('formats hour+ times with hours', () => {
    expect(msToTime(3_661_000)).toBe('1:01:01.000')
  })
  it('returns dash for invalid', () => {
    expect(msToTime(null)).toBe('—')
    expect(msToTime(-5)).toBe('—')
  })
})

describe('signedElo', () => {
  it('prefixes positives with +', () => expect(signedElo(12)).toBe('+12'))
  it('uses a minus sign for negatives', () => expect(signedElo(-7)).toBe('−7'))
  it('renders zero plainly', () => expect(signedElo(0)).toBe('0'))
})

describe('epochToAgo', () => {
  const now = 1_000_000
  it('reports hours', () => expect(epochToAgo(now - 7200, now)).toBe('2h ago'))
  it('reports minutes', () => expect(epochToAgo(now - 300, now)).toBe('5m ago'))
  it('reports just now under a minute', () => expect(epochToAgo(now - 10, now)).toBe('just now'))
})

describe('winRate', () => {
  it('computes a percentage', () => expect(winRate(3, 1)).toBe(75))
  it('guards divide by zero', () => expect(winRate(0, 0)).toBe(0))
})
