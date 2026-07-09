import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyInstanceSettings } from './copy-instance'

const temps: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'copyinst-'))
  temps.push(d)
  return d
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

function seedSrc(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'options.txt'), 'resourcePacks:["seedqueue_wall"]\n')
  writeFileSync(join(dir, 'hotbar.nbt'), 'nbt')
  mkdirSync(join(dir, 'config'), { recursive: true })
  writeFileSync(join(dir, 'config', 'standardoptions.txt'), 'x')
  mkdirSync(join(dir, 'resourcepacks'), { recursive: true })
  writeFileSync(join(dir, 'resourcepacks', 'my-seedwall.zip'), 'PK')
  mkdirSync(join(dir, 'saves', 'World1'), { recursive: true })
  writeFileSync(join(dir, 'saves', 'World1', 'level.dat'), 'lvl')
}

describe('copyInstanceSettings', () => {
  it('copies resource packs (the seedwall) alongside options/config/worlds', () => {
    const src = tmp()
    const dst = tmp()
    seedSrc(src)
    const copied = copyInstanceSettings(src, dst, { worlds: ['World1'] })
    expect(existsSync(join(dst, 'options.txt'))).toBe(true)
    expect(existsSync(join(dst, 'config', 'standardoptions.txt'))).toBe(true)
    expect(existsSync(join(dst, 'resourcepacks', 'my-seedwall.zip'))).toBe(true)
    expect(readFileSync(join(dst, 'resourcepacks', 'my-seedwall.zip'), 'utf8')).toBe('PK')
    expect(existsSync(join(dst, 'saves', 'World1', 'level.dat'))).toBe(true)
    expect(copied).toContain('resource packs')
  })

  it('merges into a target that already ships wall packs (keeps both)', () => {
    const src = tmp()
    const dst = tmp()
    seedSrc(src)
    mkdirSync(join(dst, 'resourcepacks'), { recursive: true })
    writeFileSync(join(dst, 'resourcepacks', 'bundled-wall.zip'), 'bundled')
    copyInstanceSettings(src, dst)
    expect(existsSync(join(dst, 'resourcepacks', 'bundled-wall.zip'))).toBe(true) // pre-installed kept
    expect(existsSync(join(dst, 'resourcepacks', 'my-seedwall.zip'))).toBe(true) // imported added
  })

  it('skips resource packs when the source has none', () => {
    const src = tmp()
    const dst = tmp()
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'options.txt'), 'x')
    const copied = copyInstanceSettings(src, dst)
    expect(copied).toContain('options.txt')
    expect(copied).not.toContain('resource packs')
    expect(existsSync(join(dst, 'resourcepacks'))).toBe(false)
  })
})
