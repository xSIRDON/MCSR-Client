import { describe, it, expect } from 'vitest'
import { parseJavaVersion } from './java'

describe('parseJavaVersion', () => {
  it('reads a modern version (17.0.19 -> major 17)', () => {
    expect(parseJavaVersion('openjdk version "17.0.19" 2026-04-21')).toEqual({
      version: '17.0.19',
      major: 17
    })
  })

  it('reads a legacy 1.x version (1.8.0_51 -> major 8)', () => {
    expect(parseJavaVersion('java version "1.8.0_51"')).toEqual({
      version: '1.8.0_51',
      major: 8
    })
  })

  it('reads a single-number version (21 -> major 21)', () => {
    expect(parseJavaVersion('openjdk version "21" 2025-09-16')).toEqual({
      version: '21',
      major: 21
    })
  })

  it('returns nulls when no version is present', () => {
    expect(parseJavaVersion('command not found')).toEqual({ version: null, major: null })
  })
})
