import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitize, placeWorlds } from './maps'

describe('sanitize', () => {
  it('strips illegal filename characters', () => {
    expect(sanitize('Portal: Practice/v2')).toBe('Portal_ Practice_v2')
    expect(sanitize('   ')).toBe('world')
  })
})

describe('placeWorlds', () => {
  const made: string[] = []
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-maps-'))
    made.push(d)
    return d
  }
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  })

  it('treats a zip whose root is the world (level.dat present) as one world', () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(extract, { recursive: true })
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(extract, 'level.dat'), 'x')

    placeWorlds(extract, saves, 'My Map')

    expect(existsSync(join(saves, 'My Map', 'level.dat'))).toBe(true)
  })

  it('places each top-level folder as its own world', () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(join(extract, 'World A'), { recursive: true })
    mkdirSync(join(extract, 'World B'), { recursive: true })
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(extract, 'World A', 'level.dat'), 'a')
    writeFileSync(join(extract, 'World B', 'level.dat'), 'b')

    placeWorlds(extract, saves, 'fallback')

    expect(readdirSync(saves).sort()).toEqual(['World A', 'World B'])
  })

  it('does not overwrite an existing world of the same name', () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(extract, { recursive: true })
    mkdirSync(join(saves, 'My Map'), { recursive: true })
    writeFileSync(join(saves, 'My Map', 'keep.txt'), 'original')
    writeFileSync(join(extract, 'level.dat'), 'new')

    placeWorlds(extract, saves, 'My Map')

    expect(existsSync(join(saves, 'My Map', 'keep.txt'))).toBe(true) // untouched
    expect(existsSync(join(saves, 'My Map (2)', 'level.dat'))).toBe(true) // added alongside
  })
})
