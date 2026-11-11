import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { preparePrismInstance } from './prism-instance'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'prism-instance-'))
  const game = join(root, 'existing ranked')
  mkdirSync(join(game, 'saves'), { recursive: true })
  writeFileSync(join(game, 'saves', 'world.dat'), 'existing world')
  return { root: join(root, 'prism'), game }
}
const info = { name: 'Ranked', minecraft: '1.16.1', loader: '0.19.2', ramMb: 4096 }

describe('Prism instance adoption', () => {
  it('uses the existing game directory without copying or deleting saves', () => {
    const { root, game } = fixture()
    const instance = preparePrismInstance(root, 'ranked', game, info, 'C:/Java/bin/javaw.exe')
    expect(realpathSync(join(instance, '.minecraft'))).toBe(realpathSync(game))
    expect(readFileSync(join(instance, '.minecraft', 'saves', 'world.dat'), 'utf8')).toBe('existing world')
    expect(JSON.parse(readFileSync(join(instance, 'mmc-pack.json'), 'utf8')).components)
      .toContainEqual({ uid: 'net.fabricmc.fabric-loader', version: '0.19.2' })
    expect(readFileSync(join(instance, 'instance.cfg'), 'utf8')).toContain('\nJavaPath=C:/Java/bin/javaw.exe\n')
    expect(readFileSync(join(instance, 'instance.cfg'), 'utf8')).toContain('\nLowMemWarning=false\n')
  })

  it('can repeat adoption and update memory without replacing game data', () => {
    const { root, game } = fixture()
    preparePrismInstance(root, 'ranked', game, info, 'C:/Java/bin/javaw.exe')
    const instance = preparePrismInstance(root, 'ranked', game, { ...info, ramMb: 6144 }, 'C:/Java/bin/javaw.exe')
    expect(readFileSync(join(instance, 'instance.cfg'), 'utf8')).toContain('MaxMemAlloc=6144')
    expect(readFileSync(join(game, 'saves', 'world.dat'), 'utf8')).toBe('existing world')
  })

  it('refuses to replace an unrelated Prism instance', () => {
    const { root, game } = fixture()
    const instance = join(root, 'instances', 'ranked')
    mkdirSync(instance, { recursive: true })
    writeFileSync(join(instance, 'instance.cfg'), 'user configuration')
    expect(() => preparePrismInstance(root, 'ranked', game, info, 'javaw')).toThrow(/unmanaged/i)
    expect(readFileSync(join(instance, 'instance.cfg'), 'utf8')).toBe('user configuration')
  })
})
