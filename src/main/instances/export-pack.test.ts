import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { exportPack, instanceCfg, mmcPack, packFiles } from './export-pack'

const info = { name: 'MCSR Ranked', minecraft: '1.16.1', loader: '0.16.14', ramMb: 3072 }

function tree(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'))
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), f)
  }
  return dir
}

describe('packFiles', () => {
  it('keeps mods and settings, drops game files, worlds and logs', () => {
    const dir = tree([
      'options.txt',
      'hotbar.nbt',
      'mods/atum.jar',
      'config/mcsr/standardsettings.json',
      'resourcepacks/wall.zip',
      'mcsrranked/presets/a.json',
      'mcsrranked/matches-abc.json',
      'mcsrranked/replay/1.bin',
      'saves/world/level.dat',
      'assets/indexes/1.16.json',
      'libraries/x.jar',
      'logs/latest.log',
      'hermes/state.json',
      'usercache.json',
      'Toolscreen.jar',
      'debug.log'
    ])
    expect(packFiles(dir).sort()).toEqual([
      'config/mcsr/standardsettings.json',
      'hotbar.nbt',
      'mcsrranked/presets/a.json',
      'mods/atum.jar',
      'options.txt',
      'resourcepacks/wall.zip'
    ])
  })
})

describe('pack metadata', () => {
  it('writes the name and memory into instance.cfg', () => {
    const cfg = instanceCfg(info)
    expect(cfg).toContain('name=MCSR Ranked')
    expect(cfg).toContain('MaxMemAlloc=3072')
    expect(cfg).toContain('InstanceType=OneSix')
  })

  it('lists minecraft, intermediary and the fabric loader', () => {
    const pack = JSON.parse(mmcPack(info))
    const versions = Object.fromEntries(pack.components.map((c: { uid: string; version: string }) => [c.uid, c.version]))
    expect(pack.formatVersion).toBe(1)
    expect(versions).toEqual({
      'org.lwjgl3': '3.2.2',
      'net.minecraft': '1.16.1',
      'net.fabricmc.intermediary': '1.16.1',
      'net.fabricmc.fabric-loader': '0.16.14'
    })
  })
})

describe('exportPack', () => {
  it('writes a zip with the metadata and the game folder', async () => {
    const dir = tree(['options.txt', 'mods/atum.jar', 'saves/w/level.dat'])
    const dest = join(mkdtempSync(join(tmpdir(), 'out-')), 'pack.zip')
    expect(await exportPack(dir, dest, info)).toBe(2)
    const zip = readFileSync(dest).toString('latin1')
    expect(zip.startsWith('PK')).toBe(true)
    for (const name of ['instance.cfg', 'mmc-pack.json', '.minecraft/options.txt', '.minecraft/mods/atum.jar']) {
      expect(zip).toContain(name)
    }
    expect(zip).not.toContain('level.dat')
  })
})
