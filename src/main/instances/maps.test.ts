import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitize, placeWorlds, syncMaps } from './maps'
import { MAP_CATALOG } from '../../shared/maps'

describe('sanitize', () => {
  it('strips illegal filename characters', async () => {
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
      }
    }
  })

  it('treats a zip whose root is the world (level.dat present) as one world', async () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(extract, { recursive: true })
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(extract, 'level.dat'), 'x')

    await placeWorlds(extract, saves, 'My Map')

    expect(existsSync(join(saves, 'My Map', 'level.dat'))).toBe(true)
  })

  it('places each top-level folder as its own world', async () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(join(extract, 'World A'), { recursive: true })
    mkdirSync(join(extract, 'World B'), { recursive: true })
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(extract, 'World A', 'level.dat'), 'a')
    writeFileSync(join(extract, 'World B', 'level.dat'), 'b')

    await placeWorlds(extract, saves, 'fallback')

    expect(readdirSync(saves).sort()).toEqual(['World A', 'World B'])
  })

  it('does not overwrite an existing world of the same name', async () => {
    const root = tmp()
    const extract = join(root, 'x')
    const saves = join(root, 'saves')
    mkdirSync(extract, { recursive: true })
    mkdirSync(join(saves, 'My Map'), { recursive: true })
    writeFileSync(join(saves, 'My Map', 'keep.txt'), 'original')
    writeFileSync(join(extract, 'level.dat'), 'new')

    await placeWorlds(extract, saves, 'My Map')

    expect(existsSync(join(saves, 'My Map', 'keep.txt'))).toBe(true)
    expect(existsSync(join(saves, 'My Map (2)', 'level.dat'))).toBe(true)
  })
})

describe('syncMaps', () => {
  const made: string[] = []
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('reports maps that failed to download and leaves them out of the manifest', async () => {
    const saves = mkdtempSync(join(tmpdir(), 'mcsr-sync-'))
    made.push(saves)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    const map = MAP_CATALOG[0]

    const failed = await syncMaps(saves, [map.id])

    expect(failed).toEqual([map.name])
    const manifest = JSON.parse(readFileSync(join(saves, '.mcsrclient-maps.json'), 'utf8'))
    expect(manifest).not.toHaveProperty(map.id)
  })
})
