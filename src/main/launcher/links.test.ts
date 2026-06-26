import { describe, it, expect, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join } from 'node:path'
import { removeLinkIfPresent } from './links'

// GMLL/gfsl crash the whole process (process.exit) when re-creating an instance's
// libraries/assets junction that already exists. We clear the stale junction first.
// This must remove the link WITHOUT deleting the shared data it points at.
describe('removeLinkIfPresent', () => {
  const made: string[] = []
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'mcsr-links-'))
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

  it('removes a junction/symlink but keeps the target contents intact', () => {
    const root = tmp()
    const target = join(root, 'shared-libraries')
    mkdirSync(target)
    writeFileSync(join(target, 'keep.txt'), 'precious')

    const link = join(root, 'instance-libraries')
    symlinkSync(target, link, platform() === 'win32' ? 'junction' : 'dir')
    expect(existsSync(link)).toBe(true)

    removeLinkIfPresent(link)

    expect(existsSync(link)).toBe(false) // the link is gone
    expect(existsSync(join(target, 'keep.txt'))).toBe(true) // the target survived
    expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('precious')
  })

  it('is a no-op when nothing is there', () => {
    const root = tmp()
    expect(() => removeLinkIfPresent(join(root, 'absent'))).not.toThrow()
    expect(existsSync(join(root, 'absent'))).toBe(false)
  })

  it('never deletes a real directory', () => {
    const root = tmp()
    const real = join(root, 'real')
    mkdirSync(real)
    writeFileSync(join(real, 'data.txt'), 'x')

    removeLinkIfPresent(real)

    expect(existsSync(join(real, 'data.txt'))).toBe(true) // untouched
  })
})
