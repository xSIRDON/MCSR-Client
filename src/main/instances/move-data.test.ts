import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dropPrismLinks, moveDataDir, moveTarget } from './move-data'

const made: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mcsr-move-'))
  made.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fakeData(root: string): void {
  const game = join(root, 'instances', 'ranked', '.minecraft')
  mkdirSync(join(game, 'saves', 'World 1'), { recursive: true })
  writeFileSync(join(game, 'saves', 'World 1', 'level.dat'), 'world')
  writeFileSync(join(game, 'options.txt'), 'fov:0.5')
  const prism = join(root, 'prism', 'ranked', 'instances', 'ranked')
  mkdirSync(prism, { recursive: true })
  writeFileSync(join(prism, '.mcsr-managed'), game)
  writeFileSync(join(prism, 'instance.cfg'), '[General]')
  symlinkSync(game, join(prism, '.minecraft'), 'junction')
  mkdirSync(join(root, 'tools'), { recursive: true })
  writeFileSync(join(root, 'tools', 'Ninjabrain-Bot.jar'), 'jar')
}

describe('moveTarget', () => {
  it('uses an empty folder as is and makes a subfolder in a full one', () => {
    const from = join(temp(), 'data')
    const empty = temp()
    expect(moveTarget(empty, from)).toBe(empty)
    const full = temp()
    writeFileSync(join(full, 'x.txt'), 'x')
    expect(moveTarget(full, from)).toBe(join(full, 'MCSR Client'))
  })

  it('refuses a folder inside the current one, or one that contains it', () => {
    const from = join(temp(), 'data')
    mkdirSync(from)
    expect(() => moveTarget(join(from, 'sub'), from)).toThrow(/outside/)
    expect(() => moveTarget(from, from)).toThrow(/outside/)
  })
})

describe('moveDataDir', () => {
  it('drops the prism links without touching the game files behind them', () => {
    const root = temp()
    fakeData(root)
    dropPrismLinks(root)
    expect(existsSync(join(root, 'prism', 'ranked', 'instances', 'ranked', '.minecraft'))).toBe(false)
    expect(readFileSync(join(root, 'instances', 'ranked', '.minecraft', 'options.txt'), 'utf8')).toBe('fov:0.5')
  })

  it('moves everything, saves the new location and leaves no prism link behind', async () => {
    const base = temp()
    const from = join(base, 'data')
    fakeData(from)
    const dest = join(base, 'elsewhere', 'MCSR Client')
    let committed = false
    const { leftover } = await moveDataDir(from, dest, () => {
      committed = true
    })
    expect(committed).toBe(true)
    expect(leftover).toBe(false)
    expect(existsSync(from)).toBe(false)
    expect(readFileSync(join(dest, 'instances', 'ranked', '.minecraft', 'saves', 'World 1', 'level.dat'), 'utf8')).toBe('world')
    expect(existsSync(join(dest, 'tools', 'Ninjabrain-Bot.jar'))).toBe(true)
    expect(existsSync(join(dest, 'prism', 'ranked', 'instances', 'ranked'))).toBe(false)
  })
})
