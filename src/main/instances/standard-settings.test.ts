import { describe, it, expect } from 'vitest'
import {
  parseStandardSettings,
  mergeStandardSettings
} from './standard-settings'

describe('parseStandardSettings', () => {
  it('parses key:value lines and ignores blanks', () => {
    const txt = 'fov:1.0\n\ngamma:5.0\nguiScale:3\n'
    expect(parseStandardSettings(txt)).toEqual({ fov: '1.0', gamma: '5.0', guiScale: '3' })
  })

  it('keeps colons that appear in the value', () => {
    expect(parseStandardSettings('key:a:b:c')).toEqual({ key: 'a:b:c' })
  })
})

describe('mergeStandardSettings', () => {
  it('updates existing keys in place and preserves order + unknown keys', () => {
    const original = 'fov:1.0\ngamma:5.0\nweirdKey:keepme\n'
    const merged = mergeStandardSettings(original, { gamma: '0.0' })
    // Order preserved, gamma updated in place, weirdKey + trailing newline kept.
    expect(merged).toBe('fov:1.0\ngamma:0.0\nweirdKey:keepme\n')
  })

  it('appends keys that were not already present', () => {
    const merged = mergeStandardSettings('fov:1.0', { sensitivity: '0.5' })
    expect(parseStandardSettings(merged)).toEqual({ fov: '1.0', sensitivity: '0.5' })
  })
})
