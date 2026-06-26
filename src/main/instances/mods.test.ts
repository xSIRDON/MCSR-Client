import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseModFilename, listMods, setModEnabled } from './mods'

describe('parseModFilename', () => {
  it('splits name and version at the first digit-led separator', () => {
    expect(parseModFilename('mcsrranked-5.7.12+1.16.1.jar')).toEqual({
      name: 'mcsrranked',
      version: '5.7.12+1.16.1'
    })
    expect(parseModFilename('fabric-loader-0.19.2.jar')).toEqual({
      name: 'fabric-loader',
      version: '0.19.2'
    })
    expect(parseModFilename('sodium-2.5.1.jar')).toEqual({ name: 'sodium', version: '2.5.1' })
  })

  it('handles a disabled suffix and a versionless name', () => {
    expect(parseModFilename('seedqueue-1.7.1.jar.disabled')).toEqual({
      name: 'seedqueue',
      version: '1.7.1'
    })
    expect(parseModFilename('lazydfu.jar')).toEqual({ name: 'lazydfu', version: '' })
  })
})

describe('listMods + setModEnabled', () => {
  const made: string[] = []
  function tmpMods(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-mods-'))
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

  it('lists enabled and disabled jars, ignoring non-jars', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sodium-2.5.1.jar'), '')
    writeFileSync(join(dir, 'atum-2.7.2.jar.disabled'), '')
    writeFileSync(join(dir, 'notes.txt'), '')

    const mods = listMods(dir)
    expect(mods).toHaveLength(2)
    expect(mods.find((m) => m.name === 'sodium')?.enabled).toBe(true)
    expect(mods.find((m) => m.name === 'atum')?.enabled).toBe(false)
    expect(mods.find((m) => m.name === 'atum')?.file).toBe('atum-2.7.2.jar')
  })

  it('toggles a mod off and back on', () => {
    const dir = tmpMods()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'krypton-0.2.0.jar'), '')

    setModEnabled(dir, 'krypton-0.2.0.jar', false)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar'))).toBe(false)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar.disabled'))).toBe(true)
    expect(listMods(dir)[0].enabled).toBe(false)

    setModEnabled(dir, 'krypton-0.2.0.jar', true)
    expect(existsSync(join(dir, 'krypton-0.2.0.jar'))).toBe(true)
    expect(listMods(dir)[0].enabled).toBe(true)
  })

  it('returns an empty list when the folder is absent', () => {
    expect(listMods(join(tmpdir(), 'definitely-not-here-xyz'))).toEqual([])
  })
})
