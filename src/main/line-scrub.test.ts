import { describe, expect, it } from 'vitest'
import { makeLineScrubber, redact } from './line-scrub'

describe('redact', () => {
  it('replaces every secret and ignores empty ones', () => {
    expect(redact('tok a tok b', ['tok', ''])).toBe('«redacted» a «redacted» b')
  })
})

describe('makeLineScrubber', () => {
  it('catches a secret split across two chunks', () => {
    const out: string[] = []
    const s = makeLineScrubber(['SECRET123'], (t) => out.push(t))
    s.push('launch --accessToken SEC')
    s.push('RET123 --uuid x\nnext')
    s.flush()
    expect(out.join('')).toBe('launch --accessToken «redacted» --uuid x\nnext')
    expect(out.join('')).not.toContain('SECRET')
  })

  it('passes whole lines through as they arrive', () => {
    const out: string[] = []
    const s = makeLineScrubber(['k'], (t) => out.push(t))
    s.push('one\ntwo\n')
    expect(out).toEqual(['one\ntwo\n'])
  })
})
